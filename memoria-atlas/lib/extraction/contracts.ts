import type { z } from "zod";
import {
  extractionClaimModalityAssignmentsOutputSchema,
  extractionClaimTypeAssignmentsOutputSchema,
  extractionSubjectsOutputSchema,
  extractionSubjectClaimTextsOutputSchema,
  type ExtractionClaimModalityAssignmentsOutput,
  type ExtractionClaimTypeAssignmentsOutput,
  type ExtractionDraftClaimTextObject,
  type ExtractionSubjectsOutput,
  type ExtractionSubjectClaimTextObject,
  type ExtractionSubjectClaimTextsOutput,
  type PipelineStep,
} from "@/domain/pipeline";
import {
  claimKindGuidance,
  modalityGuidance,
  vocabularyBullets,
  vocabularyList,
} from "@/lib/extraction/vocabulary";

export type ExtractionSourceUnitContext = {
  body: string;
  contentSha256: string;
  headingPath: string[];
  id: string;
  position: number;
};

export type ExtractionSourceUnitSidecar = {
  contentSha256: string;
  headingPath: unknown[];
  id: string;
  position: number;
  sizeBytes: number;
  unitType: string;
};

export type ExtractionDocumentContext = {
  contentSha256: string;
  documentForm: string;
  id: string;
  label: string;
  structuralNotes: string | null;
};

export type ExtractionPromptContext = {
  document: ExtractionDocumentContext;
  extractionContext: unknown;
  existingClaims?: ExtractionSubjectClaimTextObject[];
  subjects?: string[];
  sourceUnit: ExtractionSourceUnitContext;
};

export type ExtractionRunPromptContext = {
  document: ExtractionDocumentContext;
  draftClaims?: ExtractionDraftClaimTextObject[];
  draftClaimRows?: Array<ExtractionDraftClaimTextObject & { row: number }>;
  extractionContext: unknown;
  sourceUnits: ExtractionSourceUnitContext[];
  subjects?: string[];
};

type ExtractionContract<
  TStep extends PipelineStep,
  TOutput,
  TContext,
> = {
  buildPrompt: (context: TContext) => string;
  outputExample: string;
  schema: z.ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
  step: TStep;
  system: string;
  version: string;
};

