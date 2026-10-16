import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/data/client";
import {
  extractionBundles,
  extractionClaims,
  extractionClaimMentions,
  extractionClaimProvenance,
  objectDomainMemberships,
  objects,
  pipelineRuns,
  pipelineRunSteps,
} from "@/data/schema";
import { getClassByKey } from "@/data/queries/registry";
import {
  extractionSubjectClaimTextsOutputSchema,
  type ExtractionClaimModalityAssignmentObject,
  type ExtractionClaimModalityAssignmentsOutput,
  type ExtractionClaimTypeAssignmentObject,
  type ExtractionClaimTypeAssignmentsOutput,
  type ExtractionDraftClaimTextObject,
  type ExtractionFinalClaimTextObject,
  type ExtractionSubjectsOutput,
  type ExtractionSubjectClaimTextObject,
  type ExtractionSubjectClaimTextsOutput,
  type ExtractionTypedClaimTextObject,
  type PipelineStep,
} from "@/domain/pipeline";
import type { LabRunDetail } from "@/domain/lab-runs";
import { getAgentExtractionContext } from "@/services/agent-context";
import { getPreparedDocument } from "@/services/documents";
import { getDomainBySlug } from "@/services/domains";
import { getLabRunDetail } from "@/services/lab-runs";
import { err, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";
import {
  explicitPassContract,
  inferredPassContract,
  modalityContract,
  subjectDiscoveryContract,
  typeAssignmentContract,
  type ExtractionDocumentContext,
  type ExtractionPromptContext,
  type ExtractionRunPromptContext,
  type ExtractionSourceUnitSidecar,
  type ExtractionSourceUnitContext,
} from "@/lib/extraction/contracts";
import {
  ExtractionModelRunnerError,
  type ExtractionModelRequest,
  type ExtractionModelResult,
  type ExtractionModelRunner,
  routedExtractionModelRunner,
} from "@/lib/extraction/model";
import { getExtractionModelCatalog } from "@/lib/extraction/model-catalog";
import type { SourceUnitRecord } from "@/domain/documents";

const maxExtractionModelRetries = 2;
const defaultExtractionModelTimeoutMs = 10 * 60 * 1000;

const extractionRunSettingsSchema = z.object({
  effort: z.string().trim().max(80).optional(),
  model: z.string().trim().min(1).optional(),
  sourceUnitIds: z.array(z.string().uuid()).optional(),
});

export type ExtractionRunSettings = z.infer<typeof extractionRunSettingsSchema>;

type StartExtractionRunOptions = {
  modelRunner?: ExtractionModelRunner;
  modelTimeoutMs?: number;
};

export type ExtractionRunResult = {
  bundleId: string;
  claimCount: number;
  explicitClaimCount: number;
  inferredClaimCount: number;
  runId: string;
};

type CreatedRun = {
  bundleId: string;
  runId: string;
  steps: Partial<Record<PipelineStep, string>>;
};

type CreateExtractionRunResult = {
  bundleId: string;
  runId: string;
};

type CancelExtractionRunResult = {
  runId: string;
};

type DeleteExtractionRunResult = {
  runId: string;
};

type ExecutionRunRow = {
  bundleId: string;
  documentId: string;
  domainId: string;
  domainSlug: string;
  id: string;
  scope: unknown;
  settings: unknown;
  status: string;
};

type ExecutionStepRow = {
  completedAt: Date | string | null;
  id: string;
  startedAt: Date | string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  step: PipelineStep;
  stepOrder: number;
};

type DraftClaimRegistryRow = ExtractionDraftClaimTextObject & {
  sourceUnitId: string;
  subjects: string[];
};

type TypedClaimRegistryRow = ExtractionTypedClaimTextObject & {
  sourceUnitId: string;
  subjects: string[];
};

type FinalClaimRegistryRow = ExtractionFinalClaimTextObject & {
  sourceUnitId: string;
  subjects: string[];
};

export type AdvanceExtractionRunResult = {
  reason:
    | "advanced"
    | "already_running"
    | "terminal"
    | "stopped"
    | "no_runnable_step";
  run: LabRunDetail;
  step: PipelineStep | null;
};

type StepCallRecord<TOutput> = {
  attempt: number;
  completedAt?: string;
  error?: string;
  finishReason?: string;
  latencyMs: number;
  output?: TOutput;
  prompt: string;
  raw: Record<string, unknown>;
  sourceUnitId: string;
  startedAt?: string;
  status?: "completed" | "failed";
  system?: string;
  tokenUsage: ExtractionModelResult<TOutput>["tokenUsage"];
};

type PendingStepCallRecord = {
  attempt: number;
  prompt: string;
  raw: Record<string, unknown>;
  sourceUnitId: string;
  startedAt: string;
  status: "awaiting_response";
  system: string;
  tokenUsage: Record<string, never>;
};

type StepExecutionResult<TOutput, TClaim> = {
  calls: StepCallRecord<TOutput>[];
  claims: TClaim[];
  inputContext: Record<string, unknown>;
  latencyMs: number;
  resultSummary: Record<string, unknown>;
  tokenUsage: Record<string, number>;
  warnings: string[];
};

function validationError(details: unknown) {
  return err("invalid_input", "Extraction input is invalid", details);
}

class ExtractionRunStoppedError extends Error {
  constructor() {
    super("Extraction run was stopped");
    this.name = "ExtractionRunStoppedError";
  }
}

function isExtractionRunStoppedError(error: unknown) {
  return error instanceof ExtractionRunStoppedError;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function timeoutMessage(timeoutMs: number) {
  return `Extraction model call timed out after ${Math.ceil(timeoutMs / 1000)}s`;
}

function isModelTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.startsWith("Extraction model call timed out after ")
  );
}

async function withModelTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage(timeoutMs)));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sourceUnitIdsFromScope(scope: unknown) {
  if (
    typeof scope === "object" &&
    scope !== null &&
    "sourceUnitIds" in scope &&
    Array.isArray(scope.sourceUnitIds)
  ) {
    return scope.sourceUnitIds.filter(
      (sourceUnitId): sourceUnitId is string =>
        typeof sourceUnitId === "string"
    );
  }

  return [];
}

async function ensureRunIsActive(runId: string) {
  const [run] = await db
    .select({ status: pipelineRuns.status })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.id, runId))
    .limit(1);

  if (!run || run.status !== "running") {
    throw new ExtractionRunStoppedError();
  }
}

function sourceUnitContext(unit: SourceUnitRecord): ExtractionSourceUnitContext {
  return {
    body: unit.body,
    contentSha256: unit.contentSha256,
    headingPath: Array.isArray(unit.headingPath)
      ? unit.headingPath.filter(
          (entry): entry is string => typeof entry === "string"
        )
      : [],
    id: unit.id,
    position: unit.position,
  };
}

function documentContext(input: {
  document: {
    contentSha256: string;
    documentForm: string;
    id: string;
    label: string;
    structuralNotes: string | null;
  };
}): ExtractionDocumentContext {
  return {
    contentSha256: input.document.contentSha256,
    documentForm: input.document.documentForm,
    id: input.document.id,
    label: input.document.label,
    structuralNotes: input.document.structuralNotes,
  };
}

function compactSourceUnitSidecar(
  unit: SourceUnitRecord
): ExtractionSourceUnitSidecar {
  return {
    contentSha256: unit.contentSha256,
    headingPath: Array.isArray(unit.headingPath) ? unit.headingPath : [],
    id: unit.id,
    position: unit.position,
    sizeBytes: unit.sizeBytes,
    unitType: unit.unitType,
  };
}

