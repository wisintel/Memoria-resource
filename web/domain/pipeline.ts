import { z } from "zod";
import type {
  extractionBundles,
  extractionClaimInferredFrom,
  extractionClaimMentions,
  extractionClaimProvenance,
  extractionClaims,
  pipelineRuns,
  pipelineRunSteps,
  recordProvenance,
} from "@/data/schema";

export const pipelineRunStatusValues = [
  "draft",
  "running",
  "needs_review",
  "completed",
  "failed",
  "archived",
] as const;

export const pipelineRunOriginValues = ["extraction"] as const;

export const pipelineStepValues = [
  "subject_discovery",
  "explicit_pass",
  "inferred_pass",
  "type_assignment",
  "atomization",
  "modality_classification",
] as const;

export const pipelineStepStatusValues = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
] as const;

export const extractionClaimKindValues = [
  "taxonomic",
  "structural",
  "causal",
  "functional",
  "spatial",
  "temporal",
  "attributive",
  "comparative",
] as const;

export const extractionModalityValues = [
  "empirical",
  "normative",
  "projection",
  "reported",
  "rhetorical",
] as const;

export const extractionAssertionValues = ["explicit", "inferred"] as const;

export const extractionMentionRoleValues = [
  "g_subject",
  "g_object",
  "other",
] as const;

export const extractionKindHintValues = [
  "actor",
  "object",
  "concept",
  "event",
] as const;

export const extractionFlagValues = [
  "unresolved_referent",
  "needs_split",
  "uncited_statistic",
] as const;

export const pipelineRunStatusSchema = z.enum(pipelineRunStatusValues);
export const pipelineRunOriginSchema = z.enum(pipelineRunOriginValues);
export const pipelineStepSchema = z.enum(pipelineStepValues);
export const pipelineStepStatusSchema = z.enum(pipelineStepStatusValues);
export const extractionClaimKindSchema = z.enum(extractionClaimKindValues);
export const extractionModalitySchema = z.enum(extractionModalityValues);
export const extractionAssertionSchema = z.enum(extractionAssertionValues);
export const extractionMentionRoleSchema = z.enum(extractionMentionRoleValues);
export const extractionKindHintSchema = z.enum(extractionKindHintValues);
export const extractionFlagSchema = z.enum(extractionFlagValues);

export const extractionMentionSchema = z.object({
  kind_hint: extractionKindHintSchema,
  role: extractionMentionRoleSchema,
  text: z.string().trim().min(1),
}).strict();

export const extractionLocatorSchema = z.object({
  char_end: z.number().int().nonnegative().optional(),
  char_start: z.number().int().nonnegative().optional(),
  heading_path: z.array(z.string()).default([]),
}).strict();

export const extractionProvenanceSchema = z.object({
  locator: extractionLocatorSchema,
  quote: z.string().trim().min(1).optional(),
  shard_id: z.string().trim().min(1),
}).strict();

export const extractionClaimObjectSchema = z.object({
  assertion: extractionAssertionSchema,
  claim_id: z.string().trim().min(1),
  flags: z.array(extractionFlagSchema).default([]),
  inferred_from: z.array(z.string().trim().min(1)).default([]),
  kind: extractionClaimKindSchema,
  mentions: z.array(extractionMentionSchema).default([]),
  modality: extractionModalitySchema,
  predicate: z.string().trim().min(1).optional(),
  provenance: z.array(extractionProvenanceSchema).min(1),
  text: z.string().trim().min(1),
}).strict();

export const extractionClaimDraftObjectSchema = z.object({
  assertion: extractionAssertionSchema,
  claim_id: z.string().trim().min(1),
  inferred_from: z.array(z.string().trim().min(1)).default([]),
  mentions: z.array(extractionMentionSchema).default([]),
  provenance: z.array(extractionProvenanceSchema).min(1),
  text: z.string().trim().min(1),
}).strict();

