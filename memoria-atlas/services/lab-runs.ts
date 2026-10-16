import { sql } from "drizzle-orm";
import { db } from "@/data/client";
import type {
  LabRunDetail,
  LabRunOption,
  LabRunStartOptions,
  LabRunStartSourceUnitOption,
  LabRunStatus,
  LabRunStepStatus,
  LabRunStepView,
} from "@/domain/runs";
import { getExtractionModelCatalog } from "@/lib/extraction/model-catalog";

type LabRunRow = {
  id: string;
  domainSlug: string;
  documentId: string;
  documentLabel: string;
  status: LabRunStatus;
  currentStep: string;
  settings: unknown;
  scope: unknown;
  errorMessage: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  bundleId: string | null;
  bundleLabel: string | null;
};

type LabRunStepRow = {
  id: string;
  step: string;
  stepOrder: number;
  status: LabRunStepStatus;
  model: string | null;
  promptVersion: string | null;
  effort: string | null;
  inputContext: unknown;
  rawOutput: unknown;
  resultSummary: unknown;
  claimCount: number;
  retryCount: number;
  tokenUsage: unknown;
  latencyMs: number | null;
  cost: unknown;
  errorMessage: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
};

type LabRunStartDocumentRow = {
  id: string;
  label: string;
  preparationState: string;
  shardCount: number;
};

type LabRunStartSourceUnitRow = {
  id: string;
  documentId: string;
  position: number;
  unitType: string;
  headingPath: unknown;
  sizeBytes: number;
};