function aggregateTokenUsage(
  calls: Array<{ tokenUsage: ExtractionModelResult<unknown>["tokenUsage"] }>
) {
  const totals: Record<string, number> = {};

  for (const call of calls) {
    if (typeof call.tokenUsage !== "object" || call.tokenUsage === null) {
      continue;
    }

    for (const [key, value] of Object.entries(call.tokenUsage)) {
      if (typeof value === "number") {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }

  return totals;
}

function sumLatency(calls: Array<{ latencyMs: number }>) {
  return calls.reduce((total, call) => total + call.latencyMs, 0);
}

function retryCountForCalls<TOutput>(
  calls: StepCallRecord<TOutput>[]
) {
  return Math.max(0, ...calls.map((call) => call.attempt - 1));
}

function outputClaimCount<TOutput extends { claims: unknown[] }>(
  calls: StepCallRecord<TOutput>[]
) {
  return calls.reduce(
    (total, call) => total + (call.output?.claims.length ?? 0),
    0
  );
}

async function runModelWithRetries<TOutput>(input: {
  modelRunner: ExtractionModelRunner;
  request: ExtractionModelRequest<z.ZodType<TOutput>>;
  sourceUnitId: string;
  stepId: string;
  timeoutMs: number;
}): Promise<StepCallRecord<TOutput>[]> {
  const maxAttempts = maxExtractionModelRetries + 1;
  const calls: StepCallRecord<TOutput>[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    const startedAt = new Date().toISOString();
    const pendingCall: PendingStepCallRecord = {
      attempt,
      prompt: input.request.prompt,
      raw: {
        schemaDescription: input.request.schemaDescription,
        schemaName: input.request.schemaName,
        timeoutMs: input.timeoutMs,
      },
      sourceUnitId: input.sourceUnitId,
      startedAt,
      status: "awaiting_response",
      system: input.request.system,
      tokenUsage: {},
    };

    await persistPendingModelCall({
      calls,
      pendingCall,
      stepId: input.stepId,
    });

    try {
      const result = await withModelTimeout(
        input.modelRunner({ ...input.request, timeoutMs: input.timeoutMs }),
        input.timeoutMs
      );
      const output = input.request.schema.parse(result.object);

      calls.push({
        attempt,
        completedAt: new Date().toISOString(),
        finishReason: result.finishReason,
        latencyMs: Date.now() - started,
        output,
        prompt: input.request.prompt,
        raw: result.raw,
        sourceUnitId: input.sourceUnitId,
        startedAt,
        status: "completed",
        system: input.request.system,
        tokenUsage: result.tokenUsage,
      });
      return calls;
    } catch (error) {
      lastError = error;
      const modelError =
        error instanceof ExtractionModelRunnerError ? error : null;
      calls.push({
        attempt,
        completedAt: new Date().toISOString(),
        error: errorMessage(error),
        latencyMs: Date.now() - started,
        prompt: input.request.prompt,
        raw: modelError?.raw ?? {
          error: errorMessage(error),
          timeoutMs: input.timeoutMs,
        },
        sourceUnitId: input.sourceUnitId,
        startedAt,
        status: "failed",
        system: input.request.system,
        tokenUsage: modelError?.tokenUsage ?? {},
      });

      if (isModelTimeoutError(error) || attempt === maxAttempts) {
        return calls;
      }
    }
  }

  throw lastError;
}

async function persistPendingModelCall<TOutput>(input: {
  calls: StepCallRecord<TOutput>[];
  pendingCall: PendingStepCallRecord;
  stepId: string;
}) {
  await db
    .update(pipelineRunSteps)
    .set({
      rawOutput: {
        calls: [...input.calls, input.pendingCall],
        status: "awaiting_model_response",
      },
    })
    .where(eq(pipelineRunSteps.id, input.stepId));
}

async function createRunRecords(input: {
  documentContext: ExtractionDocumentContext;
  domainId: string;
  modelId: string;
  scope: Record<string, unknown>;
  settings: ExtractionRunSettings;
  sourceUnits: SourceUnitRecord[];
}): Promise<CommandResult<CreatedRun>> {
  const bundleClass = await getClassByKey("bundle");

  if (!bundleClass) {
    return err("registry_missing", "Bundle class is missing from the registry");
  }

  const now = new Date();

  const created = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(pipelineRuns)
      .values({
        currentStep: "subject_discovery",
        documentId: input.documentContext.id,
        domainId: input.domainId,
        scope: input.scope,
        settings: input.settings,
        startedAt: now,
        status: "running",
      })
      .returning({ id: pipelineRuns.id });

    if (!run) {
      throw new Error("Pipeline run insert failed");
    }

    const insertedSteps = await tx
      .insert(pipelineRunSteps)
      .values([
        {
          runId: run.id,
          startedAt: now,
          status: "pending",
          step: "subject_discovery",
          stepOrder: 1,
        },
        {
          runId: run.id,
          status: "pending",
          step: "explicit_pass",
          stepOrder: 2,
        },
        {
          runId: run.id,
          status: "pending",
          step: "inferred_pass",
          stepOrder: 3,
        },
        {
          runId: run.id,
          status: "pending",
          step: "type_assignment",
          stepOrder: 4,
        },
        {
          runId: run.id,
          status: "pending",
          step: "modality_classification",
          stepOrder: 5,
        },
      ])
      .returning({ id: pipelineRunSteps.id, step: pipelineRunSteps.step });

    const [bundleObject] = await tx
      .insert(objects)
      .values({ classId: bundleClass.id })
      .returning({ id: objects.id });

    if (!bundleObject) {
      throw new Error("Bundle object insert failed");
    }

    await tx.insert(objectDomainMemberships).values({
      domainId: input.domainId,
      objectId: bundleObject.id,
    });

    await tx.insert(extractionBundles).values({
      document: {
        content_sha256: input.documentContext.contentSha256,
        document_id: input.documentContext.id,
        shards: input.sourceUnits.map((unit) => ({
          content_sha256: unit.contentSha256,
          shard_id: unit.id,
        })),
      },
      documentId: input.documentContext.id,
      domainId: input.domainId,
      extractor: {
        agent: "Atlas",
        created_at: now.toISOString(),
        model: input.modelId,
        prompt_version: "bundle-v1",
      },
      id: bundleObject.id,
      label: `Extraction: ${input.documentContext.label}`,
      runId: run.id,
      status: "assembling",
    });

    return {
      bundleId: bundleObject.id,
      runId: run.id,
      steps: Object.fromEntries(
        insertedSteps.map((step) => [step.step, step.id])
      ) as Partial<Record<PipelineStep, string>>,
    };
  });

  return ok(created);
}

async function markRunStep(input: {
  currentStep: PipelineStep;
  runId: string;
  status: "running" | "failed" | "completed";
  errorMessage?: string;
}) {
  await db
    .update(pipelineRuns)
    .set({
      ...(input.status === "running" ? { completedAt: null } : {}),
      ...(input.status === "completed" ? { completedAt: new Date() } : {}),
      currentStep: input.currentStep,
      errorMessage: input.errorMessage ?? null,
      status: input.status,
    })
    .where(eq(pipelineRuns.id, input.runId));
}

