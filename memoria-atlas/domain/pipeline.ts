import { z } from "zod";

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

const extractionClaimKindSchema = z.enum(extractionClaimKindValues);
const extractionModalitySchema = z.enum(extractionModalityValues);

const extractionSubjectClaimTextSchema = z
  .object({
    subjectRows: z.array(z.number().int().positive()).default([]),
    text: z.string().trim().min(1),
  })
  .strict();

export const extractionSubjectClaimTextsOutputSchema = z
  .object({
    claims: z.array(extractionSubjectClaimTextSchema),
  })
  .strict();

export const extractionSubjectsOutputSchema = z
  .object({
    subjects: z.array(z.string().trim().min(1)),
  })
  .strict();

const extractionClaimTypeAssignmentSchema = z
  .object({
    claimType: extractionClaimKindSchema,
    row: z.number().int().positive(),
  })
  .strict();

const extractionClaimModalityAssignmentSchema = z
  .object({
    modality: extractionModalitySchema,
    row: z.number().int().positive(),
  })
  .strict();

export const extractionClaimTypeAssignmentsOutputSchema = z
  .object({
    claims: z.array(extractionClaimTypeAssignmentSchema),
  })
  .strict();

export const extractionClaimModalityAssignmentsOutputSchema = z
  .object({
    claims: z.array(extractionClaimModalityAssignmentSchema),
  })
  .strict();

export type PipelineStep =
  | "subject_discovery"
  | "explicit_pass"
  | "inferred_pass"
  | "type_assignment"
  | "atomization"
  | "modality_classification";
type ExtractionAssertion = "explicit" | "inferred";
type ExtractionClaimKind = (typeof extractionClaimKindValues)[number];
type ExtractionModality = (typeof extractionModalityValues)[number];
export type ExtractionSubjectsOutput = z.infer<
  typeof extractionSubjectsOutputSchema
>;
export type ExtractionSubjectClaimTextObject = z.infer<
  typeof extractionSubjectClaimTextSchema
>;
export type ExtractionSubjectClaimTextsOutput = z.infer<
  typeof extractionSubjectClaimTextsOutputSchema
>;
export type ExtractionDraftClaimTextObject = {
  assertion: ExtractionAssertion;
  text: string;
};
export type ExtractionTypedClaimTextObject = ExtractionDraftClaimTextObject & {
  claimType: ExtractionClaimKind;
};
export type ExtractionFinalClaimTextObject = ExtractionTypedClaimTextObject & {
  modality: ExtractionModality;
};
export type ExtractionClaimTypeAssignmentObject = z.infer<
  typeof extractionClaimTypeAssignmentSchema
>;
export type ExtractionClaimModalityAssignmentObject = z.infer<
  typeof extractionClaimModalityAssignmentSchema
>;
export type ExtractionClaimTypeAssignmentsOutput = z.infer<
  typeof extractionClaimTypeAssignmentsOutputSchema
>;
export type ExtractionClaimModalityAssignmentsOutput = z.infer<
  typeof extractionClaimModalityAssignmentsOutputSchema
>;