type LabRunOptionRow = {
  id: string;
  status: LabRunStatus;
  currentStep: string;
  documentLabel: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export async function getLabRunDetail(
  domainSlug: string,
  runId: string
): Promise<LabRunDetail | null> {
  const [run] = (await db.execute(sql`
    select
      pipeline_runs.id,
      domains.slug as "domainSlug",
      documents.id as "documentId",
      documents.label as "documentLabel",
      pipeline_runs.status,
      pipeline_runs.current_step as "currentStep",
      pipeline_runs.settings,
      pipeline_runs.scope,
      pipeline_runs.error_message as "errorMessage",
      pipeline_runs.started_at as "startedAt",
      pipeline_runs.completed_at as "completedAt",
      pipeline_runs.created_at as "createdAt",
      pipeline_runs.updated_at as "updatedAt",
      extraction_bundles.id as "bundleId",
      extraction_bundles.label as "bundleLabel"
    from pipeline_runs
    join domains on domains.id = pipeline_runs.domain_id
    join documents on documents.id = pipeline_runs.document_id
    left join extraction_bundles on extraction_bundles.run_id = pipeline_runs.id
    where domains.slug = ${domainSlug}
      and pipeline_runs.id = ${runId}
    limit 1
  `)) as unknown as LabRunRow[];

  if (!run) {
    return null;
  }

  const stepRows = (await db.execute(sql`
    select
      pipeline_run_steps.id,
      pipeline_run_steps.step,
      pipeline_run_steps.step_order as "stepOrder",
      pipeline_run_steps.status,
      pipeline_run_steps.model,
      pipeline_run_steps.prompt_version as "promptVersion",
      pipeline_run_steps.effort,
      pipeline_run_steps.input_context as "inputContext",
      pipeline_run_steps.raw_output as "rawOutput",
      pipeline_run_steps.result_summary as "resultSummary",
      pipeline_run_steps.claim_count as "claimCount",
      pipeline_run_steps.retry_count as "retryCount",
      pipeline_run_steps.token_usage as "tokenUsage",
      pipeline_run_steps.latency_ms as "latencyMs",
      pipeline_run_steps.cost,
      pipeline_run_steps.error_message as "errorMessage",
      pipeline_run_steps.started_at as "startedAt",
      pipeline_run_steps.completed_at as "completedAt"
    from pipeline_run_steps
    where pipeline_run_steps.run_id = ${run.id}
    order by pipeline_run_steps.step_order, pipeline_run_steps.id
  `)) as unknown as LabRunStepRow[];

  const steps = stepRows.map(toStepView);
  const workshopHref = run.bundleId
    ? `/workshop?domain=${encodeURIComponent(domainSlug)}&class=bundle&sel=${encodeURIComponent(run.bundleId)}`
    : null;

  return {
    id: run.id,
    domainSlug: run.domainSlug,
    documentId: run.documentId,
    documentLabel: run.documentLabel,
    status: run.status,
    currentStep: run.currentStep,
    settings: run.settings,
    scope: run.scope,
    errorMessage: run.errorMessage,
    startedAt: isoOrNull(run.startedAt),
    completedAt: isoOrNull(run.completedAt),
    createdAt: isoOrNull(run.createdAt) ?? "",
    updatedAt: isoOrNull(run.updatedAt) ?? "",
    bundleId: run.bundleId,
    bundleLabel: run.bundleLabel,
    workshopHref,
    steps,
    totals: {
      claimCount: runClaimCount(steps),
      costTotal: roundMetric(
        steps.reduce((total, step) => total + step.costTotal, 0)
      ),
      tokenTotal: steps.reduce((total, step) => total + step.tokenTotal, 0),
    },
  };
}

function runClaimCount(steps: LabRunStepView[]) {
  const finalStep = steps.find(
    (step) =>
      step.step === "modality_classification" && step.status === "completed"
  );

  if (finalStep) {
    return finalStep.claimCount;
  }

  const typeStep = steps.find(
    (step) => step.step === "type_assignment" && step.status === "completed"
  );

  if (typeStep) {
    return typeStep.claimCount;
  }

  return steps
    .filter(
      (step) => step.step === "explicit_pass" || step.step === "inferred_pass"
    )
    .reduce((total, step) => total + step.claimCount, 0);
}

export async function getLabRunStartOptions(
  domainSlug: string
): Promise<LabRunStartOptions> {
  const modelCatalog = await getExtractionModelCatalog();
  const documents = (await db.execute(sql`
    select
      documents.id,
      documents.label,
      documents.preparation_state as "preparationState",
      documents.shard_count as "shardCount"
    from documents
    join object_domain_memberships memberships
      on memberships.object_id = documents.id
    join domains on domains.id = memberships.domain_id
    where domains.slug = ${domainSlug}
      and memberships.membership_state = 'member'
      and documents.preparation_state = 'prepared'
    order by documents.updated_at desc, lower(documents.label), documents.id
    limit 50
  `)) as unknown as LabRunStartDocumentRow[];

  const runs = (await db.execute(sql`
    select
      pipeline_runs.id,
      pipeline_runs.status,
      pipeline_runs.current_step as "currentStep",
      documents.label as "documentLabel",
      pipeline_runs.created_at as "createdAt",
      pipeline_runs.updated_at as "updatedAt"
    from pipeline_runs
    join domains on domains.id = pipeline_runs.domain_id
    left join documents on documents.id = pipeline_runs.document_id
    where domains.slug = ${domainSlug}
      and pipeline_runs.status <> 'archived'
    order by pipeline_runs.updated_at desc, pipeline_runs.created_at desc, pipeline_runs.id
    limit 50
  `)) as unknown as LabRunOptionRow[];

  if (documents.length === 0) {
    return {
      activeRunDocumentIds: [],
      defaultModel: modelCatalog.defaultModel,
      documents: [],
      modelOptions: modelCatalog.modelOptions,
      runs: runs.map(toRunOption),
    };
  }

  const sourceUnits = (await db.execute(sql`
    select
      source_units.id,
      source_units.document_id as "documentId",
      source_units.position,
      source_units.unit_type as "unitType",
      source_units.heading_path as "headingPath",
      source_units.size_bytes as "sizeBytes"
    from source_units
    join documents on documents.id = source_units.document_id
    join object_domain_memberships memberships
      on memberships.object_id = documents.id
    join domains on domains.id = memberships.domain_id
    where domains.slug = ${domainSlug}
      and memberships.membership_state = 'member'
      and documents.preparation_state = 'prepared'
    order by source_units.document_id, source_units.position, source_units.id
  `)) as unknown as LabRunStartSourceUnitRow[];
  const activeRuns = (await db.execute(sql`
    select distinct pipeline_runs.document_id as "documentId"
    from pipeline_runs
    join domains on domains.id = pipeline_runs.domain_id
    where domains.slug = ${domainSlug}
      and pipeline_runs.status = 'running'
  `)) as unknown as Array<{ documentId: string }>;

  const unitsByDocument = new Map<string, LabRunStartSourceUnitOption[]>();

  for (const sourceUnit of sourceUnits) {
    const units = unitsByDocument.get(sourceUnit.documentId) ?? [];
    units.push(toSourceUnitOption(sourceUnit));
    unitsByDocument.set(sourceUnit.documentId, units);
  }

  return {
    activeRunDocumentIds: activeRuns.map((run) => run.documentId),
    defaultModel: modelCatalog.defaultModel,
    documents: documents.map((document) => ({
      id: document.id,
      label: document.label,
      preparationState: document.preparationState,
      shardCount: document.shardCount,
      sourceUnits: unitsByDocument.get(document.id) ?? [],
    })),
    modelOptions: modelCatalog.modelOptions,
    runs: runs.map(toRunOption),
  };
}

function toRunOption(row: LabRunOptionRow): LabRunOption {
  const documentLabel = row.documentLabel ?? "Untitled document";

  return {
    id: row.id,
    label: documentLabel,
    status: row.status,
    currentStep: row.currentStep,
    documentLabel,
    createdAt: isoOrNull(row.createdAt) ?? "",
    updatedAt: isoOrNull(row.updatedAt) ?? "",
  };
}

function toStepView(row: LabRunStepRow): LabRunStepView {
  return {
    id: row.id,
    step: row.step,
    stepOrder: row.stepOrder,
    status: row.status,
    model: row.model,
    promptVersion: row.promptVersion,
    effort: row.effort,
    claimCount: row.claimCount,
    droppedUngrounded: droppedUngrounded(row.resultSummary),
    retryCount: row.retryCount,
    tokenTotal: numericTotal(row.tokenUsage),
    latencyMs: row.latencyMs,
    costTotal: roundMetric(numericTotal(row.cost)),
    inputContext: row.inputContext,
    rawOutput: row.rawOutput,
    resultSummary: row.resultSummary,
    tokenUsage: row.tokenUsage,
    cost: row.cost,
    errorMessage: row.errorMessage,
    startedAt: isoOrNull(row.startedAt),
    completedAt: isoOrNull(row.completedAt),
  };
}

function toSourceUnitOption(
  row: LabRunStartSourceUnitRow
): LabRunStartSourceUnitOption {
  const headingPath = Array.isArray(row.headingPath)
    ? row.headingPath.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];
  const heading = headingPath.join(" / ");

  return {
    id: row.id,
    position: row.position,
    unitType: row.unitType,
    label: heading || `Source unit ${row.position + 1}`,
    sizeBytes: row.sizeBytes,
  };
}

function droppedUngrounded(value: unknown) {
  if (!isRecord(value)) {
    return 0;
  }

  const count = value.droppedUngroundedCount ?? value.droppedUngrounded;

  if (typeof count === "number" && Number.isFinite(count)) {
    return count;
  }

  if (Array.isArray(count)) {
    return count.length;
  }

  return 0;
}

function numericTotal(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.reduce<number>(
      (total, entry) => total + numericTotal(entry),
      0
    );
  }

  if (isRecord(value)) {
    return Object.values(value).reduce<number>(
      (total, entry) => total + numericTotal(entry),
      0
    );
  }

  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isoOrNull(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

function roundMetric(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