async function markStepRunning(input: {
  effort?: string;
  modelId: string | null;
  promptVersion: string;
  stepId: string;
}) {
  await db
    .update(pipelineRunSteps)
    .set({
      completedAt: null,
      effort: input.effort ?? null,
      errorMessage: null,
      model: input.modelId,
      promptVersion: input.promptVersion,
      retryCount: 0,
      startedAt: new Date(),
      status: "running",
    })
    .where(eq(pipelineRunSteps.id, input.stepId));
}

async function markStepCompleted<TOutput>(input: {
  claimCount: number;
  inputContext: Record<string, unknown>;
  latencyMs: number | null;
  rawOutput: { calls?: StepCallRecord<TOutput>[] };
  resultSummary: Record<string, unknown>;
  retryCount: number;
  stepId: string;
  tokenUsage: Record<string, number>;
}) {
  await db
    .update(pipelineRunSteps)
    .set({
      claimCount: input.claimCount,
      completedAt: new Date(),
      inputContext: input.inputContext,
      latencyMs: input.latencyMs,
      rawOutput: input.rawOutput,
      resultSummary: input.resultSummary,
      retryCount: input.retryCount,
      status: "completed",
      tokenUsage: input.tokenUsage,
    })
    .where(eq(pipelineRunSteps.id, input.stepId));
}

async function markStepSkipped(input: {
  inputContext: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  stepId: string;
}) {
  await db
    .update(pipelineRunSteps)
    .set({
      completedAt: new Date(),
      inputContext: input.inputContext,
      resultSummary: input.resultSummary,
      status: "skipped",
    })
    .where(eq(pipelineRunSteps.id, input.stepId));
}

async function markStepFailed<TOutput>(input: {
  calls: StepCallRecord<TOutput>[];
  error: unknown;
  inputContext: Record<string, unknown>;
  latencyMs: number;
  retryCount: number;
  runId: string;
  step: PipelineStep;
  stepId: string;
  tokenUsage: Record<string, number>;
}) {
  const message = errorMessage(input.error);

  await db
    .update(pipelineRunSteps)
    .set({
      completedAt: new Date(),
      errorMessage: message,
      inputContext: input.inputContext,
      latencyMs: input.latencyMs,
      rawOutput: {
        calls: input.calls,
        error: message,
      },
      resultSummary: {},
      retryCount: input.retryCount,
      status: "failed",
      tokenUsage: input.tokenUsage,
    })
    .where(eq(pipelineRunSteps.id, input.stepId));

  await markRunStep({
    currentStep: input.step,
    errorMessage: message,
    runId: input.runId,
    status: "failed",
  });
}

function baseInputContext(input: {
  contractVersion: string;
  document: ExtractionDocumentContext;
  domainSlug: string;
  extractionContext: unknown;
  sourceUnits: SourceUnitRecord[];
}) {
  return {
    contractVersion: input.contractVersion,
    document: input.document,
    domainSlug: input.domainSlug,
    extractionContext: input.extractionContext,
    sourceUnits: input.sourceUnits.map(compactSourceUnitSidecar),
  };
}

async function loadStepOutputs<TOutput>(input: {
  runId: string;
  schema: z.ZodType<TOutput>;
  step: PipelineStep;
}) {
  const [step] = await db
    .select({ rawOutput: pipelineRunSteps.rawOutput })
    .from(pipelineRunSteps)
    .where(
      and(
        eq(pipelineRunSteps.runId, input.runId),
        eq(pipelineRunSteps.step, input.step),
        eq(pipelineRunSteps.status, "completed")
      )
    )
    .limit(1);

  const rawOutput = step?.rawOutput;

  if (
    typeof rawOutput !== "object" ||
    rawOutput === null ||
    !("calls" in rawOutput) ||
    !Array.isArray(rawOutput.calls)
  ) {
    return [];
  }

  return rawOutput.calls.flatMap((call) => {
    if (
      typeof call !== "object" ||
      call === null ||
      !("output" in call) ||
      !call.output
    ) {
      return [];
    }

    return [input.schema.parse(call.output)];
  });
}

function claimsFromOutputs<TClaim, TOutput extends { claims: TClaim[] }>(
  outputs: TOutput[]
) {
  return outputs.flatMap((output) => output.claims);
}

function subjectsFromOutputs(outputs: ExtractionSubjectsOutput[]) {
  return outputs.flatMap((output) => output.subjects);
}

async function loadClaimRegistryRows(input: {
  assertion: "explicit" | "inferred";
  runId: string;
  step: "explicit_pass" | "inferred_pass";
}) {
  const [step] = await db
    .select({ rawOutput: pipelineRunSteps.rawOutput })
    .from(pipelineRunSteps)
    .where(
      and(
        eq(pipelineRunSteps.runId, input.runId),
        eq(pipelineRunSteps.step, input.step),
        eq(pipelineRunSteps.status, "completed")
      )
    )
    .limit(1);

  const rawOutput = step?.rawOutput;

  if (
    typeof rawOutput !== "object" ||
    rawOutput === null ||
    !("calls" in rawOutput) ||
    !Array.isArray(rawOutput.calls)
  ) {
    return [];
  }

  return rawOutput.calls.flatMap((call): DraftClaimRegistryRow[] => {
    if (
      typeof call !== "object" ||
      call === null ||
      !("output" in call) ||
      !call.output ||
      !("sourceUnitId" in call) ||
      typeof call.sourceUnitId !== "string"
    ) {
      return [];
    }

    const parsed = extractionSubjectClaimTextsOutputSchema.safeParse(call.output);

    if (!parsed.success) {
      return [];
    }

    return parsed.data.claims.map((claim) => ({
      assertion: input.assertion,
      sourceUnitId: call.sourceUnitId,
      subjects: claim.subjects,
      text: claim.text,
    }));
  });
}

function combineDraftClaimTexts(input: {
  explicitClaims: DraftClaimRegistryRow[];
  inferredClaims: DraftClaimRegistryRow[];
}): DraftClaimRegistryRow[] {
  return [...input.explicitClaims, ...input.inferredClaims];
}

function draftClaimRows(draftClaims: DraftClaimRegistryRow[]) {
  return draftClaims.map((claim, index) => ({
    assertion: claim.assertion,
    row: index + 1,
    subjects: claim.subjects,
    text: claim.text,
  }));
}

function validateRowAssignments(input: {
  assignmentCount: number;
  label: string;
  rowCount: number;
  rows: number[];
}) {
  const issues: string[] = [];

  if (input.assignmentCount !== input.rowCount) {
    issues.push(
      `${input.label} returned ${input.assignmentCount} labels for ${input.rowCount} claim rows`
    );
  }

  const seenRows = new Set<number>();

  for (const row of input.rows) {
    if (!Number.isInteger(row) || row < 1 || row > input.rowCount) {
      issues.push(`${input.label} returned invalid row ${row}`);
      continue;
    }

    if (seenRows.has(row)) {
      issues.push(`${input.label} returned duplicate row ${row}`);
      continue;
    }

    seenRows.add(row);
  }

  for (let row = 1; row <= input.rowCount; row += 1) {
    if (!seenRows.has(row)) {
      issues.push(`${input.label} did not return row ${row}`);
      break;
    }
  }

  return issues;
}