export const extractionAtomizedClaimObjectSchema = z.object({
  assertion: extractionAssertionSchema,
  claim_id: z.string().trim().min(1),
  flags: z.array(extractionFlagSchema).default([]),
  inferred_from: z.array(z.string().trim().min(1)).default([]),
  kind: extractionClaimKindSchema,
  mentions: z.array(extractionMentionSchema).default([]),
  predicate: z.string().trim().min(1).optional(),
  provenance: z.array(extractionProvenanceSchema).min(1),
  text: z.string().trim().min(1),
}).strict();

export const extractionClaimModalityObjectSchema = z.object({
  claim_id: z.string().trim().min(1),
  modality: extractionModalitySchema,
}).strict();

export const extractionClaimDraftsOutputSchema = z.object({
  claims: z.array(extractionClaimDraftObjectSchema),
  warnings: z.array(z.string().trim().min(1)).default([]),
}).strict();

export const extractionClaimTextsOutputSchema = z.object({
  claims: z.array(z.string().trim().min(1)),
}).strict();

export const extractionSubjectClaimTextSchema = z.object({
  subjects: z.array(z.string().trim().min(1)).default([]),
  text: z.string().trim().min(1),
}).strict();

export const extractionSubjectClaimTextsOutputSchema = z.object({
  claims: z.array(extractionSubjectClaimTextSchema),
}).strict();

export const extractionSubjectsOutputSchema = z.object({
  subjects: z.array(z.string().trim().min(1)),
}).strict();

export const extractionDraftClaimTextSchema = z.object({
  assertion: extractionAssertionSchema,
  text: z.string().trim().min(1),
}).strict();

export const extractionTypedClaimTextSchema = z.object({
  assertion: extractionAssertionSchema,
  claimType: extractionClaimKindSchema,
  text: z.string().trim().min(1),
}).strict();

export const extractionFinalClaimTextSchema = z.object({
  assertion: extractionAssertionSchema,
  claimType: extractionClaimKindSchema,
  modality: extractionModalitySchema,
  text: z.string().trim().min(1),
}).strict();

export const extractionClaimTypeAssignmentSchema = z.object({
  claimType: extractionClaimKindSchema,
  row: z.number().int().positive(),
}).strict();

export const extractionClaimModalityAssignmentSchema = z.object({
  modality: extractionModalitySchema,
  row: z.number().int().positive(),
}).strict();

export const extractionTypedClaimsOutputSchema = z.object({
  claims: z.array(extractionTypedClaimTextSchema),
}).strict();

export const extractionFinalClaimsOutputSchema = z.object({
  claims: z.array(extractionFinalClaimTextSchema),
}).strict();

export const extractionClaimTypeAssignmentsOutputSchema = z.object({
  claims: z.array(extractionClaimTypeAssignmentSchema),
}).strict();

export const extractionClaimModalityAssignmentsOutputSchema = z.object({
  claims: z.array(extractionClaimModalityAssignmentSchema),
}).strict();

export const extractionAtomizedClaimsOutputSchema = z.object({
  claims: z.array(extractionAtomizedClaimObjectSchema),
  warnings: z.array(z.string().trim().min(1)).default([]),
}).strict();

export const extractionClaimsOutputSchema = z.object({
  claims: z.array(extractionClaimObjectSchema),
  warnings: z.array(z.string().trim().min(1)).default([]),
}).strict();

export const extractionClaimModalitiesOutputSchema = z.object({
  claims: z.array(extractionClaimModalityObjectSchema),
  warnings: z.array(z.string().trim().min(1)).default([]),
}).strict();

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type PipelineRunStep = typeof pipelineRunSteps.$inferSelect;
export type ExtractionBundle = typeof extractionBundles.$inferSelect;
export type ExtractionClaim = typeof extractionClaims.$inferSelect;
export type ExtractionClaimMention =
  typeof extractionClaimMentions.$inferSelect;
