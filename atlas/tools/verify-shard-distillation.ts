import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function includesAll(source: string, values: string[], label: string) {
  for (const value of values) {
    assert(source.includes(value), `${label} is missing ${value}`);
  }
}

const migration = read("supabase/migrations/20260622222432_add_shard_distillation_pipeline.sql");
const service = read("lib/server/shard-distillation.ts");
const actions = read("app/atlas/actions.ts");
const client = read("lib/supabase/client.ts");
const panel = read("components/atlas/stage/DistillationStagePanel.tsx");
const shell = read("components/atlas/shell/AtlasShell.tsx");
const shellFrame = read("components/atlas/shell/AtlasShellFrame.tsx");
const extraction = read("lib/server/knowledge-extraction.ts");

includesAll(
  migration,
  [
    "CREATE TABLE IF NOT EXISTS public.distillation_shard_runs",
    "CREATE TABLE IF NOT EXISTS public.distillation_stage_runs",
    "CREATE TABLE IF NOT EXISTS public.distillation_candidates",
    "CREATE TABLE IF NOT EXISTS public.record_sources",
    "ALTER TABLE public.distillation_shard_runs ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE public.distillation_stage_runs ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE public.distillation_candidates ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE public.record_sources ENABLE ROW LEVEL SECURITY",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON public.distillation_shard_runs TO anon, authenticated",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON public.distillation_stage_runs TO anon, authenticated",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON public.distillation_candidates TO anon, authenticated",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_sources TO anon, authenticated",
  ],
  "migration",
);

includesAll(
  migration,
  [
    "'ontology'",
    "'entities'",
    "'claims'",
    "'entity_relationships'",
    "'claim_relationships'",
    "'promotion'",
    "'entity_type'",
    "'claim_type'",
    "'relationship_type'",
    "'entity_relationship'",
    "'claim_relationship'",
    "'supports'",
    "'mentions'",
    "'inferred_from'",
  ],
  "migration enums",
);

const stageOrderMatch = service.match(/const shardDistillationStages:[\s\S]*?\];/);
assert(stageOrderMatch, "service is missing shardDistillationStages");
const stageOrder = [
  'id: "ontology", order: 1',
  'id: "entities", order: 2',
  'id: "claims", order: 3',
  'id: "entity_relationships", order: 4',
  'id: "claim_relationships", order: 5',
  'id: "promotion", order: 6',
];
includesAll(stageOrderMatch[0], stageOrder, "stage order");

includesAll(
  service,
  [
    "Ontology is managed through Eve now.",
    'status: stage.id === "ontology" ? "skipped" : "pending"',
    "runEntityDiscovery(input)",
    "runClaimDiscovery(input)",
    "runEntityRelationshipDiscovery(input)",
    "runClaimRelationshipDiscovery(input)",
    "runPromotionReview(input)",
    "approveOntologyTypeCandidate(candidate)",
    "approveEntityCandidate(candidate, input.action)",
    "approveClaimCandidate(candidate)",
    "approveRelationshipCandidate(candidate)",
    "approvePromotionCandidate(candidate)",
    "createEntityCommand",
    "createClaimCommand",
    "createRelationshipCommand",
    '"approve_canon"',
    '"approve_proposed"',
    'approval_action: "approve_promotion"',
    "record_sources",
  ],
  "service behavior",
);

includesAll(
  actions,
  [
    "export async function createShardDistillationRun",
    "export async function runShardDistillationStage",
    "export async function reviewShardDistillationCandidate",
  ],
  "server actions",
);

for (const oldAction of [
  "export async function runAtlasClaimExtraction",
  "export async function runAtlasEntitySuggestion",
  "export async function runAtlasInferredClaimExtraction",
  "export async function runAtlasRelationshipSuggestion",
  "export async function approveDistillationClaim",
  "export async function rejectDistillationClaim",
  "export async function resolveDistillationEntityCandidate",
  "export async function deleteDistillationRun",
]) {
  assert(!actions.includes(oldAction), `actions still exports old document-level action ${oldAction}`);
}

includesAll(
  client,
  [
    "export type DistillationShardRunStatus",
    "export type DistillationPipelineStage",
    "export type DistillationCandidateKind",
    "export type RecordSourceEvidenceKind",
    "distillation_shard_runs:",
    "distillation_stage_runs:",
    "distillation_candidates:",
    "record_sources:",
  ],
  "client types",
);

includesAll(
  extraction,
  [
    "generateShardEntityDiscoveryRegistry",
    "generateShardClaimDiscoveryRegistry",
    "generateShardEntityRelationshipDiscoveryRegistry",
    "generateShardClaimRelationshipDiscoveryRegistry",
  ],
  "generation functions",
);

assert(!extraction.includes("generateOntologyDiscoveryRegistry"), "extraction still exports ontology generation");
assert(!extraction.includes("ontologyDiscoveryPrompt"), "extraction still contains ontology discovery prompt");

includesAll(
  panel,
  [
    "createShardDistillationRun",
    "runShardDistillationStage",
    "reviewShardDistillationCandidate",
    'id: "ontology"',
    'id: "entities"',
    'id: "claims"',
    'id: "entity_relationships"',
    'id: "claim_relationships"',
    'id: "promotion"',
    '"approve_canon"',
    '"approve_proposed"',
    '"reject"',
  ],
  "distillation panel",
);

assert(!panel.includes("runAtlasClaimExtraction"), "distillation panel still imports old claim extraction");
assert(!panel.includes("runAtlasEntitySuggestion"), "distillation panel still imports old entity suggestion");
assert(!panel.includes("runAtlasRelationshipSuggestion"), "distillation panel still imports old relationship suggestion");
assert(!shell.includes("distillation_runs"), "shell still preloads old document-level distillation runs");
assert(!shellFrame.includes("DistillationReviewInspector"), "shell frame still imports the old distillation review inspector");
assert(
  !existsSync(join(root, "components/atlas/inspector/DistillationReviewInspector.tsx")),
  "old distillation review inspector file still exists",
);
assert(
  !existsSync(join(root, "components/atlas/distillation/distillation-registry.ts")),
  "old distillation registry UI helper still exists",
);

console.log("Shard distillation verification passed.");