function applyTypeAssignments(input: {
  assignments: ExtractionClaimTypeAssignmentObject[];
  draftClaims: DraftClaimRegistryRow[];
}) {
  const issues = validateRowAssignments({
    assignmentCount: input.assignments.length,
    label: "Type assignment",
    rowCount: input.draftClaims.length,
    rows: input.assignments.map((assignment) => assignment.row),
  });

  const labelsByRow = new Map(
    input.assignments.map((assignment) => [assignment.row, assignment.claimType])
  );
  const claims = input.draftClaims.flatMap((claim, index): TypedClaimRegistryRow[] => {
    const claimType = labelsByRow.get(index + 1);

    if (!claimType) {
      return [];
    }

    return [
      {
        ...claim,
        claimType,
      },
    ];
  });

  return { claims, issues };
}

function applyModalityAssignments(input: {
  assignments: ExtractionClaimModalityAssignmentObject[];
  typedClaims: TypedClaimRegistryRow[];
}) {
  const issues = validateRowAssignments({
    assignmentCount: input.assignments.length,
    label: "Modality assignment",
    rowCount: input.typedClaims.length,
    rows: input.assignments.map((assignment) => assignment.row),
  });

  const labelsByRow = new Map(
    input.assignments.map((assignment) => [assignment.row, assignment.modality])
  );
  const claims = input.typedClaims.flatMap((claim, index): FinalClaimRegistryRow[] => {
    const modality = labelsByRow.get(index + 1);

    if (!modality) {
      return [];
    }

    return [
      {
        ...claim,
        modality,
      },
    ];
  });

  return { claims, issues };
}

async function executeSubjectDiscoveryStep(input: {
  document: ExtractionDocumentContext;
  domainSlug: string;
  extractionContext: unknown;
  effort?: string;
  modelId: string;
  modelRunner: ExtractionModelRunner;
  runId: string;
  sourceUnits: SourceUnitRecord[];
  stepId: string;
  timeoutMs: number;
}) {
  const contract = subjectDiscoveryContract;
  const inputContext = baseInputContext({
    contractVersion: contract.version,
    document: input.document,
    domainSlug: input.domainSlug,
    extractionContext: input.extractionContext,
    sourceUnits: input.sourceUnits,
  });
  const promptContext: ExtractionRunPromptContext = {
    document: input.document,
    extractionContext: input.extractionContext,
    sourceUnits: input.sourceUnits.map(sourceUnitContext),
  };
  const prompt = contract.buildPrompt(promptContext);
  const calls: StepCallRecord<ExtractionSubjectsOutput>[] = [];

  try {
    await ensureRunIsActive(input.runId);
    const attempts = await runModelWithRetries({
      modelRunner: input.modelRunner,
      request: {
        effort: input.effort,
        modelId: input.modelId,
        outputExample: contract.outputExample,
        prompt,
        schema: contract.schema,
        schemaDescription: contract.schemaDescription,
        schemaName: contract.schemaName,
        system: contract.system,
      },
      sourceUnitId: "run",
      stepId: input.stepId,
      timeoutMs: input.timeoutMs,
    });
    const call = attempts.at(-1);
    calls.push(...attempts);

    if (!call?.output) {
      throw new Error(call?.error ?? "Subject discovery model call failed");
    }

    const subjects = call.output.subjects;

    await markStepCompleted({
      claimCount: subjects.length,
      inputContext,
      latencyMs: sumLatency(calls),
      rawOutput: { calls },
      resultSummary: {
        retryCount: retryCountForCalls(calls),
        sourceUnitCount: input.sourceUnits.length,
        subjectCount: subjects.length,
      },
      retryCount: retryCountForCalls(calls),
      stepId: input.stepId,
      tokenUsage: aggregateTokenUsage(calls),
    });

    return {
      calls,
      claims: subjects,
      inputContext,
      latencyMs: sumLatency(calls),
      resultSummary: {},
      tokenUsage: aggregateTokenUsage(calls),
      warnings: [],
    } satisfies StepExecutionResult<ExtractionSubjectsOutput, string>;
  } catch (error) {
    await markStepFailed({
      calls,
      error,
      inputContext,
      latencyMs: sumLatency(calls),
      retryCount: retryCountForCalls(calls),
      runId: input.runId,
      step: "subject_discovery",
      stepId: input.stepId,
      tokenUsage: aggregateTokenUsage(calls),
    });
    throw error;
  }
}

async function executeClaimDraftPass(input: {
  document: ExtractionDocumentContext;
  domainSlug: string;
  existingClaims?: ExtractionSubjectClaimTextObject[];
  extractionContext: unknown;
  effort?: string;
  modelId: string;
  modelRunner: ExtractionModelRunner;
  runId: string;
  sourceUnits: SourceUnitRecord[];
  step: "explicit_pass" | "inferred_pass";
  stepId: string;
  subjects: string[];
  timeoutMs: number;
}) {
  const contract =
    input.step === "explicit_pass" ? explicitPassContract : inferredPassContract;
  const calls: StepCallRecord<ExtractionSubjectClaimTextsOutput>[] = [];
  const claims: ExtractionSubjectClaimTextObject[] = [];
  const subjectRegistry = new Set(input.subjects);
  const inputContext = {
    ...baseInputContext({
      contractVersion: contract.version,
      document: input.document,
      domainSlug: input.domainSlug,
      extractionContext: input.extractionContext,
      sourceUnits: input.sourceUnits,
    }),
    ...(input.existingClaims ? { existingClaims: input.existingClaims } : {}),
    subjects: input.subjects,
  };

  try {
    for (const sourceUnit of input.sourceUnits) {
      await ensureRunIsActive(input.runId);
      const promptContext: ExtractionPromptContext = {
        document: input.document,
        existingClaims: input.existingClaims,
        extractionContext: input.extractionContext,
        sourceUnit: sourceUnitContext(sourceUnit),
        subjects: input.subjects,
      };
      const prompt = contract.buildPrompt(promptContext);
      const attempts = await runModelWithRetries({
        modelRunner: input.modelRunner,
        request: {
          effort: input.effort,
          modelId: input.modelId,
          outputExample: contract.outputExample,
          prompt,
          schema: contract.schema,
          schemaDescription: contract.schemaDescription,
          schemaName: contract.schemaName,
          system: contract.system,
        },
        sourceUnitId: sourceUnit.id,
        stepId: input.stepId,
        timeoutMs: input.timeoutMs,
      });
      const call = attempts.at(-1);
      calls.push(...attempts);

      if (!call?.output) {
        throw new Error(call?.error ?? "Extraction model call failed");
      }

      claims.push(
        ...call.output.claims.map((claim) => ({
          subjects: claim.subjects.filter((subject) =>
            subjectRegistry.has(subject)
          ),
          text: claim.text,
        }))
      );
    }

    const execution: StepExecutionResult<
      ExtractionSubjectClaimTextsOutput,
      ExtractionSubjectClaimTextObject
    > = {
      calls,
      claims,
      inputContext,
      latencyMs: sumLatency(calls),
      resultSummary: {
        claimCount: claims.length,
        rawClaimCount: outputClaimCount(calls),
        retryCount: retryCountForCalls(calls),
        sourceUnitCount: input.sourceUnits.length,
      },
      tokenUsage: aggregateTokenUsage(calls),
      warnings: [],
    };

    await ensureRunIsActive(input.runId);
    await markStepCompleted({
      claimCount: execution.claims.length,
      inputContext: execution.inputContext,
      latencyMs: execution.latencyMs,
      rawOutput: { calls },
      resultSummary: execution.resultSummary,
      retryCount: retryCountForCalls(calls),
      stepId: input.stepId,
      tokenUsage: execution.tokenUsage,
    });

    return execution;
  } catch (error) {
    await markStepFailed({
      calls,
      error,
      inputContext,
      latencyMs: sumLatency(calls),
      retryCount: retryCountForCalls(calls),
      runId: input.runId,
      step: input.step,
      stepId: input.stepId,
      tokenUsage: aggregateTokenUsage(calls),
    });
    throw error;
  }
}

