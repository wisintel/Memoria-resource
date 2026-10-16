import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateObject, gateway } from "ai";
import type { LanguageModelUsage } from "ai";
import { toJSONSchema, type z } from "zod";
import {
  isCodexModelId,
  toRuntimeModelId,
} from "@/lib/extraction/model-catalog";

const defaultMacosCodexPaths = [
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/Applications/Codex.app/Contents/Resources/codex",
];

export type ExtractionModelResult<TOutput> = {
  finishReason?: string;
  object: TOutput;
  raw: Record<string, unknown>;
  tokenUsage: LanguageModelUsage | Record<string, unknown>;
};

export type ExtractionModelRequest<TSchema extends z.ZodType> = {
  effort?: string;
  modelId: string;
  outputExample: string;
  prompt: string;
  schema: TSchema;
  schemaDescription: string;
  schemaName: string;
  system: string;
  timeoutMs?: number;
};

export type ExtractionModelRunner = <TSchema extends z.ZodType>(
  request: ExtractionModelRequest<TSchema>
) => Promise<ExtractionModelResult<z.infer<TSchema>>>;

export class ExtractionModelRunnerError extends Error {
  raw: Record<string, unknown>;
  tokenUsage: Record<string, unknown>;

  constructor(
    message: string,
    {
      raw,
      tokenUsage = {},
    }: { raw: Record<string, unknown>; tokenUsage?: Record<string, unknown> }
  ) {
    super(message);
    this.name = "ExtractionModelRunnerError";
    this.raw = raw;
    this.tokenUsage = tokenUsage;
  }
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function resolveCodexExecutablePath({
  configuredPath = process.env.MEMORIA_CODEX_BIN?.trim(),
  pathExists = existsSync,
  platform = process.platform,
}: {
  configuredPath?: string;
  pathExists?: (path: string) => boolean;
  platform?: NodeJS.Platform;
} = {}) {
  const trimmedConfiguredPath = configuredPath?.trim();

  if (trimmedConfiguredPath) {
    return trimmedConfiguredPath;
  }

  if (platform === "darwin") {
    const bundledPath = defaultMacosCodexPaths.find(pathExists);

    if (bundledPath) {
      return bundledPath;
    }
  }

  return "codex";
}

export const generateObjectExtractionModelRunner: ExtractionModelRunner = async (
  request
) => {
  const result = await generateObject({
    maxRetries: 1,
    model: gateway(toRuntimeModelId(request.modelId)),
    prompt: request.prompt,
    schema: request.schema,
    schemaDescription: request.schemaDescription,
    schemaName: request.schemaName,
    system: request.system,
    temperature: 0,
  });
  const object = request.schema.parse(result.object);

  return {
    finishReason: result.finishReason,
    object,
    raw: {
      finishReason: result.finishReason,
      providerMetadata: jsonSafe(result.providerMetadata),
      reasoning: result.reasoning,
      request: jsonSafe(result.request),
      response: jsonSafe(result.response),
      usage: jsonSafe(result.usage),
      warnings: jsonSafe(result.warnings),
    },
    tokenUsage: result.usage,
  };
};

export const routedExtractionModelRunner: ExtractionModelRunner = async (
  request
) => {
  if (isCodexModelId(request.modelId)) {
    return codexExecStructuredExtractionModelRunner(request);
  }

  return generateObjectExtractionModelRunner(request);
};

const codexExecStructuredExtractionModelRunner: ExtractionModelRunner = async (
  request
) => {
  const composed = composeCodexPrompt(request);
  const result = await runCodexExecStructured({
    effort: request.effort,
    model: toRuntimeModelId(request.modelId),
    prompt: composed.prompt,
    schema: request.schema,
    schemaName: request.schemaName,
    timeoutMs: request.timeoutMs,
  });
  const parseStarted = Date.now();
  let parsed: unknown;

  try {
    parsed = parseJsonObject(result.finalText);
  } catch (error) {
    throw new ExtractionModelRunnerError(errorMessage(error), {
      raw: codexExecRaw({
        composed,
        result,
        timing: { jsonParseMs: Date.now() - parseStarted },
      }),
      tokenUsage: result.tokenUsage,
    });
  }

  const validationStarted = Date.now();
  const validated = request.schema.safeParse(parsed);
  const schemaValidationMs = Date.now() - validationStarted;

  if (!validated.success) {
    throw new ExtractionModelRunnerError("Codex exec output failed schema validation.", {
      raw: codexExecRaw({
        composed,
        result,
        timing: {
          jsonParseMs: Date.now() - parseStarted - schemaValidationMs,
          schemaValidationMs,
        },
        validationError: validated.error.flatten(),
      }),
      tokenUsage: result.tokenUsage,
    });
  }

  return {
    finishReason: result.status,
    object: validated.data,
    raw: codexExecRaw({
      composed,
      result,
      timing: {
        jsonParseMs: Date.now() - parseStarted - schemaValidationMs,
        schemaValidationMs,
      },
    }),
    tokenUsage: result.tokenUsage,
  };
};

type CodexExecStructuredResult = {
  diagnostics: Record<string, unknown>;
  finalText: string;
  status: string;
  timing: Record<string, number | null>;
  tokenUsage: Record<string, unknown>;
};

async function runCodexExecStructured<TSchema extends z.ZodType>({
  effort,
  model,
  prompt,
  schema,
  schemaName,
  timeoutMs = 600000,
}: {
  effort?: string;
  model: string;
  prompt: string;
  schema: TSchema;
  schemaName: string;
  timeoutMs?: number;
}): Promise<CodexExecStructuredResult> {
  const startedAt = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), "memoria-codex-exec-"));
  const schemaPath = join(tempDir, `${schemaName}.schema.json`);
  const outputPath = join(tempDir, `${schemaName}.output.json`);
  const outputSchema = codexStrictOutputSchema(toJSONSchema(schema));
  const timing: Record<string, number | null> = {
    completedMs: null,
    spawnMs: null,
  };

  await writeFile(schemaPath, JSON.stringify(outputSchema, null, 2), "utf8");

  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--cd",
    tempDir,
    "--model",
    model,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "--json",
  ];

  if (effort && effort !== "auto") {
    args.push("-c", `model_reasoning_effort="${effort}"`);
  }

  args.push("-");

  try {
    const result = await runCodexExecProcess({
      args,
      cwd: tempDir,
      prompt,
      startedAt,
      timing,
      timeoutMs,
    });
    const finalText = await readFile(outputPath, "utf8");
    timing.completedMs = Date.now() - startedAt;

    return {
      diagnostics: {
        eventCount: result.events.length,
        events: result.events.slice(0, 40),
        stderr: result.stderrMessages.slice(0, 5),
        stderrCount: result.stderrMessages.length,
      },
      finalText,
      status: result.status,
      timing,
      tokenUsage: result.tokenUsage,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function runCodexExecProcess({
  args,
  cwd,
  prompt,
  startedAt,
  timing,
  timeoutMs,
}: {
  args: string[];
  cwd: string;
  prompt: string;
  startedAt: number;
  timing: Record<string, number | null>;
  timeoutMs: number;
}) {
  return new Promise<{
    events: Array<Record<string, unknown>>;
    status: string;
    stderrMessages: string[];
    tokenUsage: Record<string, unknown>;
  }>((resolvePromise, rejectPromise) => {
    const child = spawn(resolveCodexExecutablePath(), args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const events: Array<Record<string, unknown>> = [];
    const stderrMessages: string[] = [];
    let lastUsage: Record<string, unknown> = {};
    let lastErrorMessage: string | null = null;
    let status = "completed";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      finish(
        new Error(`Codex exec timed out after ${timeoutMs}ms`)
      );
    }, timeoutMs);

    function finish(error?: Error) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise({
        events,
        status,
        stderrMessages,
        tokenUsage: lastUsage,
      });
    }

    child.once("spawn", () => {
      timing.spawnMs = Date.now() - startedAt;
      child.stdin.end(prompt);
    });

    child.once("error", (error) => finish(error));

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) {
          continue;
        }

        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          events.push(summarizeCodexExecEvent(event));

          if (event.type === "turn.completed" && isRecord(event.usage)) {
            lastUsage = event.usage;
          }

          if (event.type === "error") {
            lastErrorMessage = stringOrNull(event.message) ?? JSON.stringify(event);
          }

          if (event.type === "turn.failed") {
            status = "failed";
            lastErrorMessage =
              errorMessageFromCodexExecEvent(event) ??
              lastErrorMessage ??
              JSON.stringify(event);
          }
        } catch {
          events.push({ line, type: "unparseable" });
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim();

      if (message) {
        stderrMessages.push(message);
      }
    });

    child.once("exit", (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }

      finish(
        new Error(
          [
            `Codex exec failed: code=${code} signal=${signal}`,
            lastErrorMessage ? `error=${lastErrorMessage}` : null,
            stderrMessages.length > 0
              ? `stderr=${stderrMessages.join("\n")}`
              : null,
          ]
            .filter(Boolean)
            .join(" ")
        )
      );
    });
  });
}