export type ExtractionClaimProvenance =
  typeof extractionClaimProvenance.$inferSelect;
export type ExtractionClaimInferredFrom =
  typeof extractionClaimInferredFrom.$inferSelect;
export type RecordProvenance = typeof recordProvenance.$inferSelect;

export type PipelineRunStatus = z.infer<typeof pipelineRunStatusSchema>;
export type PipelineRunOrigin = z.infer<typeof pipelineRunOriginSchema>;
export type PipelineStep = z.infer<typeof pipelineStepSchema>;
export type PipelineStepStatus = z.infer<typeof pipelineStepStatusSchema>;
export type ExtractionClaimKind = z.infer<typeof extractionClaimKindSchema>;
export type ExtractionModality = z.infer<typeof extractionModalitySchema>;
export type ExtractionAssertion = z.infer<typeof extractionAssertionSchema>;
export type ExtractionMentionRole = z.infer<typeof extractionMentionRoleSchema>;
export type ExtractionKindHint = z.infer<typeof extractionKindHintSchema>;
export type ExtractionFlag = z.infer<typeof extractionFlagSchema>;
export type ExtractionMentionObject = z.infer<typeof extractionMentionSchema>;
export type ExtractionProvenanceObject = z.infer<
  typeof extractionProvenanceSchema
>;
export type ExtractionClaimDraftObject = z.infer<
  typeof extractionClaimDraftObjectSchema
>;
export type ExtractionClaimDraftsOutput = z.infer<
  typeof extractionClaimDraftsOutputSchema
>;
export type ExtractionClaimTextsOutput = z.infer<
  typeof extractionClaimTextsOutputSchema
>;
export type ExtractionSubjectClaimTextObject = z.infer<
  typeof extractionSubjectClaimTextSchema
>;
export type ExtractionSubjectClaimTextsOutput = z.infer<
  typeof extractionSubjectClaimTextsOutputSchema
>;
export type ExtractionSubjectsOutput = z.infer<
  typeof extractionSubjectsOutputSchema
>;
export type ExtractionDraftClaimTextObject = z.infer<
  typeof extractionDraftClaimTextSchema
>;
export type ExtractionTypedClaimTextObject = z.infer<
  typeof extractionTypedClaimTextSchema
>;
export type ExtractionFinalClaimTextObject = z.infer<
  typeof extractionFinalClaimTextSchema
>;
export type ExtractionClaimTypeAssignmentObject = z.infer<
  typeof extractionClaimTypeAssignmentSchema
>;
export type ExtractionClaimModalityAssignmentObject = z.infer<
  typeof extractionClaimModalityAssignmentSchema
>;
export type ExtractionTypedClaimsOutput = z.infer<
  typeof extractionTypedClaimsOutputSchema
>;
export type ExtractionFinalClaimsOutput = z.infer<
  typeof extractionFinalClaimsOutputSchema
>;
export type ExtractionClaimTypeAssignmentsOutput = z.infer<
  typeof extractionClaimTypeAssignmentsOutputSchema
>;
export type ExtractionClaimModalityAssignmentsOutput = z.infer<
  typeof extractionClaimModalityAssignmentsOutputSchema
>;
export type ExtractionAtomizedClaimObject = z.infer<
  typeof extractionAtomizedClaimObjectSchema
>;
export type ExtractionAtomizedClaimsOutput = z.infer<
  typeof extractionAtomizedClaimsOutputSchema
>;
export type ExtractionClaimModalityObject = z.infer<
  typeof extractionClaimModalityObjectSchema
>;
export type ExtractionClaimModalitiesOutput = z.infer<
  typeof extractionClaimModalitiesOutputSchema
>;
export type ExtractionClaimObject = z.infer<
  typeof extractionClaimObjectSchema
>;
export type ExtractionClaimsOutput = z.infer<
  typeof extractionClaimsOutputSchema
>;