async function insertExtractionClaims(input: {
  bundleId: string;
  claims: FinalClaimRegistryRow[];
  runStepId: string;
}) {
  for (const [index, claim] of input.claims.entries()) {
    const [inserted] = await db
      .insert(extractionClaims)
      .values({
        assertion: claim.assertion,
        bundleId: input.bundleId,
        claimId: storageClaimId(index),
        flags: [],
        kind: claim.claimType,
        modality: claim.modality,
        predicate: null,
        runStepId: input.runStepId,
        text: claim.text,
      })
      .onConflictDoNothing()
      .returning({ id: extractionClaims.id });

    if (!inserted) {
      continue;
    }

    await db.insert(extractionClaimProvenance).values({
      claimRowId: inserted.id,
      locator: {},
      position: 0,
      quote: claim.text,
      shardId: claim.sourceUnitId,
      sourceUnitId: claim.sourceUnitId,
    });

    for (const [position, subject] of claim.subjects.entries()) {
      await db.insert(extractionClaimMentions).values({
        claimRowId: inserted.id,
        kindHint: "concept",
        position,
        role: "g_subject",
        text: subject,
      });
    }
  }
}

function storageClaimId(index: number) {
  return `c${String(index + 1).padStart(3, "0")}`;
}

async function bundleIdForRun(runId: string) {
  const [bundle] = await db
    .select({ id: extractionBundles.id })
    .from(extractionBundles)
    .where(eq(extractionBundles.runId, runId))
    .limit(1);

  if (!bundle) {
    throw new Error("Extraction bundle was not found for run");
  }

  return bundle.id;
}

function selectSourceUnits(input: {
  settings: ExtractionRunSettings;
  sourceUnits: SourceUnitRecord[];
}): CommandResult<SourceUnitRecord[]> {
  const requested = input.settings.sourceUnitIds;

  if (!requested || requested.length === 0) {
    return ok(input.sourceUnits);
  }

  const requestedSet = new Set(requested);
  const selected = input.sourceUnits.filter((unit) =>
    requestedSet.has(unit.id)
  );

  if (selected.length !== requestedSet.size) {
    return err("invalid_input", "One or more source units were not found", {
      sourceUnitIds: requested,
    });
  }

  return ok(selected);
}

async function getExecutionRun(input: {
  domainSlug: string;
  runId: string;
}): Promise<
  CommandResult<{
    run: ExecutionRunRow;
    steps: ExecutionStepRow[];
  }>
> {
  const [run] = (await db.execute(sql`
    select
      pipeline_runs.id,
      pipeline_runs.domain_id as "domainId",
      domains.slug as "domainSlug",
      pipeline_runs.document_id as "documentId",
      pipeline_runs.scope,
      pipeline_runs.settings,
      pipeline_runs.status,
      extraction_bundles.id as "bundleId"
    from pipeline_runs
    join domains on domains.id = pipeline_runs.domain_id
    join extraction_bundles on extraction_bundles.run_id = pipeline_runs.id
    where domains.slug = ${input.domainSlug}
      and pipeline_runs.id = ${input.runId}
    limit 1
  `)) as unknown as ExecutionRunRow[];

  if (!run) {
    return err("not_found", "Extraction run was not found", {
      runId: input.runId,
    });
  }

  const steps = (await db.execute(sql`
    select
      id,
      step,
      step_order as "stepOrder",
      status,
      started_at as "startedAt",
      completed_at as "completedAt"
    from pipeline_run_steps
    where run_id = ${input.runId}
    order by step_order, id
  `)) as unknown as ExecutionStepRow[];

  return ok({
    run,
    steps,
  });
}

function stepIdMap(steps: ExecutionStepRow[]) {
  return Object.fromEntries(
    steps.map((step) => [step.step, step.id])
  ) as Partial<Record<PipelineStep, string>>;
}

function requiredStepId(
  steps: Partial<Record<PipelineStep, string>>,
  step: PipelineStep
) {
  const stepId = steps[step];

  if (!stepId) {
    throw new Error(`Pipeline step ${step} was not found for run`);
  }

  return stepId;
}

function nextRunnableStep(steps: ExecutionStepRow[]) {
  return steps.find(
    (step) => step.status !== "completed" && step.status !== "skipped"
  ) ?? null;
}

async function freshAdvanceResult(input: {
  domainSlug: string;
  reason: AdvanceExtractionRunResult["reason"];
  runId: string;
  step: PipelineStep | null;
}): Promise<CommandResult<AdvanceExtractionRunResult>> {
  const run = await getLabRunDetail(input.domainSlug, input.runId);

  if (!run) {
    return err("not_found", "Extraction run was not found", {
      runId: input.runId,
    });
  }

  return ok({
    reason: input.reason,
    run,
    step: input.step,
  });
}

async function executeTypeAssignmentStep(input: {
  document: ExtractionDocumentContext;
  domainSlug: string;
  draftClaims: DraftClaimRegistryRow[];
  extractionContext: unknown;
  effort?: string;
  modelId: string;
  modelRunner: ExtractionModelRunner;
  runId: string;
  sourceUnits: SourceUnitRecord[];
  stepId: string;
  timeoutMs: number;
}) {
  const contract = typeAssignmentContract;
  const inputContext = baseInputContext({
    contractVersion: contract.version,
    document: input.document,
    domainSlug: input.domainSlug,
    extractionContext: input.extractionContext,
    sourceUnits: input.sourceUnits,
  });
  const promptContext: ExtractionRunPromptContext = {
    document: input.document,
    draftClaimRows: draftClaimRows(input.draftClaims),
    extractionContext: input.extractionContext,
    sourceUnits: input.sourceUnits.map(sourceUnitContext),
  };
  const prompt = contract.buildPrompt(promptContext);
  const calls: StepCallRecord<ExtractionClaimTypeAssignmentsOutput>[] = [];

  try {
    await ensureRunIsActive(input.runId);
    const attempts = await runModelWithRetries({
      modelRunner: input.modelRunner,
      request: {
        effort: input.effort,
        modelId: input.modelId,
        outputExample: contract.outputExample,
        prompt,
        schema: contract.schema,
        schemaDescription: contract.schemaDescription,
        schemaName: contract.schemaName,
        system: contract.system,
      },
      sourceUnitId: "run",
      stepId: input.stepId,
      timeoutMs: input.timeoutMs,
    });
    const call = attempts.at(-1);
    calls.push(...attempts);

    if (!call?.output) {
      throw new Error(call?.error ?? "Type assignment model call failed");
    }

    const assignments = call.output.claims;
    const { claims, issues: validationIssues } = applyTypeAssignments({
      assignments,
      draftClaims: input.draftClaims,
    });

    if (validationIssues.length > 0) {
      throw new Error(validationIssues.join("; "));
    }

    await markStepCompleted({
      claimCount: claims.length,
      inputContext: {
        ...inputContext,
        draftClaimCount: input.draftClaims.length,
        draftClaimRows: draftClaimRows(input.draftClaims),
      },
      latencyMs: sumLatency(calls),
      rawOutput: { calls },
      resultSummary: {
        claimCount: claims.length,
        draftClaimCount: input.draftClaims.length,
        retryCount: retryCountForCalls(calls),
        typeLabelCount: assignments.length,
        validationIssueCount: 0,
      },
      retryCount: retryCountForCalls(calls),
      stepId: input.stepId,
      tokenUsage: aggregateTokenUsage(calls),
    });

    return {
      calls,
      claims,
      inputContext,
      latencyMs: sumLatency(calls),
      resultSummary: {},
      tokenUsage: aggregateTokenUsage(calls),
      warnings: [],
    } satisfies StepExecutionResult<
      ExtractionClaimTypeAssignmentsOutput,
      ExtractionTypedClaimTextObject
    >;
  } catch (error) {
    await markStepFailed({
      calls,
      error,
      inputContext,
      latencyMs: sumLatency(calls),
      retryCount: retryCountForCalls(calls),
      runId: input.runId,
      step: "type_assignment",
      stepId: input.stepId,
      tokenUsage: aggregateTokenUsage(calls),
    });
    throw error;
  }
}

