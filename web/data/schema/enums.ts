import { pgEnum } from "drizzle-orm/pg-core";

export const assertionStateEnum = pgEnum("assertion_state", [
  "candidate",
  "accepted",
  "rejected",
  "deferred",
  "superseded",
  "review_needed",
]);

export const evidenceLinkRoleEnum = pgEnum("evidence_link_role", [
  "supports",
  "contradicts",
  "qualifies",
  "provenance",
]);

export const mapVisibilityEnum = pgEnum("map_visibility", [
  "visible",
  "hidden",
  "collapsed",
  "metadata_only",
]);

export const documentProfileStatusEnum = pgEnum("document_profile_status", [
  "ready",
  "inspection_failed",
]);

export const documentProfileConfidenceEnum = pgEnum(
  "document_profile_confidence",
  ["high", "medium", "low", "unknown"]
);

export const pipelineRunStatusEnum = pgEnum("pipeline_run_status", [
  "draft",
  "running",
  "needs_review",
  "completed",
  "failed",
  "archived",
]);

export const pipelineRunOriginEnum = pgEnum("pipeline_run_origin", [
  "extraction",
]);

export const pipelineStepEnum = pgEnum("pipeline_step", [
  "subject_discovery",
  "explicit_pass",
  "inferred_pass",
  "type_assignment",
  "atomization",
  "modality_classification",
]);

export const pipelineStepStatusEnum = pgEnum("pipeline_step_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const extractionClaimKindEnum = pgEnum("extraction_claim_kind", [
  "taxonomic",
  "structural",
  "causal",
  "functional",
  "spatial",
  "temporal",
  "attributive",
  "comparative",
]);

export const extractionModalityEnum = pgEnum("extraction_modality", [
  "empirical",
  "normative",
  "projection",
  "reported",
  "rhetorical",
]);

export const extractionAssertionEnum = pgEnum("extraction_assertion", [
  "explicit",
  "inferred",
]);

export const extractionMentionRoleEnum = pgEnum("extraction_mention_role", [
  "g_subject",
  "g_object",
  "other",
]);

export const extractionKindHintEnum = pgEnum("extraction_kind_hint", [
  "actor",
  "object",
  "concept",
  "event",
]);
