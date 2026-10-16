import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { generateObject, gateway } from "ai";
import type { LanguageModelUsage } from "ai";
import { toJSONSchema, type z } from "zod";
import {
  isCodexModelId,
  toRuntimeModelId,
} from "@/lib/extraction/model-catalog";

const defaultMacosCodexPath = "/Applications/Codex.app/Contents/Resources/codex";

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

function codexExecutablePath() {
  const configuredPath = process.env.MEMORIA_CODEX_BIN?.trim();

  if (configuredPath) {
    return configuredPath;
  }

  if (process.platform === "darwin" && existsSync(defaultMacosCodexPath)) {
    return defaultMacosCodexPath;
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

export const codexAppServerExtractionModelRunner: ExtractionModelRunner = async (
  request
) => {
  const composed = composeCodexPrompt(request);
  const result = await runCodexPrompt({
    effort: request.effort,
    model: toRuntimeModelId(request.modelId),
    prompt: composed.prompt,
    timeoutMs: request.timeoutMs,
  });
  const parseStarted = Date.now();
  let parsed: unknown;

  try {
    parsed = parseJsonObject(result.finalText);
  } catch (error) {
    throw new ExtractionModelRunnerError(errorMessage(error), {
      raw: codexRaw({
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
    throw new ExtractionModelRunnerError("Codex app-server output failed schema validation.", {
      raw: codexRaw({
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
    raw: codexRaw({
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

type CodexPromptResult = {
  diagnostics: Record<string, unknown>;
  finalText: string;
  status: string;
  threadId: string | null;
  timing: Record<string, number | null>;
  tokenUsage: Record<string, unknown>;
  tokenUsageEvents: unknown[];
  turnId: string | null;
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
    const child = spawn(codexExecutablePath(), args, {
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

async function runCodexPrompt({
  effort,
  model,
  prompt,
  timeoutMs = 600000,
}: {
  effort?: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<CodexPromptResult> {
  const cwd = resolve(process.cwd());
  const args = ["app-server"];
  const startedAt = Date.now();
  const timing: Record<string, number | null> = {
    completedMs: null,
    firstTokenMs: null,
    initializeMs: null,
    spawnMs: null,
    threadStartMs: null,
    turnStartMs: null,
  };

  if (effort && effort !== "auto") {
    args.push("-c", `model_reasoning_effort="${effort}"`);
  }

  const server = spawn(codexExecutablePath(), args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const reader = createInterface({ input: server.stdout });
  const events: Array<Record<string, unknown>> = [];
  const stderrMessages: string[] = [];
  const tokenUsageEvents: unknown[] = [];
  const pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (value: unknown) => void;
    }
  >();
  let completedTurn: Record<string, unknown> | null = null;
  let finalText = "";
  let nextId = 1;
  let threadId: string | null = null;
  let turnId: string | null = null;
  const spawned = new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("spawn", () => {
      timing.spawnMs = Date.now() - startedAt;
      resolvePromise();
    });
    server.once("error", (error) => rejectPromise(error));
  });

  const timeout = setTimeout(() => {
    cleanup();
    for (const request of pending.values()) {
      request.reject(new Error(`Codex app-server timed out after ${timeoutMs}ms`));
    }
    pending.clear();
  }, timeoutMs);

  function cleanup() {
    clearTimeout(timeout);
    reader.close();

    if (!server.killed) {
      server.kill("SIGTERM");
    }
  }

  function send(method: string, params: unknown, expectResponse = true) {
    const message: Record<string, unknown> = { method, params };

    if (!expectResponse) {
      server.stdin.write(`${JSON.stringify(message)}\n`);
      return Promise.resolve(null);
    }

    const id = nextId;
    nextId += 1;
    message.id = id;

    const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
      pending.set(id, { reject: rejectPromise, resolve: resolvePromise });
    });
    server.stdin.write(`${JSON.stringify(message)}\n`);

    return promise;
  }

  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk: string) => {
    const message = chunk.trim();

    if (message) {
      stderrMessages.push(message);
    }
  });

  reader.on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    let message: Record<string, unknown>;

    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      events.push({ line, method: "unparseable" });
      return;
    }

    if ("id" in message) {
      const id = Number(message.id);
      const pendingRequest = pending.get(id);

      if (!pendingRequest) {
        events.push({ id, method: "unexpected-response" });
        return;
      }

      pending.delete(id);

      if (isRecord(message.error)) {
        pendingRequest.reject(
          new Error(
            typeof message.error.message === "string"
              ? message.error.message
              : JSON.stringify(message.error)
          )
        );
      } else {
        pendingRequest.resolve(message.result);
      }

      return;
    }

    const method = typeof message.method === "string" ? message.method : "";
    const params = isRecord(message.params) ? message.params : {};
    events.push(summarizeCodexEvent(method, params));

    if (method === "item/agentMessage/delta") {
      timing.firstTokenMs ??= Date.now() - startedAt;
      finalText += typeof params.delta === "string" ? params.delta : "";
    }

    if (
      method === "thread/tokenUsage/updated" ||
      method === "thread/tokenUsageUpdated"
    ) {
      tokenUsageEvents.push(jsonSafe(params));
    }

    if (method === "turn/started") {
      turnId = stringOrNull((params.turn as Record<string, unknown>)?.id) ?? turnId;
    }

    if (method === "turn/completed") {
      completedTurn = isRecord(params.turn) ? params.turn : {};
      turnId = stringOrNull(completedTurn.id) ?? turnId;
    }
  });

  server.on("exit", (code, signal) => {
    for (const request of pending.values()) {
      request.reject(
        new Error(
          `Codex app-server exited before response: code=${code} signal=${signal}`
        )
      );
    }
    pending.clear();
  });

  try {
    await spawned;
    const initializeStarted = Date.now();
    await send("initialize", {
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: [
          "turn/diff/updated",
          "turn/plan/updated",
        ],
      },
      clientInfo: {
        name: "memoria_lab_codex_bridge",
        title: "Memoria Lab Codex Bridge",
        version: "0.1.0",
      },
    });
    timing.initializeMs = Date.now() - initializeStarted;
    await send("initialized", {}, false);

    const threadStarted = Date.now();
    const threadResponse = await send("thread/start", {
      approvalPolicy: "never",
      cwd,
      ephemeral: true,
      model,
      sandbox: "read-only",
    });
    timing.threadStartMs = Date.now() - threadStarted;
    threadId = threadIdFromResponse(threadResponse);

    const turnStarted = Date.now();
    await send("turn/start", {
      approvalPolicy: "never",
      cwd,
      input: [{ text: prompt, type: "text" }],
      threadId,
    });
    timing.turnStartMs = Date.now() - turnStarted;
    await waitForCodexTurn(() => completedTurn, timeoutMs);
    timing.completedMs = Date.now() - startedAt;

    const tokenUsage = latestTokenUsage(tokenUsageEvents);

    return {
      diagnostics: {
        eventCount: events.length,
        events: events.slice(0, 40),
        stderr: stderrMessages.slice(0, 5),
        stderrCount: stderrMessages.length,
      },
      finalText,
      status: turnStatus(completedTurn) ?? "completed",
      threadId,
      timing,
      tokenUsage,
      tokenUsageEvents,
      turnId,
    };
  } finally {
    cleanup();
  }
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

    throw new Error("Codex app-server did not return valid JSON.");
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

function waitForCodexTurn(
  readCompletedTurn: () => Record<string, unknown> | null,
  timeoutMs: number
) {
  const startedAt = Date.now();

  return new Promise<void>((resolvePromise, rejectPromise) => {
    const poll = () => {
      if (readCompletedTurn()) {
        resolvePromise();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        rejectPromise(
          new Error(`Timed out waiting for Codex turn after ${timeoutMs}ms`)
        );
        return;
      }

      setTimeout(poll, 100);
    };

    poll();
  });
}

function summarizeCodexEvent(method: string, params: Record<string, unknown>) {
  if (method === "item/agentMessage/delta") {
    return {
      deltaLength: typeof params.delta === "string" ? params.delta.length : 0,
      method,
    };
  }

  if (method === "turn/completed") {
    const turn = isRecord(params.turn) ? params.turn : {};

    return {
      method,
      status: stringOrNull(turn.status),
      turnId: stringOrNull(turn.id),
    };
  }

  return { method };
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

function latestTokenUsage(events: unknown[]) {
  const latestEvent = events.at(-1);

  if (!isRecord(latestEvent)) {
    return {};
  }

  return isRecord(latestEvent.tokenUsage) ? latestEvent.tokenUsage : latestEvent;
}

function turnStatus(turn: Record<string, unknown> | null) {
  return turn ? stringOrNull(turn.status) : null;
}

function codexRaw({
  composed,
  result,
  timing,
  validationError,
}: {
  composed: ReturnType<typeof composeCodexPrompt>;
  result: CodexPromptResult;
  timing: Record<string, number>;
  validationError?: unknown;
}) {
  return {
    codex: {
      diagnostics: result.diagnostics,
      promptMetrics: composed.metrics,
      status: result.status,
      threadId: result.threadId,
      timing: {
        ...result.timing,
        ...timing,
      },
      tokenUsage: result.tokenUsage,
      tokenUsageEvents: result.tokenUsageEvents,
      turnId: result.turnId,
      ...(validationError ? { validationError } : {}),
    },
    finalText: result.finalText,
  };
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

function threadIdFromResponse(value: unknown) {
  if (!isRecord(value) || !isRecord(value.thread)) {
    return null;
  }

  return stringOrNull(value.thread.id);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