async function executeModalityStep(input: {
  bundleId: string;
  document: ExtractionDocumentContext;
  domainSlug: string;
  draftClaims: DraftClaimRegistryRow[];
  extractionContext: unknown;
  effort?: string;
  modelId: string;
  modelRunner: ExtractionModelRunner;
  runId: string;
  sourceUnits: SourceUnitRecord[];
  stepId: string;
  timeoutMs: number;
  typedClaims: TypedClaimRegistryRow[];
}) {
  const contract = modalityContract;
  const inputContext = baseInputContext({
    contractVersion: contract.version,
    document: input.document,
    domainSlug: input.domainSlug,
    extractionContext: input.extractionContext,
    sourceUnits: input.sourceUnits,
  });
  const promptContext: ExtractionRunPromptContext = {
    document: input.document,
    draftClaimRows: draftClaimRows(input.draftClaims),
    extractionContext: input.extractionContext,
    sourceUnits: input.sourceUnits.map(sourceUnitContext),
  };
  const prompt = contract.buildPrompt(promptContext);
  const calls: StepCallRecord<ExtractionClaimModalityAssignmentsOutput>[] = [];

  try {
    await ensureRunIsActive(input.runId);
    const attempts = await runModelWithRetries({
      modelRunner: input.modelRunner,
      request: {
        effort: input.effort,
        modelId: input.modelId,
        outputExample: contract.outputExample,
        prompt,
        schema: contract.schema,
        schemaDescription: contract.schemaDescription,
        schemaName: contract.schemaName,
        system: contract.system,
      },
      sourceUnitId: "run",
      stepId: input.stepId,
      timeoutMs: input.timeoutMs,
    });
    const call = attempts.at(-1);
    calls.push(...attempts);

    if (!call?.output) {
      throw new Error(call?.error ?? "Modality model call failed");
    }

    const assignments = call.output.claims;
    const { claims, issues: validationIssues } = applyModalityAssignments({
      assignments,
      typedClaims: input.typedClaims,
    });

    if (validationIssues.length > 0) {
      throw new Error(validationIssues.join("; "));
    }

    await db.delete(extractionClaims).where(eq(extractionClaims.bundleId, input.bundleId));
    await insertExtractionClaims({
      bundleId: input.bundleId,
      claims,
      runStepId: input.stepId,
    });

    await markStepCompleted({
      claimCount: claims.length,
      inputContext: {
        ...inputContext,
        draftClaimCount: input.draftClaims.length,
        draftClaimRows: draftClaimRows(input.draftClaims),
        typedClaimCount: input.typedClaims.length,
      },
      latencyMs: sumLatency(calls),
      rawOutput: { calls },
      resultSummary: {
        claimCount: claims.length,
        modalityLabelCount: assignments.length,
        retryCount: retryCountForCalls(calls),
        typedClaimCount: input.typedClaims.length,
        validationIssueCount: 0,
      },
      retryCount: retryCountForCalls(calls),
      stepId: input.stepId,
      tokenUsage: aggregateTokenUsage(calls),
    });

    await db
      .update(extractionBundles)
      .set({ status: "parked" })
      .where(eq(extractionBundles.id, input.bundleId));
    await markRunStep({
      currentStep: "modality_classification",
      runId: input.runId,
      status: "completed",
    });

    return {
      calls,
      claims,
      inputContext,
      latencyMs: sumLatency(calls),
      resultSummary: {},
      tokenUsage: aggregateTokenUsage(calls),
      warnings: [],
    } satisfies StepExecutionResult<
      ExtractionClaimModalityAssignmentsOutput,
      ExtractionFinalClaimTextObject
    >;
  } catch (error) {
    await markStepFailed({
      calls,
      error,
      inputContext,
      latencyMs: sumLatency(calls),
      retryCount: retryCountForCalls(calls),
      runId: input.runId,
      step: "modality_classification",
      stepId: input.stepId,
      tokenUsage: aggregateTokenUsage(calls),
    });
    throw error;
  }
}

export async function createExtractionRun(
  domainSlug: string,
  documentId: string,
  settingsInput: ExtractionRunSettings = {}
): Promise<CommandResult<CreateExtractionRunResult>> {
  const parsed = extractionRunSettingsSchema.safeParse(settingsInput);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const settings = parsed.data;
  const [domain, preparedDocument] = await Promise.all([
    getDomainBySlug(domainSlug),
    getPreparedDocument(documentId, domainSlug),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!preparedDocument) {
    return err("not_found", "Prepared document was not found", { documentId });
  }

  if (preparedDocument.document.preparationState !== "prepared") {
    return err("invalid_input", "Document is not prepared", {
      documentId,
      preparationState: preparedDocument.document.preparationState,
    });
  }

  const selectedSourceUnits = selectSourceUnits({
    settings,
    sourceUnits: preparedDocument.sourceUnits,
  });

  if (!selectedSourceUnits.ok) {
    return selectedSourceUnits;
  }

  if (selectedSourceUnits.data.length === 0) {
    return err("invalid_input", "Document has no source units", { documentId });
  }

  const modelCatalog = await getExtractionModelCatalog();
  const modelId = settings.model ?? modelCatalog.defaultModel;
  const created = await createRunRecords({
    documentContext: documentContext({ document: preparedDocument.document }),
    domainId: domain.id,
    modelId,
    scope: {
      sourceUnitIds: selectedSourceUnits.data.map((unit) => unit.id),
    },
    settings,
    sourceUnits: selectedSourceUnits.data,
  });

  if (!created.ok) {
    return created;
  }

  return ok({
    bundleId: created.data.bundleId,
    runId: created.data.runId,
  });
}

export async function cancelExtractionRun(
  domainSlug: string,
  runId: string
): Promise<CommandResult<CancelExtractionRunResult>> {
  const executionRun = await getExecutionRun({ domainSlug, runId });

  if (!executionRun.ok) {
    return executionRun;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(pipelineRuns)
      .set({
        completedAt: now,
        errorMessage: "Stopped by user",
        status: "failed",
      })
      .where(eq(pipelineRuns.id, runId));

    await tx
      .update(pipelineRunSteps)
      .set({
        completedAt: now,
        errorMessage: "Stopped by user",
        status: "failed",
      })
      .where(
        and(
          eq(pipelineRunSteps.runId, runId),
          eq(pipelineRunSteps.status, "running")
        )
      );
  });

  return ok({ runId });
}