function jsonForPrompt(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function resolveSubjectRows(subjects: string[], rows: number[]) {
  return Array.from(
    new Set(
      rows.flatMap((row) => {
        const subject = subjects[row - 1];
        return subject ? [subject] : [];
      })
    )
  );
}

const claimKindList = vocabularyList(claimKindGuidance);
const subjectsOutputExample = jsonForPrompt({
  subjects: ["Subject name"],
});
const draftClaimOutputExample = jsonForPrompt({
  claims: [
    {
      subjectRows: [1],
      text: "Claim text with qualifiers.",
    },
  ],
});
const inferredDraftClaimOutputExample = jsonForPrompt({
  claims: [
    {
      subjectRows: [1],
      text: "Inferred claim text with inherited qualifiers.",
    },
  ],
});
const typeAssignmentOutputExample = jsonForPrompt({
  claims: [
    {
      claimType: "spatial",
      row: 1,
    },
  ],
});
const modalityAssignmentOutputExample = jsonForPrompt({
  claims: [
    {
      modality: "empirical",
      row: 1,
    },
  ],
});

function sourceUnitsForPrompt(sourceUnits: ExtractionSourceUnitContext[]) {
  return sourceUnits
    .map((sourceUnit) =>
      [
        `Source unit id: ${sourceUnit.id}`,
        '"""',
        sourceUnit.body,
        '"""',
      ].join("\n")
    )
    .join("\n\n");
}

function subjectRegistryForPrompt(subjects: string[]) {
  return subjects
    .map((subject, index) => `${index + 1}. ${subject}`)
    .join("\n");
}

export const subjectDiscoveryContract = {
  step: "subject_discovery",
  version: "subject-discovery-v1",
  schema: extractionSubjectsOutputSchema,
  schemaName: "subjects",
  schemaDescription:
    "Subjects, entities, concepts, or objects that the source document is substantively about.",
  outputExample: subjectsOutputExample,
  system: [
    "## Task",
    "Read the source document and identify stable named things or concepts that can carry reusable claims.",
    "",
    "## Rules",
    "- Return only subjects that the source treats as durable concepts, entities, objects, places, groups, systems, events, or processes.",
    "- Do not return every mentioned entity, list item, example, table row, citation, heading, navigation item, or one-off attribute.",
    "- Prefer subjects that the document makes multiple factual assertions about.",
    "- Prefer broader document-level subjects over narrow members unless the narrow member receives sustained discussion.",
    "- Prefer the source's own names for subjects.",
    '- Use lowercase common-noun labels for concept subjects, such as "planet" or "dwarf planet"; reserve capitalization for named actors, objects, locations, and events.',
  ].join("\n"),
  buildPrompt(context) {
    return [
      "Source document:",
      sourceUnitsForPrompt(context.sourceUnits),
      "",
      "List the document subjects.",
    ].join("\n");
  },
} satisfies ExtractionContract<
  "subject_discovery",
  ExtractionSubjectsOutput,
  ExtractionRunPromptContext
>;

export const explicitPassContract = {
  step: "explicit_pass",
  version: "explicit-claims-subject-rows-v2",
  schema: extractionSubjectClaimTextsOutputSchema,
  schemaName: "explicit_claims",
  schemaDescription:
    "Explicit source-backed claim texts with row references to the discovered subject registry.",
  outputExample: draftClaimOutputExample,
  system: [
    "## Task",
    "Read the source unit top to bottom and output one claim draft per distinct factual assertion it makes about the identified subjects. A paragraph usually contains several assertions. Tables, lists, and captions contain assertions too.",
    "",
    "## Rules",
    "- Use only what the source unit says. No outside knowledge, no inference.",
    "- Prefer the source's own wording. Keep qualifiers (time, quantity, units, conditions, scope) inside the claim text.",
    "- Make each claim atomic: one claim, one truth value.",
    "- Apply the split test: if part of the text can become a separately verifiable statement, extract it as a separate claim.",
    "- Apply the negation test: if negating the claim forces a choice about which part is denied, split it.",
    "- Apply the standalone test: each claim must make sense on its own without surrounding discourse.",
    "- Keep necessary qualifiers attached to the claim they qualify. Splitting never sheds time, quantity, units, scope, conditions, or source posture.",
    "- Decompose causal language when needed: X because Y can produce X happened, Y happened, and Y caused X when each assertion is source-backed.",
    "- Link each claim to the identified subjects it is about using their 1-based registry row numbers.",
    "- Use subject row numbers exactly as listed in the identified subjects registry.",
    "- If none of the identified subjects fits, return an empty subjectRows list for that claim.",
    "- Do not invent subject rows.",
    "- Prefer strong, source-grounded claims over weak, repetitive, or merely structural observations.",
    "- Do not turn source organization, formatting, or table/list membership into claims unless the source asserts substantive domain information through it.",
    "- Ignore claims about the document artifact itself, including tables of contents, headings, sections, charts, formatting, and navigation.",
  ].join("\n"),
  buildPrompt(context) {
    return [
      `Source unit id: ${context.sourceUnit.id}`,
      "",
      "Source unit:",
      '"""',
      context.sourceUnit.body,
      '"""',
      "",
      "Identified subjects:",
      subjectRegistryForPrompt(context.subjects ?? []),
      "",
      "List every explicit claim in this source unit as claim drafts.",
    ].join("\n");
  },
} satisfies ExtractionContract<
  "explicit_pass",
  ExtractionSubjectClaimTextsOutput,
  ExtractionPromptContext
>;

export const inferredPassContract = {
  step: "inferred_pass",
  version: "inferred-claims-subject-rows-v2",
  schema: extractionSubjectClaimTextsOutputSchema,
  schemaName: "inferred_claims",
  schemaDescription:
    "Inferred source-backed claim texts with row references to the discovered subject registry.",
  outputExample: inferredDraftClaimOutputExample,
  system: [
    "## Task",
    "Read the source unit and explicit claims, then output factual implications about the identified subjects that the source supports but does not state outright.",
    "",
    "## Rules",
    "- The implication must be visible from this source unit alone. If seeing it requires outside knowledge, omit it.",
    "- Do not restate explicit claims, broaden their scope, or complete or correct the source.",
    "- An inference inherits the qualifiers and scope of the claims it builds on.",
    "- Make each inferred claim atomic: one claim, one truth value.",
    "- Apply the split test: if part of the inference can become a separately verifiable statement, output it as a separate claim.",
    "- Apply the negation test: if negating the inferred claim forces a choice about which part is denied, split it.",
    "- Apply the standalone test: each inferred claim must make sense on its own while preserving inherited qualifiers.",
    "- Keep necessary qualifiers attached to the inferred claim they qualify. Splitting never sheds time, quantity, units, scope, conditions, or source posture.",
    "- Decompose causal implications only when the source-backed explicit claims support each component and the causal assertion itself.",
    "- Link each inferred claim to the identified subjects it is about using their 1-based registry row numbers.",
    "- Use subject row numbers exactly as listed in the identified subjects registry.",
    "- If none of the identified subjects fits, return an empty subjectRows list for that claim.",
    "- Do not invent subject rows.",
    "- Do not infer claims about the document artifact itself, including tables of contents, headings, sections, charts, formatting, and navigation.",
    "- If there are no useful inferred claims about the identified subjects, return an empty list.",
  ].join("\n"),
  buildPrompt(context) {
    return [
      `Source unit id: ${context.sourceUnit.id}`,
      "",
      "Source unit:",
      '"""',
      context.sourceUnit.body,
      '"""',
      "",
      "Identified subjects:",
      subjectRegistryForPrompt(context.subjects ?? []),
      "",
      "Explicit claim drafts:",
      jsonForPrompt(context.existingClaims ?? []),
      "",
      "List the inferred claims this source unit supports as claim drafts.",
    ].join("\n");
  },
} satisfies ExtractionContract<
  "inferred_pass",
  ExtractionSubjectClaimTextsOutput,
  ExtractionPromptContext
>;

export const typeAssignmentContract = {
  step: "type_assignment",
  version: "claim-type-assignment-labels-v1",
  schema: extractionClaimTypeAssignmentsOutputSchema,
  schemaName: "claim_type_assignments",
  schemaDescription:
    "Row-indexed claim type labels for the unified draft claim registry.",
  outputExample: typeAssignmentOutputExample,
  system: [
    "## Task",
    "Assign one claim type to each claim row.",
    "",
    "## Claim Types",
    `Use only these claim types: ${claimKindList}.`,
    "",
    "## Rules",
    "- Return one output row for every input row.",
    "- Preserve input row numbers exactly.",
    "- Use only the listed claim types.",
  ].join("\n"),
  buildPrompt(context) {
    return [
      "Claim rows:",
      jsonForPrompt(context.draftClaimRows ?? []),
      "",
      "Assign claim type to each row.",
    ].join("\n");
  },
} satisfies ExtractionContract<
  "type_assignment",
  ExtractionClaimTypeAssignmentsOutput,
  ExtractionRunPromptContext
>;

export const modalityContract = {
  step: "modality_classification",
  version: "claim-modality-labels-v2",
  schema: extractionClaimModalityAssignmentsOutputSchema,
  schemaName: "claim_modality_assignments",
  schemaDescription:
    "Row-indexed modality labels for the unified draft claim registry.",
  outputExample: modalityAssignmentOutputExample,
  system: [
    "## Task",
    "Assign one modality to each claim row.",
    "",
    "## Postures",
    ...vocabularyBullets(modalityGuidance),
    "",
    "## Rules",
    "- Return one output row for every input row.",
    "- Preserve input row numbers exactly.",
    "- Modality is how the source asserts, never whether the claim is true.",
    "- Do not use empirical just because a claim sounds factual.",
    "- Use empirical only when the source presents the claim as an observed, measured, documented, described, or established state of the world.",
    "- Use rhetorical when the source uses the claim mainly for framing, emphasis, persuasion, evaluation, or reader orientation.",
    "- Use reported when the source attributes the claim to another speaker, study, source, document, or organization.",
    "- Use normative when the claim is about what should happen, what is required, what is recommended, or what is valued.",
    "- Use projection when the claim is about what may, will, could, is expected to, is planned to, or might happen.",
    "- Use only the listed modalities.",
  ].join("\n"),
  buildPrompt(context) {
    return [
      "Claim rows:",
      jsonForPrompt(context.draftClaimRows ?? []),
      "",
      "Assign modality to each row.",
    ].join("\n");
  },
} satisfies ExtractionContract<
  "modality_classification",
  ExtractionClaimModalityAssignmentsOutput,
  ExtractionRunPromptContext
>;

export type ExtractionContractOutput =
  | { output: ExtractionSubjectsOutput; step: "subject_discovery" }
  | { output: ExtractionSubjectClaimTextsOutput; step: "explicit_pass" }
  | { output: ExtractionSubjectClaimTextsOutput; step: "inferred_pass" }
  | { output: ExtractionClaimTypeAssignmentsOutput; step: "type_assignment" }
  | {
      output: ExtractionClaimModalityAssignmentsOutput;
      step: "modality_classification";
    };
