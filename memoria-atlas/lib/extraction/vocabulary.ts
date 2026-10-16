import type {
  extractionClaimKindValues,
  extractionModalityValues,
} from "@/domain/pipeline";

type ClaimKind = (typeof extractionClaimKindValues)[number];
type Modality = (typeof extractionModalityValues)[number];

export const claimKindGuidance = [
  ["taxonomic", "class membership / hierarchy"],
  ["structural", "part-whole composition"],
  ["causal", "one thing brings about another"],
  ["functional", "use, role, implementation"],
  ["spatial", "location, position, distance"],
  ["temporal", "when, duration, or ordering"],
  ["attributive", "property or measurement of a thing"],
  ["comparative", "relative difference between two or more things"],
] satisfies Array<[ClaimKind, string]>;

export const modalityGuidance = [
  ["empirical", "presented as observation, measurement, description, or established fact"],
  ["normative", "presented as a rule, obligation, recommendation, or value judgment"],
  ["projection", "presented as a forecast, expectation, scenario, or conditional future"],
  ["reported", "attributed by the source to another speaker, study, or organization"],
  ["rhetorical", "posed for emphasis, framing, or persuasion rather than direct assertion"],
] satisfies Array<[Modality, string]>;

export function vocabularyList<TValue extends string>(
  values: Array<[TValue, string]>
) {
  return values.map(([value]) => value).join(" | ");
}

export function vocabularyBullets<TValue extends string>(
  values: Array<[TValue, string]>
) {
  return values.map(([value, description]) => `- ${value}: ${description}`);
}