export async function deleteExtractionRun(
  domainSlug: string,
  runId: string
): Promise<CommandResult<DeleteExtractionRunResult>> {
  const deleted = await db.transaction(async (tx) => {
    const [scoped] = (await tx.execute(sql`
      select pipeline_runs.id, pipeline_runs.status
      from pipeline_runs
      join domains on domains.id = pipeline_runs.domain_id
      where domains.slug = ${domainSlug}
        and pipeline_runs.id = ${runId}
      limit 1
    `)) as unknown as Array<{ id: string; status: string }>;

    if (!scoped) {
      return {
        result: null,
        status: "not_found" as const,
      };
    }

    if (scoped.status === "running") {
      return {
        result: null,
        status: "running" as const,
        runStatus: scoped.status,
      };
    }

    await tx.execute(sql`
      delete from objects
      where objects.id in (
        select extraction_bundles.id
        from extraction_bundles
        where extraction_bundles.run_id = ${scoped.id}
      )
    `);

    const [row] = (await tx.execute(sql`
      delete from pipeline_runs
      where pipeline_runs.id = ${scoped.id}
      returning pipeline_runs.id
    `)) as unknown as Array<{ id: string }>;

    return {
      result: row ?? null,
      status: "deleted" as const,
    };
  });

  if (deleted.status === "running") {
    return err("invalid_input", "Stop the extraction run before deleting it", {
      domainSlug,
      runId,
      status: deleted.runStatus,
    });
  }

  if (deleted.status === "not_found" || !deleted.result) {
    return err("not_found", "Extraction run was not found", {
      domainSlug,
      runId,
    });
  }

  return ok({ runId: deleted.result.id });
}

