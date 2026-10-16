import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  extractionAssertionEnum,
  extractionClaimKindEnum,
  extractionKindHintEnum,
  extractionMentionRoleEnum,
  extractionModalityEnum,
  pipelineRunOriginEnum,
  pipelineRunStatusEnum,
  pipelineStepEnum,
  pipelineStepStatusEnum,
} from "./enums";
import { documents, sourceUnits } from "./documents";
import { domains } from "./domains";
import { objects } from "./objects";

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    origin: pipelineRunOriginEnum("origin").notNull().default("extraction"),
    scope: jsonb("scope").notNull().default({}),
    status: pipelineRunStatusEnum("status").notNull().default("draft"),
    currentStep: pipelineStepEnum("current_step")
      .notNull()
      .default("subject_discovery"),
    settings: jsonb("settings").notNull().default({}),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("pipeline_runs_domain_id_idx").on(table.domainId),
    index("pipeline_runs_document_id_idx").on(table.documentId),
    index("pipeline_runs_status_idx").on(table.status),
  ]
);

export const pipelineRunSteps = pgTable(
  "pipeline_run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    step: pipelineStepEnum("step").notNull(),
    stepOrder: integer("step_order").notNull(),
    status: pipelineStepStatusEnum("status").notNull().default("pending"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    effort: text("effort"),
    inputContext: jsonb("input_context").notNull().default({}),
    rawOutput: jsonb("raw_output").notNull().default({}),
    resultSummary: jsonb("result_summary").notNull().default({}),
    claimCount: integer("claim_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    tokenUsage: jsonb("token_usage").notNull().default({}),
    latencyMs: integer("latency_ms"),
    cost: jsonb("cost").notNull().default({}),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("pipeline_run_steps_run_step_unique").on(table.runId, table.step),
    index("pipeline_run_steps_run_order_idx").on(table.runId, table.stepOrder),
    index("pipeline_run_steps_status_idx").on(table.status),
  ]
);

export const extractionBundles = pgTable(
  "extraction_bundles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    schemaVersion: text("schema_version").notNull().default("bundle-v1"),
    status: text("status").notNull().default("assembling"),
    document: jsonb("document").notNull().default({}),
    extractor: jsonb("extractor").notNull().default({}),
    warnings: jsonb("warnings").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("extraction_bundles_domain_id_idx").on(table.domainId),
    index("extraction_bundles_run_id_idx").on(table.runId),
    index("extraction_bundles_document_id_idx").on(table.documentId),
    index("extraction_bundles_status_idx").on(table.status),
  ]
);

export const extractionClaims = pgTable(
  "extraction_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleId: uuid("bundle_id")
      .notNull()
      .references(() => extractionBundles.id, { onDelete: "cascade" }),
    runStepId: uuid("run_step_id").references(() => pipelineRunSteps.id, {
      onDelete: "set null",
    }),
    claimId: text("claim_id").notNull(),
    text: text("text").notNull(),
    kind: extractionClaimKindEnum("kind").notNull(),
    modality: extractionModalityEnum("modality").notNull(),
    assertion: extractionAssertionEnum("assertion").notNull(),
    predicate: text("predicate"),
    flags: jsonb("flags").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("extraction_claims_bundle_claim_unique").on(
      table.bundleId,
      table.claimId
    ),
    index("extraction_claims_bundle_id_idx").on(table.bundleId),
    index("extraction_claims_run_step_id_idx").on(table.runStepId),
    index("extraction_claims_assertion_idx").on(table.assertion),
  ]
);

export const extractionClaimMentions = pgTable(
  "extraction_claim_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimRowId: uuid("claim_row_id")
      .notNull()
      .references(() => extractionClaims.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    role: extractionMentionRoleEnum("role").notNull(),
    kindHint: extractionKindHintEnum("kind_hint").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("extraction_claim_mentions_claim_row_id_idx").on(table.claimRowId),
  ]
);

export const extractionClaimProvenance = pgTable(
  "extraction_claim_provenance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimRowId: uuid("claim_row_id")
      .notNull()
      .references(() => extractionClaims.id, { onDelete: "cascade" }),
    sourceUnitId: uuid("source_unit_id")
      .notNull()
      .references(() => sourceUnits.id, { onDelete: "cascade" }),
    shardId: text("shard_id").notNull(),
    locator: jsonb("locator").notNull().default({}),
    quote: text("quote"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("extraction_claim_provenance_claim_row_id_idx").on(table.claimRowId),
    index("extraction_claim_provenance_source_unit_id_idx").on(
      table.sourceUnitId
    ),
  ]
);

export const extractionClaimInferredFrom = pgTable(
  "extraction_claim_inferred_from",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimRowId: uuid("claim_row_id")
      .notNull()
      .references(() => extractionClaims.id, { onDelete: "cascade" }),
    sourceClaimId: text("source_claim_id").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("extraction_claim_inferred_from_claim_row_id_idx").on(
      table.claimRowId
    ),
  ]
);

export const recordProvenance = pgTable(
  "record_provenance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id").notNull(),
    recordClassKey: text("record_class_key").notNull(),
    sourceUnitId: uuid("source_unit_id").references(() => sourceUnits.id, {
      onDelete: "set null",
    }),
    runId: uuid("run_id").references(() => pipelineRuns.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("record_provenance_record_idx").on(
      table.recordClassKey,
      table.recordId
    ),
    index("record_provenance_source_unit_id_idx").on(table.sourceUnitId),
    index("record_provenance_run_id_idx").on(table.runId),
  ]
);