function composeCodexPrompt<TSchema extends z.ZodType>(
  request: ExtractionModelRequest<TSchema>
) {
  const sections = [
    {
      body: "Return only the strict JSON object requested by this extraction contract. Do not wrap it in Markdown. Do not include commentary.",
      label: "bridge_instructions",
    },
    { body: request.system, label: "system" },
    { body: request.prompt, label: "extraction_prompt" },
    {
      body: [
        `Schema name: ${request.schemaName}`,
        request.schemaDescription,
        "",
        "Output JSON shape:",
        request.outputExample,
        "",
        "Use the exact top-level keys shown above. Replace placeholder values with values from this task.",
      ].join("\n"),
      label: "output_contract",
    },
  ];
  const prompt = sections
    .flatMap((section) => [`# ${section.label}`, section.body])
    .join("\n\n");

  return {
    metrics: promptMetrics(sections),
    prompt,
  };
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return omitNullOptionals(JSON.parse(unfenced)) as unknown;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return omitNullOptionals(JSON.parse(unfenced.slice(start, end + 1))) as unknown;
    }

    throw new Error("Codex did not return valid JSON.");
  }
}

function codexStrictOutputSchema(value: unknown): unknown {
  return strictifyJsonSchema(JSON.parse(JSON.stringify(value)), false);
}