export async function advanceExtractionRun(
  domainSlug: string,
  runId: string,
  options: StartExtractionRunOptions = {}
): Promise<CommandResult<AdvanceExtractionRunResult>> {
  const executionRun = await getExecutionRun({ domainSlug, runId });

  if (!executionRun.ok) {
    return executionRun;
  }

  const { run, steps } = executionRun.data;

  if (run.status === "completed" || run.status === "archived") {
    return freshAdvanceResult({
      domainSlug,
      reason: "terminal",
      runId,
      step: null,
    });
  }

  const runningStep = steps.find((step) => step.status === "running");

  if (runningStep) {
    return freshAdvanceResult({
      domainSlug,
      reason: "already_running",
      runId,
      step: runningStep.step,
    });
  }

  const nextStep = nextRunnableStep(steps);

  if (!nextStep) {
    return freshAdvanceResult({
      domainSlug,
      reason: "no_runnable_step",
      runId,
      step: null,
    });
  }

  if (run.status !== "running" && run.status !== "failed" && run.status !== "draft") {
    return freshAdvanceResult({
      domainSlug,
      reason: "terminal",
      runId,
      step: null,
    });
  }

  const parsedSettings = extractionRunSettingsSchema.safeParse(run.settings);

  if (!parsedSettings.success) {
    return validationError(parsedSettings.error.flatten());
  }

  const sourceUnitIds = sourceUnitIdsFromScope(run.scope);
  const settings = {
    ...parsedSettings.data,
    sourceUnitIds,
  };
  const modelCatalog = await getExtractionModelCatalog();
  const modelId = settings.model ?? modelCatalog.defaultModel;
  const modelRunner =
    options.modelRunner ?? routedExtractionModelRunner;
  const modelTimeoutMs =
    options.modelTimeoutMs ?? defaultExtractionModelTimeoutMs;
  const preparedDocument = await getPreparedDocument(run.documentId, domainSlug);

  if (!preparedDocument) {
    return err("not_found", "Prepared document was not found", {
      documentId: run.documentId,
    });
  }

  const selectedSourceUnits = selectSourceUnits({
    settings,
    sourceUnits: preparedDocument.sourceUnits,
  });

  if (!selectedSourceUnits.ok) {
    return selectedSourceUnits;
  }

  if (selectedSourceUnits.data.length === 0) {
    return err("invalid_input", "Document has no source units", {
      documentId: run.documentId,
    });
  }

  const extractionContext = await getAgentExtractionContext({
    documentId: run.documentId,
    domainSlug,
  });
  const stepIds = stepIdMap(steps);
  const docContext = documentContext({ document: preparedDocument.document });

  try {
    if (run.status !== "running") {
      await markRunStep({
        currentStep: nextStep.step,
        runId,
        status: "running",
      });
    }

    await ensureRunIsActive(runId);

    if (nextStep.step === "subject_discovery") {
      const stepId = requiredStepId(stepIds, "subject_discovery");

      await markRunStep({
        currentStep: "subject_discovery",
        runId,
        status: "running",
      });
      await markStepRunning({
        effort: settings.effort,
        modelId,
        promptVersion: subjectDiscoveryContract.version,
        stepId,
      });
      await executeSubjectDiscoveryStep({
        document: docContext,
        domainSlug,
        effort: settings.effort,
        extractionContext,
        modelId,
        modelRunner,
        runId,
        sourceUnits: selectedSourceUnits.data,
        stepId,
        timeoutMs: modelTimeoutMs,
      });

      return freshAdvanceResult({
        domainSlug,
        reason: "advanced",
        runId,
        step: nextStep.step,
      });
    }

    if (nextStep.step === "explicit_pass") {
      const stepId = requiredStepId(stepIds, "explicit_pass");
      const subjects = subjectsFromOutputs(
        await loadStepOutputs<ExtractionSubjectsOutput>({
          runId,
          schema: subjectDiscoveryContract.schema,
          step: "subject_discovery",
        })
      );

      await markRunStep({
        currentStep: "explicit_pass",
        runId,
        status: "running",
      });
      await markStepRunning({
        effort: settings.effort,
        modelId,
        promptVersion: explicitPassContract.version,
        stepId,
      });
      await executeClaimDraftPass({
        document: docContext,
        domainSlug,
        effort: settings.effort,
        extractionContext,
        modelId,
        modelRunner,
        runId,
        sourceUnits: selectedSourceUnits.data,
        step: "explicit_pass",
        stepId,
        subjects,
        timeoutMs: modelTimeoutMs,
      });

      return freshAdvanceResult({
        domainSlug,
        reason: "advanced",
        runId,
        step: nextStep.step,
      });
    }

    if (nextStep.step === "inferred_pass") {
      const stepId = requiredStepId(stepIds, "inferred_pass");
      const subjects = subjectsFromOutputs(
        await loadStepOutputs<ExtractionSubjectsOutput>({
          runId,
          schema: subjectDiscoveryContract.schema,
          step: "subject_discovery",
        })
      );
      const explicitClaims = claimsFromOutputs<
        ExtractionSubjectClaimTextObject,
        ExtractionSubjectClaimTextsOutput
      >(
        await loadStepOutputs<ExtractionSubjectClaimTextsOutput>({
          runId,
          schema: explicitPassContract.schema,
          step: "explicit_pass",
        })
      );

      await markRunStep({
        currentStep: "inferred_pass",
        runId,
        status: "running",
      });
      await markStepRunning({
        effort: settings.effort,
        modelId,
        promptVersion: inferredPassContract.version,
        stepId,
      });
      await executeClaimDraftPass({
        document: docContext,
        domainSlug,
        effort: settings.effort,
        existingClaims: explicitClaims,
        extractionContext,
        modelId,
        modelRunner,
        runId,
        sourceUnits: selectedSourceUnits.data,
        step: "inferred_pass",
        stepId,
        subjects,
        timeoutMs: modelTimeoutMs,
      });

      return freshAdvanceResult({
        domainSlug,
        reason: "advanced",
        runId,
        step: nextStep.step,
      });
    }

    if (nextStep.step === "atomization") {
      const stepId = requiredStepId(stepIds, "atomization");

      await markRunStep({
        currentStep: "atomization",
        runId,
        status: "running",
      });
      await markStepSkipped({
        inputContext: {
          reason: "Atomization archived from active extraction pipeline",
        },
        resultSummary: {
          skipped: true,
        },
        stepId,
      });

      return freshAdvanceResult({
        domainSlug,
        reason: "advanced",
        runId,
        step: nextStep.step,
      });
    }

    if (nextStep.step === "type_assignment") {
      const stepId = requiredStepId(stepIds, "type_assignment");
      const explicitClaims = await loadClaimRegistryRows({
        assertion: "explicit",
        runId,
        step: "explicit_pass",
      });
      const inferredClaims = await loadClaimRegistryRows({
        assertion: "inferred",
        runId,
        step: "inferred_pass",
      });
      const draftClaims = combineDraftClaimTexts({
        explicitClaims,
        inferredClaims,
      });

      await markRunStep({
        currentStep: "type_assignment",
        runId,
        status: "running",
      });
      await markStepRunning({
        effort: settings.effort,
        modelId,
        promptVersion: typeAssignmentContract.version,
        stepId,
      });
      await executeTypeAssignmentStep({
        document: docContext,
        domainSlug,
        draftClaims,
        effort: settings.effort,
        extractionContext,
        modelId,
        modelRunner,
        runId,
        sourceUnits: selectedSourceUnits.data,
        stepId,
        timeoutMs: modelTimeoutMs,
      });

      return freshAdvanceResult({
        domainSlug,
        reason: "advanced",
        runId,
        step: nextStep.step,
      });
    }

    if (nextStep.step === "modality_classification") {
      const explicitClaims = await loadClaimRegistryRows({
        assertion: "explicit",
        runId,
        step: "explicit_pass",
      });
      const inferredClaims = await loadClaimRegistryRows({
        assertion: "inferred",
        runId,
        step: "inferred_pass",
      });
      const draftClaims = combineDraftClaimTexts({
        explicitClaims,
        inferredClaims,
      });

      if (!stepIds.type_assignment) {
        const [insertedStep] = await db.transaction(async (tx) => {
          await tx
            .update(pipelineRunSteps)
            .set({ stepOrder: nextStep.stepOrder + 1 })
            .where(eq(pipelineRunSteps.id, nextStep.id));

          return tx
            .insert(pipelineRunSteps)
            .values({
              runId,
              status: "pending",
              step: "type_assignment",
              stepOrder: nextStep.stepOrder,
            })
            .returning({ id: pipelineRunSteps.id });
        });

        if (!insertedStep) {
          throw new Error("Type assignment step insert failed");
        }

        await markRunStep({
          currentStep: "type_assignment",
          runId,
          status: "running",
        });
        await markStepRunning({
          effort: settings.effort,
          modelId,
          promptVersion: typeAssignmentContract.version,
          stepId: insertedStep.id,
        });
        await executeTypeAssignmentStep({
          document: docContext,
          domainSlug,
          draftClaims,
          effort: settings.effort,
          extractionContext,
          modelId,
          modelRunner,
          runId,
          sourceUnits: selectedSourceUnits.data,
          stepId: insertedStep.id,
          timeoutMs: modelTimeoutMs,
        });

        return freshAdvanceResult({
          domainSlug,
          reason: "advanced",
          runId,
          step: "type_assignment",
        });
      }

      const stepId = requiredStepId(stepIds, "modality_classification");
      const typeAssignments = claimsFromOutputs<
        ExtractionClaimTypeAssignmentObject,
        ExtractionClaimTypeAssignmentsOutput
      >(
        await loadStepOutputs<ExtractionClaimTypeAssignmentsOutput>({
          runId,
          schema: typeAssignmentContract.schema,
          step: "type_assignment",
        })
      );
      const { claims: typedClaims, issues: typeIssues } = applyTypeAssignments({
        assignments: typeAssignments,
        draftClaims,
      });

      if (typeIssues.length > 0) {
        throw new Error(typeIssues.join("; "));
      }

      await markRunStep({
        currentStep: "modality_classification",
        runId,
        status: "running",
      });
      await markStepRunning({
        effort: settings.effort,
        modelId,
        promptVersion: modalityContract.version,
        stepId,
      });
      await executeModalityStep({
        bundleId: run.bundleId,
        document: docContext,
        domainSlug,
        draftClaims,
        effort: settings.effort,
        extractionContext,
        modelId,
        modelRunner,
        runId,
        sourceUnits: selectedSourceUnits.data,
        stepId,
        timeoutMs: modelTimeoutMs,
        typedClaims,
      });

      return freshAdvanceResult({
        domainSlug,
        reason: "advanced",
        runId,
        step: nextStep.step,
      });
    }

    return freshAdvanceResult({
      domainSlug,
      reason: "no_runnable_step",
      runId,
      step: nextStep.step,
    });
  } catch (error) {
    if (isExtractionRunStoppedError(error)) {
      return freshAdvanceResult({
        domainSlug,
        reason: "stopped",
        runId,
        step: nextStep.step,
      });
    }

    return err("extraction_failed", "Extraction failed", {
      message: errorMessage(error),
      runId,
    });
  }
}

export async function startExtractionRun(
  domainSlug: string,
  documentId: string,
  settingsInput: ExtractionRunSettings = {},
  options: StartExtractionRunOptions = {}
): Promise<CommandResult<ExtractionRunResult>> {
  const created = await createExtractionRun(domainSlug, documentId, settingsInput);

  if (!created.ok) {
    return created;
  }

  for (let index = 0; index < 8; index += 1) {
    const advanced = await advanceExtractionRun(
      domainSlug,
      created.data.runId,
      options
    );

    if (!advanced.ok) {
      return advanced;
    }

    if (advanced.data.run.status === "completed") {
      const counts = await loadExtractionRunClaimCounts(created.data.runId);

      return ok({
        bundleId: created.data.bundleId,
        claimCount: counts.total,
        explicitClaimCount: counts.explicit,
        inferredClaimCount: counts.inferred,
        runId: created.data.runId,
      });
    }

    if (
      advanced.data.reason !== "advanced" ||
      advanced.data.run.status === "failed"
    ) {
      return err("extraction_failed", "Extraction failed", {
        runId: created.data.runId,
        status: advanced.data.run.status,
      });
    }
  }

  return err("extraction_failed", "Extraction did not complete", {
    runId: created.data.runId,
  });
}

export async function loadExtractionRunClaimCounts(runId: string) {
  const bundleId = await bundleIdForRun(runId);
  const rows = await db
    .select({
      assertion: extractionClaims.assertion,
      id: extractionClaims.id,
    })
    .from(extractionClaims)
    .where(eq(extractionClaims.bundleId, bundleId));

  return {
    explicit: rows.filter((row) => row.assertion === "explicit").length,
    inferred: rows.filter((row) => row.assertion === "inferred").length,
    total: rows.length,
  };
}