function strictifyJsonSchema(value: unknown, optionalProperty: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => strictifyJsonSchema(entry, false));
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (key === "default") {
      continue;
    }

    next[key] = strictifyJsonSchema(entry, false);
  }

  if (isRecord(next.properties)) {
    const originalRequired = Array.isArray(value.required)
      ? new Set(value.required.filter((entry): entry is string => typeof entry === "string"))
      : new Set<string>();
    const properties: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(next.properties)) {
      properties[key] = strictifyJsonSchema(entry, !originalRequired.has(key));
    }

    next.properties = properties;
    next.required = Object.keys(properties);
    next.additionalProperties = false;
  }

  if (optionalProperty) {
    return {
      anyOf: [next, { type: "null" }],
    };
  }

  return next;
}

function omitNullOptionals(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitNullOptionals);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null)
      .map(([key, entry]) => [key, omitNullOptionals(entry)])
  );
}

function summarizeCodexExecEvent(event: Record<string, unknown>) {
  const type = typeof event.type === "string" ? event.type : "unknown";

  if (type === "turn.completed") {
    return {
      type,
      usage: jsonSafe(event.usage),
    };
  }

  if (type === "turn.failed" || type === "error") {
    return {
      message: typeof event.message === "string" ? event.message : undefined,
      type,
    };
  }

  if (type.startsWith("item.")) {
    const item = isRecord(event.item) ? event.item : {};

    return {
      itemType: stringOrNull(item.type),
      status: stringOrNull(item.status),
      type,
    };
  }

  return { type };
}

function errorMessageFromCodexExecEvent(event: Record<string, unknown>) {
  if (typeof event.message === "string") {
    return event.message;
  }

  if (isRecord(event.error)) {
    if (typeof event.error.message === "string") {
      return event.error.message;
    }

    return JSON.stringify(event.error);
  }

  return null;
}

function codexExecRaw({
  composed,
  result,
  timing,
  validationError,
}: {
  composed: ReturnType<typeof composeCodexPrompt>;
  result: CodexExecStructuredResult;
  timing: Record<string, number>;
  validationError?: unknown;
}) {
  return {
    codexExec: {
      diagnostics: result.diagnostics,
      promptMetrics: composed.metrics,
      status: result.status,
      timing: {
        ...result.timing,
        ...timing,
      },
      tokenUsage: result.tokenUsage,
      ...(validationError ? { validationError } : {}),
    },
    finalText: result.finalText,
  };
}

function promptMetrics(sections: Array<{ body: string; label: string }>) {
  const sectionMetrics = sections.map((section) => ({
    chars: section.body.length,
    estimatedTokens: estimateTokens(section.body),
    label: section.label,
  }));

  return {
    sections: sectionMetrics,
    totalChars: sectionMetrics.reduce((total, section) => total + section.chars, 0),
    totalEstimatedTokens: sectionMetrics.reduce(
      (total, section) => total + section.estimatedTokens,
      0
    ),
  };
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
