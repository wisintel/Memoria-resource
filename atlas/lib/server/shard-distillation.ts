import {
  defaultAtlasChatEffort,
  defaultAtlasDistillationModelSettings,
  findAtlasChatModelOption,
  isAtlasChatEffort,
  providerOptionsForAtlasChatModel,
  type AtlasChatProviderOptions,
} from "@/lib/atlas-ai-models";
import {
  defaultClaimExtractionModel,
  defaultEntityExtractionModel,
  defaultRelationshipExtractionModel,
  generateShardClaimRelationshipDiscoveryRegistry,
  generateShardClaimDiscoveryRegistry,
  generateShardEntityRelationshipDiscoveryRegistry,
  generateShardEntityDiscoveryRegistry,
} from "@/lib/server/knowledge-extraction";
import {
  createClaimCommand,
  createEntityCommand,
  createRelationshipCommand,
  createSimpleCurationRecordCommand,
} from "@/lib/server/curation-commands";
import {
  createSupabaseClient,
  type ClassTypeInsert,
  type DistillationCandidateInsert,
  type DistillationCandidateRecord,
  type DistillationPipelineStage,
  type DistillationShardRunInsert,
  type DistillationShardRunRecord,
  type DistillationStageRunInsert,
  type DistillationStageRunRecord,
  type TableValue,
} from "@/lib/supabase/client";

export type ShardDistillationModelSettingsInput = {
  effort?: string | null;
  model?: string | null;
};

export type CreateDistillationShardRunInput = {
  documentId: string;
  domainId: string;
  modelSettings?: ShardDistillationModelSettingsInput | null;
  shardId: string;
};

export type CreateDistillationShardRunResult = {
  error: string | null;
  ok: boolean;
  run: DistillationShardRunRecord | null;
  stages: DistillationStageRunRecord[];
};

export type RunDistillationShardStageInput = {
  modelSettings?: ShardDistillationModelSettingsInput | null;
  runId: string;
  stage: DistillationPipelineStage;
};

export type RunDistillationShardStageResult = {
  candidateCount: number;
  error: string | null;
  ok: boolean;
  stageRun: DistillationStageRunRecord | null;
};

export type ReviewDistillationCandidateInput = {
  action: "approve" | "approve_canon" | "approve_proposed" | "reject";
  candidateId: string;
};

export type ReviewDistillationCandidateResult = {
  error: string | null;
  ok: boolean;
  targetRecordId: string | null;
};

export type ReviewDistillationCandidatesInput = {
  decisions: ReviewDistillationCandidateInput[];
};

export type ReviewDistillationCandidatesResult = {
  error: string | null;
  failed: Array<{
    candidateId: string;
    error: string;
  }>;
  ok: boolean;
  reviewedCount: number;
};

type StageDefinition = {
  id: DistillationPipelineStage;
  order: number;
};

type AtlasGenerationSettings = {
  effort: string;
  model: string;
  providerOptions?: AtlasChatProviderOptions;
};

type OntologyClassTableName = "entities" | "claims" | "relationships";

const shardDistillationStages: StageDefinition[] = [
  { id: "ontology", order: 1 },
  { id: "entities", order: 2 },
  { id: "claims", order: 3 },
  { id: "entity_relationships", order: 4 },
  { id: "claim_relationships", order: 5 },
  { id: "promotion", order: 6 },
];
const autoCommittedDistillationStages = new Set<DistillationPipelineStage>([
  "claims",
  "entities",
  "entity_relationships",
  "claim_relationships",
  "promotion",
]);
const entityPromotionWeightThreshold = 5;

export async function createOrSelectDistillationShardRun(
  input: CreateDistillationShardRunInput,
): Promise<CreateDistillationShardRunResult> {
  const domainId = input.domainId.trim();
  const documentId = input.documentId.trim();
  const shardId = input.shardId.trim();

  if (!domainId) {
    return shardRunError("Select a domain before creating a shard run.");
  }

  if (!documentId) {
    return shardRunError("Select a document before creating a shard run.");
  }

  if (!shardId) {
    return shardRunError("Select a shard before creating a shard run.");
  }

  const supabase = createSupabaseClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,domain_id")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    return shardRunError(documentError.message);
  }

  if (!document) {
    return shardRunError("Document was not found.");
  }

  if (document.domain_id !== domainId) {
    return shardRunError("Document does not belong to the selected domain.");
  }

  const { data: shard, error: shardError } = await supabase
    .from("document_shards")
    .select("id,document_id")
    .eq("id", shardId)
    .maybeSingle();

  if (shardError) {
    return shardRunError(shardError.message);
  }

  if (!shard) {
    return shardRunError("Shard was not found.");
  }

  if (shard.document_id !== documentId) {
    return shardRunError("Shard does not belong to the selected document.");
  }

  const existingRun = await loadShardRunByShardId(shardId);

  if (existingRun.error) {
    return shardRunError(existingRun.error);
  }

  if (existingRun.run) {
    const stages = await ensureStageRows(existingRun.run.id);

    if (stages.error) {
      return shardRunError(stages.error);
    }

    return {
      error: null,
      ok: true,
      run: existingRun.run,
      stages: stages.stages,
    };
  }

  const now = Date.now();
  const modelSettings = atlasGenerationSettings(input.modelSettings, defaultEntityExtractionModel);
  const runPayload: DistillationShardRunInsert = {
    completed_at: null,
    created_at: now,
    current_stage: "entities",
    document_id: documentId,
    domain_id: domainId,
    error_message: null,
    settings: {
      effort: modelSettings.effort,
      model: modelSettings.model,
    },
    shard_id: shardId,
    started_at: null,
    status: "draft",
    updated_at: now,
  };
  const { data: run, error: runError } = await supabase
    .from("distillation_shard_runs")
    .insert(runPayload)
    .select("*")
    .single();

  if (runError) {
    return shardRunError(runError.message);
  }

  const stages = await ensureStageRows(run.id);

  if (stages.error) {
    return shardRunError(stages.error);
  }

  return {
    error: null,
    ok: true,
    run,
    stages: stages.stages,
  };
}

export async function runDistillationShardStage(
  input: RunDistillationShardStageInput,
): Promise<RunDistillationShardStageResult> {
  if (input.stage === "ontology") {
    return stageRunError("Ontology is managed through Eve now. Run Entities when the domain ontology is ready.");
  }

  if (input.stage === "entities") {
    return await runEntityDiscovery(input);
  }

  if (input.stage === "claims") {
    return await runClaimDiscovery(input);
  }

  if (input.stage === "entity_relationships") {
    return await runEntityRelationshipDiscovery(input);
  }

  if (input.stage === "claim_relationships") {
    return await runClaimRelationshipDiscovery(input);
  }

  if (input.stage === "promotion") {
    return await runPromotionReview(input);
  }

  return stageRunError(`${stageLabel(input.stage)} is not implemented yet.`);
}

export async function reviewDistillationCandidate(
  input: ReviewDistillationCandidateInput,
): Promise<ReviewDistillationCandidateResult> {
  const candidateId = input.candidateId.trim();

  if (!candidateId) {
    return candidateReviewError("Candidate is required.");
  }

  const supabase = createSupabaseClient();
  const { data: candidate, error: candidateError } = await supabase
    .from("distillation_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateError) {
    return candidateReviewError(candidateError.message);
  }

  if (!candidate) {
    return candidateReviewError("Candidate was not found.");
  }

  if (candidate.status !== "pending") {
    return {
      error: null,
      ok: true,
      targetRecordId: candidate.target_record_id,
    };
  }

  if (input.action === "reject") {
    const now = Date.now();
    const { error } = await supabase
      .from("distillation_candidates")
      .update({
        approval_action: "reject",
        reviewed_at: now,
        status: "rejected",
        updated_at: now,
      })
      .eq("id", candidate.id);

    if (error) {
      return candidateReviewError(error.message);
    }

    await refreshStageReviewStatus(candidate.stage_run_id);

    return {
      error: null,
      ok: true,
      targetRecordId: null,
    };
  }

  if (isOntologyTypeCandidate(candidate)) {
    const typeResult = await approveOntologyTypeCandidate(candidate);

    if (!typeResult.ok || !typeResult.id) {
      return candidateReviewError(typeResult.error ?? "Ontology type could not be approved.");
    }

    await refreshStageReviewStatus(candidate.stage_run_id);

    return {
      error: null,
      ok: true,
      targetRecordId: typeResult.id,
    };
  }

  if (candidate.stage === "entities" && candidate.candidate_kind === "entity") {
    const entityResult = await approveEntityCandidate(candidate, input.action);

    if (!entityResult.ok || !entityResult.id) {
      return candidateReviewError(entityResult.error ?? "Entity candidate could not be approved.");
    }

    await refreshStageReviewStatus(candidate.stage_run_id);

    return {
      error: null,
      ok: true,
      targetRecordId: entityResult.id,
    };
  }

  if (candidate.stage === "claims" && candidate.candidate_kind === "claim") {
    const claimResult = await approveClaimCandidate(candidate);

    if (!claimResult.ok || !claimResult.id) {
      return candidateReviewError(claimResult.error ?? "Claim candidate could not be approved.");
    }

    await refreshStageReviewStatus(candidate.stage_run_id);

    return {
      error: null,
      ok: true,
      targetRecordId: claimResult.id,
    };
  }

  if (
    (candidate.stage === "entity_relationships" && candidate.candidate_kind === "entity_relationship") ||
    (candidate.stage === "claim_relationships" && candidate.candidate_kind === "claim_relationship")
  ) {
    const relationshipResult = await approveRelationshipCandidate(candidate);

    if (!relationshipResult.ok || !relationshipResult.id) {
      return candidateReviewError(relationshipResult.error ?? "Relationship candidate could not be approved.");
    }

    await refreshStageReviewStatus(candidate.stage_run_id);

    return {
      error: null,
      ok: true,
      targetRecordId: relationshipResult.id,
    };
  }

  if (candidate.stage === "promotion" && candidate.candidate_kind === "promotion") {
    const promotionResult = await approvePromotionCandidate(candidate);

    if (!promotionResult.ok || !promotionResult.id) {
      return candidateReviewError(promotionResult.error ?? "Promotion candidate could not be approved.");
    }

    await refreshStageReviewStatus(candidate.stage_run_id);

    return {
      error: null,
      ok: true,
      targetRecordId: promotionResult.id,
    };
  }

  return candidateReviewError("This candidate type is not reviewable yet.");
}

export async function reviewDistillationCandidates(
  input: ReviewDistillationCandidatesInput,
): Promise<ReviewDistillationCandidatesResult> {
  const decisionsByCandidateId = new Map<string, ReviewDistillationCandidateInput>();

  for (const decision of input.decisions) {
    const candidateId = decision.candidateId.trim();

    if (!candidateId) {
      continue;
    }

    decisionsByCandidateId.set(candidateId, {
      action: decision.action,
      candidateId,
    });
  }

  const decisions = [...decisionsByCandidateId.values()];

  if (decisions.length === 0) {
    return {
      error: "Select at least one candidate decision before submitting.",
      failed: [],
      ok: false,
      reviewedCount: 0,
    };
  }

  const failed: ReviewDistillationCandidatesResult["failed"] = [];
  let reviewedCount = 0;

  for (const decision of decisions) {
    const result = await reviewDistillationCandidate(decision);

    if (result.ok) {
      reviewedCount += 1;
      continue;
    }

    failed.push({
      candidateId: decision.candidateId,
      error: result.error ?? "Review failed.",
    });
  }

  return {
    error: failed.length > 0 ? `${failed.length} candidate${failed.length === 1 ? "" : "s"} could not be reviewed.` : null,
    failed,
    ok: failed.length === 0,
    reviewedCount,
  };
}

async function insertAndApproveCandidateRows(
  candidateRows: DistillationCandidateInsert[],
  action: ReviewDistillationCandidateInput["action"],
): Promise<{ approvedCount: number; insertedCount: number }> {
  const uniqueCandidateRows = uniqueCandidateRowsByStageDedupe(candidateRows);

  if (uniqueCandidateRows.length === 0) {
    return {
      approvedCount: 0,
      insertedCount: 0,
    };
  }

  const { data: insertedCandidates, error: insertError } = await createSupabaseClient()
    .from("distillation_candidates")
    .insert(uniqueCandidateRows)
    .select("*");

  if (insertError) {
    throw new Error(insertError.message);
  }

  let approvedCount = 0;

  for (const candidate of insertedCandidates ?? []) {
    const reviewResult = await reviewDistillationCandidate({
      action,
      candidateId: candidate.id,
    });

    if (!reviewResult.ok) {
      throw new Error(reviewResult.error ?? "Generated candidate could not be committed.");
    }

    approvedCount += 1;
  }

  return {
    approvedCount,
    insertedCount: insertedCandidates?.length ?? 0,
  };
}

function uniqueCandidateRowsByStageDedupe(
  candidateRows: DistillationCandidateInsert[],
) {
  const seenKeys = new Set<string>();
  const uniqueRows: DistillationCandidateInsert[] = [];

  for (const candidateRow of candidateRows) {
    const dedupeKey = candidateRow.dedupe_key
      ? `${candidateRow.stage_run_id}:${candidateRow.candidate_kind}:${candidateRow.dedupe_key}`
      : null;

    if (dedupeKey && seenKeys.has(dedupeKey)) {
      continue;
    }

    if (dedupeKey) {
      seenKeys.add(dedupeKey);
    }

    uniqueRows.push(candidateRow);
  }

  return uniqueRows;
}

async function approvePendingStageCandidates(
  stageRunId: string,
  action: ReviewDistillationCandidateInput["action"],
): Promise<{
  committedCount: number;
  error: string | null;
  stageRun: DistillationStageRunRecord | null;
}> {
  const supabase = createSupabaseClient();
  const { data: pendingCandidates, error: pendingError } = await supabase
    .from("distillation_candidates")
    .select("id")
    .eq("stage_run_id", stageRunId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (pendingError) {
    return {
      committedCount: 0,
      error: pendingError.message,
      stageRun: null,
    };
  }

  if ((pendingCandidates ?? []).length === 0) {
    return {
      committedCount: 0,
      error: null,
      stageRun: null,
    };
  }

  let committedCount = 0;

  for (const candidate of pendingCandidates ?? []) {
    const reviewResult = await reviewDistillationCandidate({
      action,
      candidateId: candidate.id,
    });

    if (!reviewResult.ok) {
      return {
        committedCount,
        error: reviewResult.error ?? "Pending candidate could not be committed.",
        stageRun: null,
      };
    }

    committedCount += 1;
  }

  const { data: stageRun, error: stageRunError } = await supabase
    .from("distillation_stage_runs")
    .select("*")
    .eq("id", stageRunId)
    .maybeSingle();

  return {
    committedCount,
    error: stageRunError?.message ?? null,
    stageRun: stageRun ?? null,
  };
}

async function runEntityDiscovery({
  modelSettings: modelSettingsInput,
  runId,
}: RunDistillationShardStageInput): Promise<RunDistillationShardStageResult> {
  const cleanRunId = runId.trim();

  if (!cleanRunId) {
    return stageRunError("Select a shard run before running entity discovery.");
  }

  if (process.env.NODE_ENV !== "production" && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return stageRunError("Atlas AI is not configured. Add AI Gateway credentials first.");
  }

  const supabase = createSupabaseClient();
  const runResult = await loadShardRun(cleanRunId);

  if (runResult.error) {
    return stageRunError(runResult.error);
  }

  if (!runResult.run) {
    return stageRunError("Shard run was not found.");
  }

  const run = runResult.run;
  const gateResult = await assertStageCanRun(run.id, "entities");

  if (gateResult.error) {
    return stageRunError(gateResult.error);
  }

  const stageRun = gateResult.stageRun;

  if (!stageRun) {
    return stageRunError("Entity stage was not found.");
  }

  const { data: shard, error: shardError } = await supabase
    .from("document_shards")
    .select("id,document_id,position,heading_path,body")
    .eq("id", run.shard_id)
    .maybeSingle();

  if (shardError) {
    return stageRunError(shardError.message);
  }

  if (!shard) {
    return stageRunError("Shard was not found.");
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,title,label")
    .eq("id", run.document_id)
    .maybeSingle();

  if (documentError) {
    return stageRunError(documentError.message);
  }

  const entityTypesResult = await entityTypeContext(run.domain_id);

  if (entityTypesResult.error) {
    return stageRunError(entityTypesResult.error);
  }

  if (entityTypesResult.types.length === 0) {
    return stageRunError("No entity types are available.");
  }

  const entityContext = await domainEntityContext(run.domain_id);

  if (entityContext.error) {
    return stageRunError(entityContext.error);
  }

  if (!entityContext.entityClassId) {
    return stageRunError("Entity class was not found.");
  }

  const modelSettings = atlasGenerationSettings(modelSettingsInput, defaultEntityExtractionModel);
  const now = Date.now();
  const startResult = await supabase
    .from("distillation_stage_runs")
    .update({
      error_message: null,
      input_context: {
        documentId: run.document_id,
        existingEntityCount: entityContext.entities.length,
        shardId: run.shard_id,
      },
      started_at: now,
      status: "running",
      updated_at: now,
    })
    .eq("id", stageRun.id);

  if (startResult.error) {
    return stageRunError(startResult.error.message);
  }

  await supabase
    .from("distillation_shard_runs")
    .update({
      current_stage: "entities",
      error_message: null,
      started_at: run.started_at ?? now,
      status: "running",
      updated_at: now,
    })
    .eq("id", run.id);

  try {
    const registry = await generateShardEntityDiscoveryRegistry({
      documentTitle: document?.title || document?.label,
      entityTypes: entityTypesResult.types,
      existingEntities: entityContext.entities,
      model: modelSettings.model,
      providerOptions: modelSettings.providerOptions,
      shardHeadingPath: shard.heading_path,
      shardPosition: shard.position,
      shardText: shard.body,
    });
    const entityTypeIds = new Set(entityTypesResult.types.map((type) => type.id));
    const existingEntityIds = new Set(entityContext.entities.map((entity) => entity.id));
    const entityByKey = new Map(entityContext.entities.map((entity) => [normalizeEntityLabel(entity.label), entity]));
    const existingCandidateKeys = await candidateDedupeKeys(stageRun.id);

    if (existingCandidateKeys.error) {
      throw new Error(existingCandidateKeys.error);
    }

    const processedKeys = new Set<string>();
    const generatedAt = Date.now();
    const candidateRows: DistillationCandidateInsert[] = [];
    let createdCount = 0;
    let linkedCount = 0;

    for (const candidate of registry.entities) {
      const label = candidate.label.trim();
      const key = normalizeEntityLabel(label);
      const explicitExistingEntityId =
        candidate.existingEntityId && existingEntityIds.has(candidate.existingEntityId)
          ? candidate.existingEntityId
          : null;
      const matchedEntity = explicitExistingEntityId
        ? entityContext.entities.find((entity) => entity.id === explicitExistingEntityId) ?? null
        : entityByKey.get(key) ?? null;
      const dedupeKey = matchedEntity ? `existing:${matchedEntity.id}` : `new:${key}`;

      if (!label || !key || !entityTypeIds.has(candidate.typeId) || processedKeys.has(dedupeKey)) {
        continue;
      }

      processedKeys.add(dedupeKey);

      const aliases = cleanAliases(candidate.aliases, label);
      const rationale = candidate.rationale?.trim() ?? "";

      if (existingCandidateKeys.keys.has(dedupeKey)) {
        continue;
      }

      if (!matchedEntity) {
        createdCount += 1;
      } else {
        linkedCount += 1;
      }

      candidateRows.push({
        approval_action: null,
        candidate_kind: "entity",
        created_at: generatedAt,
        dedupe_key: dedupeKey,
        error_message: null,
        evidence: {
          shardId: run.shard_id,
        },
        generated_at: generatedAt,
        payload: {
          aliases,
          existingEntityId: matchedEntity?.id ?? null,
          label,
          rationale,
          typeId: candidate.typeId,
        },
        reviewed_at: null,
        shard_run_id: run.id,
        stage: "entities",
        stage_run_id: stageRun.id,
        status: "pending",
        target_class_id: entityContext.entityClassId,
        target_record_id: matchedEntity?.id ?? null,
        updated_at: generatedAt,
      });
    }

    const commitResult = await insertAndApproveCandidateRows(candidateRows, "approve_proposed");
    const completedAt = Date.now();
    const entityCount = createdCount + linkedCount;
    const updateResult = await supabase
      .from("distillation_stage_runs")
      .update({
        approved_count: commitResult.approvedCount,
        candidate_count: commitResult.insertedCount,
        completed_at: completedAt,
        error_message: null,
        result_summary: {
          candidateCount: commitResult.insertedCount,
          createdCount,
          entityCount,
          linkedCount,
          model: modelSettings.model,
          warnings: registry.warnings,
        },
        status: "completed",
        updated_at: completedAt,
      })
      .eq("id", stageRun.id)
      .select("*")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    await supabase
      .from("distillation_shard_runs")
      .update({
        current_stage: "claims",
        error_message: null,
        status: "draft",
        updated_at: completedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount: entityCount,
      error: null,
      ok: true,
      stageRun: updateResult.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAt = Date.now();

    await supabase
      .from("distillation_stage_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", stageRun.id);

    await supabase
      .from("distillation_shard_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount: 0,
      error: errorMessage,
      ok: false,
      stageRun: null,
    };
  }
}

async function runClaimDiscovery({
  modelSettings: modelSettingsInput,
  runId,
}: RunDistillationShardStageInput): Promise<RunDistillationShardStageResult> {
  const cleanRunId = runId.trim();

  if (!cleanRunId) {
    return stageRunError("Select a shard run before running claim discovery.");
  }

  if (process.env.NODE_ENV !== "production" && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return stageRunError("Atlas AI is not configured. Add AI Gateway credentials first.");
  }

  const supabase = createSupabaseClient();
  const runResult = await loadShardRun(cleanRunId);

  if (runResult.error) {
    return stageRunError(runResult.error);
  }

  if (!runResult.run) {
    return stageRunError("Shard run was not found.");
  }

  const run = runResult.run;
  const gateResult = await assertStageCanRun(run.id, "claims");

  if (gateResult.error) {
    return stageRunError(gateResult.error);
  }

  const stageRun = gateResult.stageRun;

  if (!stageRun) {
    return stageRunError("Claim stage was not found.");
  }

  const pendingCommitResult = await approvePendingStageCandidates(stageRun.id, "approve");

  if (pendingCommitResult.error) {
    return stageRunError(pendingCommitResult.error);
  }

  if (pendingCommitResult.committedCount > 0) {
    return {
      candidateCount: pendingCommitResult.stageRun?.candidate_count ?? pendingCommitResult.committedCount,
      error: null,
      ok: true,
      stageRun: pendingCommitResult.stageRun,
    };
  }

  const { data: shard, error: shardError } = await supabase
    .from("document_shards")
    .select("id,document_id,position,heading_path,body")
    .eq("id", run.shard_id)
    .maybeSingle();

  if (shardError) {
    return stageRunError(shardError.message);
  }

  if (!shard) {
    return stageRunError("Shard was not found.");
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,title,label")
    .eq("id", run.document_id)
    .maybeSingle();

  if (documentError) {
    return stageRunError(documentError.message);
  }

  const claimTypesResult = await claimTypeContext(run.domain_id);

  if (claimTypesResult.error) {
    return stageRunError(claimTypesResult.error);
  }

  if (claimTypesResult.types.length === 0) {
    return stageRunError("No claim types are available.");
  }

  const entityContext = await domainEntityContext(run.domain_id);

  if (entityContext.error) {
    return stageRunError(entityContext.error);
  }

  if (entityContext.entities.length === 0) {
    return stageRunError("No domain entities are available.");
  }

  const claimContext = await domainClaimContext(run.domain_id);

  if (claimContext.error) {
    return stageRunError(claimContext.error);
  }

  const modelSettings = atlasGenerationSettings(modelSettingsInput, defaultClaimExtractionModel);
  const now = Date.now();
  const startResult = await supabase
    .from("distillation_stage_runs")
    .update({
      error_message: null,
      input_context: {
        documentId: run.document_id,
        domainClaimCount: claimContext.claims.length,
        domainEntityCount: entityContext.entities.length,
        shardId: run.shard_id,
      },
      started_at: now,
      status: "running",
      updated_at: now,
    })
    .eq("id", stageRun.id);

  if (startResult.error) {
    return stageRunError(startResult.error.message);
  }

  await supabase
    .from("distillation_shard_runs")
    .update({
      current_stage: "claims",
      error_message: null,
      started_at: run.started_at ?? now,
      status: "running",
      updated_at: now,
    })
    .eq("id", run.id);

  try {
    const registry = await generateShardClaimDiscoveryRegistry({
      claimTypes: claimTypesResult.types,
      documentTitle: document?.title || document?.label,
      domainClaims: claimContext.claims.map((claim) => ({
        id: claim.id,
        targetEntityIds: claim.targetEntityIds,
        text: claim.claimText,
        typeId: claim.typeId,
      })),
      entities: entityContext.entities,
      model: modelSettings.model,
      providerOptions: modelSettings.providerOptions,
      shardHeadingPath: shard.heading_path,
      shardPosition: shard.position,
      shardText: shard.body,
    });
    const claimTypeIds = new Set(claimTypesResult.types.map((type) => type.id));
    const entityIds = new Set(entityContext.entities.map((entity) => entity.id));
    const claimIds = new Set(claimContext.claims.map((claim) => claim.id));
    const existingClaimKeys = new Set(
      claimContext.claims.map((claim) =>
        claimDedupeKey(claim.claimText, claim.targetEntityIds),
      ),
    );
    const existingCandidateKeys = await candidateDedupeKeys(stageRun.id);

    if (existingCandidateKeys.error) {
      throw new Error(existingCandidateKeys.error);
    }

    const generatedAt = Date.now();
    const candidateRows: DistillationCandidateInsert[] = [];

    for (const candidate of registry.claims) {
      const statement = candidate.statement.trim();
      const targetEntityIds = sortedUniqueStrings(candidate.targetEntityIds).filter((id) => entityIds.has(id));
      const existingClaimId =
        candidate.existingClaimId && claimIds.has(candidate.existingClaimId)
          ? candidate.existingClaimId
          : null;
      const dedupeKey = existingClaimId
        ? `existing:${existingClaimId}`
        : `new:${claimDedupeKey(statement, targetEntityIds)}`;

      if (
        !statement ||
        targetEntityIds.length === 0 ||
        !claimTypeIds.has(candidate.typeId) ||
        existingCandidateKeys.keys.has(dedupeKey)
      ) {
        continue;
      }

      if (!existingClaimId && existingClaimKeys.has(claimDedupeKey(statement, targetEntityIds))) {
        continue;
      }

      candidateRows.push({
        approval_action: null,
        candidate_kind: "claim",
        created_at: generatedAt,
        dedupe_key: dedupeKey,
        error_message: null,
        evidence: {
          shardId: run.shard_id,
          sourceType: candidate.sourceType,
        },
        generated_at: generatedAt,
        payload: {
          confidence: candidate.confidence,
          existingClaimId,
          rationale: candidate.rationale,
          sourceType: candidate.sourceType,
          statement,
          targetEntityIds,
          typeId: candidate.typeId,
        },
        reviewed_at: null,
        shard_run_id: run.id,
        stage: "claims",
        stage_run_id: stageRun.id,
        status: "pending",
        target_class_id: claimContext.claimClassId,
        target_record_id: existingClaimId,
        updated_at: generatedAt,
      });
    }

    const commitResult = await insertAndApproveCandidateRows(candidateRows, "approve");

    const completedAt = Date.now();
    const candidateCount = commitResult.insertedCount;
    const updateResult = await supabase
      .from("distillation_stage_runs")
      .update({
        approved_count: commitResult.approvedCount,
        candidate_count: candidateCount,
        completed_at: completedAt,
        error_message: null,
        result_summary: {
          approvedCount: commitResult.approvedCount,
          candidateCount,
          model: modelSettings.model,
          warnings: registry.warnings,
        },
        status: "completed",
        updated_at: completedAt,
      })
      .eq("id", stageRun.id)
      .select("*")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    await supabase
      .from("distillation_shard_runs")
      .update({
        current_stage: "entity_relationships",
        error_message: null,
        status: "draft",
        updated_at: completedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount,
      error: null,
      ok: true,
      stageRun: updateResult.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAt = Date.now();

    await supabase
      .from("distillation_stage_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", stageRun.id);

    await supabase
      .from("distillation_shard_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount: 0,
      error: errorMessage,
      ok: false,
      stageRun: null,
    };
  }
}

async function runEntityRelationshipDiscovery({
  modelSettings: modelSettingsInput,
  runId,
}: RunDistillationShardStageInput): Promise<RunDistillationShardStageResult> {
  const cleanRunId = runId.trim();

  if (!cleanRunId) {
    return stageRunError("Select a shard run before running entity relationship discovery.");
  }

  if (process.env.NODE_ENV !== "production" && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return stageRunError("Atlas AI is not configured. Add AI Gateway credentials first.");
  }

  const supabase = createSupabaseClient();
  const runResult = await loadShardRun(cleanRunId);

  if (runResult.error) {
    return stageRunError(runResult.error);
  }

  if (!runResult.run) {
    return stageRunError("Shard run was not found.");
  }

  const run = runResult.run;
  const gateResult = await assertStageCanRun(run.id, "entity_relationships");

  if (gateResult.error) {
    return stageRunError(gateResult.error);
  }

  const stageRun = gateResult.stageRun;

  if (!stageRun) {
    return stageRunError("Entity relationship stage was not found.");
  }

  const pendingCommitResult = await approvePendingStageCandidates(stageRun.id, "approve");

  if (pendingCommitResult.error) {
    return stageRunError(pendingCommitResult.error);
  }

  if (pendingCommitResult.committedCount > 0) {
    return {
      candidateCount: pendingCommitResult.stageRun?.candidate_count ?? pendingCommitResult.committedCount,
      error: null,
      ok: true,
      stageRun: pendingCommitResult.stageRun,
    };
  }

  const { data: shard, error: shardError } = await supabase
    .from("document_shards")
    .select("id,document_id,position,heading_path,body")
    .eq("id", run.shard_id)
    .maybeSingle();

  if (shardError) {
    return stageRunError(shardError.message);
  }

  if (!shard) {
    return stageRunError("Shard was not found.");
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,title,label")
    .eq("id", run.document_id)
    .maybeSingle();

  if (documentError) {
    return stageRunError(documentError.message);
  }

  const relationshipTypesResult = await relationshipTypeContext(run.domain_id);

  if (relationshipTypesResult.error) {
    return stageRunError(relationshipTypesResult.error);
  }

  if (relationshipTypesResult.types.length === 0) {
    return stageRunError("No relationship types are available.");
  }

  const entityContext = await domainEntityContext(run.domain_id);

  if (entityContext.error) {
    return stageRunError(entityContext.error);
  }

  if (entityContext.entities.length < 2) {
    return stageRunError("At least two domain entities are required.");
  }

  const claimContext = await domainClaimContext(run.domain_id);

  if (claimContext.error) {
    return stageRunError(claimContext.error);
  }

  const relationshipContext = await domainRelationshipContext(run.domain_id, "entities", "entities");

  if (relationshipContext.error) {
    return stageRunError(relationshipContext.error);
  }

  const modelSettings = atlasGenerationSettings(modelSettingsInput, defaultRelationshipExtractionModel);
  const now = Date.now();
  const startResult = await supabase
    .from("distillation_stage_runs")
    .update({
      error_message: null,
      input_context: {
        documentId: run.document_id,
        domainClaimCount: claimContext.claims.length,
        domainEntityCount: entityContext.entities.length,
        existingRelationshipCount: relationshipContext.relationships.length,
        shardId: run.shard_id,
      },
      started_at: now,
      status: "running",
      updated_at: now,
    })
    .eq("id", stageRun.id);

  if (startResult.error) {
    return stageRunError(startResult.error.message);
  }

  await supabase
    .from("distillation_shard_runs")
    .update({
      current_stage: "entity_relationships",
      error_message: null,
      started_at: run.started_at ?? now,
      status: "running",
      updated_at: now,
    })
    .eq("id", run.id);

  try {
    const registry = await generateShardEntityRelationshipDiscoveryRegistry({
      claims: claimContext.claims.map((claim) => ({
        id: claim.id,
        targetEntityIds: claim.targetEntityIds,
        text: claim.claimText,
        typeId: claim.typeId,
      })),
      documentTitle: document?.title || document?.label,
      entities: entityContext.entities,
      existingRelationships: relationshipContext.relationships,
      model: modelSettings.model,
      providerOptions: modelSettings.providerOptions,
      relationshipTypes: relationshipTypesResult.types,
      shardHeadingPath: shard.heading_path,
      shardPosition: shard.position,
      shardText: shard.body,
    });
    const relationshipTypeIds = new Set(relationshipTypesResult.types.map((type) => type.id));
    const entityIds = new Set(entityContext.entities.map((entity) => entity.id));
    const claimIds = new Set(claimContext.claims.map((claim) => claim.id));
    const existingRelationshipIds = new Set(relationshipContext.relationships.map((relationship) => relationship.id));
    const existingRelationshipKeys = new Set(
      relationshipContext.relationships.map((relationship) =>
        relationshipDedupeKey(relationship.sourceRecordId, relationship.targetRecordId, relationship.typeId),
      ),
    );
    const existingCandidateKeys = await candidateDedupeKeys(stageRun.id);

    if (existingCandidateKeys.error) {
      throw new Error(existingCandidateKeys.error);
    }

    const generatedAt = Date.now();
    const candidateRows: DistillationCandidateInsert[] = [];

    for (const candidate of registry.relationships) {
      const sourceEntityId = candidate.sourceEntityId.trim();
      const targetEntityId = candidate.targetEntityId.trim();
      const supportingClaimIds = sortedUniqueStrings(candidate.claimIds).filter((claimId) => claimIds.has(claimId));
      const existingRelationshipId =
        candidate.existingRelationshipId && existingRelationshipIds.has(candidate.existingRelationshipId)
          ? candidate.existingRelationshipId
          : null;
      const dedupeKey = existingRelationshipId
        ? `existing:${existingRelationshipId}`
        : `new:${relationshipDedupeKey(sourceEntityId, targetEntityId, candidate.typeId)}`;

      if (
        sourceEntityId === targetEntityId ||
        !entityIds.has(sourceEntityId) ||
        !entityIds.has(targetEntityId) ||
        !relationshipTypeIds.has(candidate.typeId) ||
        existingCandidateKeys.keys.has(dedupeKey)
      ) {
        continue;
      }

      if (!existingRelationshipId && existingRelationshipKeys.has(relationshipDedupeKey(sourceEntityId, targetEntityId, candidate.typeId))) {
        continue;
      }

      candidateRows.push({
        approval_action: null,
        candidate_kind: "entity_relationship",
        created_at: generatedAt,
        dedupe_key: dedupeKey,
        error_message: null,
        evidence: {
          claimIds: supportingClaimIds,
          shardId: run.shard_id,
        },
        generated_at: generatedAt,
        payload: {
          claimIds: supportingClaimIds,
          existingRelationshipId,
          rationale: candidate.rationale,
          sourceClassTableName: "entities",
          sourceRecordId: sourceEntityId,
          targetClassTableName: "entities",
          targetRecordId: targetEntityId,
          typeId: candidate.typeId,
        },
        reviewed_at: null,
        shard_run_id: run.id,
        stage: "entity_relationships",
        stage_run_id: stageRun.id,
        status: "pending",
        target_class_id: relationshipContext.relationshipClassId,
        target_record_id: existingRelationshipId,
        updated_at: generatedAt,
      });
    }

    const commitResult = await insertAndApproveCandidateRows(candidateRows, "approve");

    const completedAt = Date.now();
    const candidateCount = commitResult.insertedCount;
    const updateResult = await supabase
      .from("distillation_stage_runs")
      .update({
        approved_count: commitResult.approvedCount,
        candidate_count: candidateCount,
        completed_at: completedAt,
        error_message: null,
        result_summary: {
          approvedCount: commitResult.approvedCount,
          candidateCount,
          model: modelSettings.model,
          warnings: registry.warnings,
        },
        status: "completed",
        updated_at: completedAt,
      })
      .eq("id", stageRun.id)
      .select("*")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    await supabase
      .from("distillation_shard_runs")
      .update({
        current_stage: "claim_relationships",
        error_message: null,
        status: "draft",
        updated_at: completedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount,
      error: null,
      ok: true,
      stageRun: updateResult.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAt = Date.now();

    await supabase
      .from("distillation_stage_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", stageRun.id);

    await supabase
      .from("distillation_shard_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount: 0,
      error: errorMessage,
      ok: false,
      stageRun: null,
    };
  }
}

async function runClaimRelationshipDiscovery({
  modelSettings: modelSettingsInput,
  runId,
}: RunDistillationShardStageInput): Promise<RunDistillationShardStageResult> {
  const cleanRunId = runId.trim();

  if (!cleanRunId) {
    return stageRunError("Select a shard run before running claim relationship discovery.");
  }

  if (process.env.NODE_ENV !== "production" && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return stageRunError("Atlas AI is not configured. Add AI Gateway credentials first.");
  }

  const supabase = createSupabaseClient();
  const runResult = await loadShardRun(cleanRunId);

  if (runResult.error) {
    return stageRunError(runResult.error);
  }

  if (!runResult.run) {
    return stageRunError("Shard run was not found.");
  }

  const run = runResult.run;
  const gateResult = await assertStageCanRun(run.id, "claim_relationships");

  if (gateResult.error) {
    return stageRunError(gateResult.error);
  }

  const stageRun = gateResult.stageRun;

  if (!stageRun) {
    return stageRunError("Claim relationship stage was not found.");
  }

  const pendingCommitResult = await approvePendingStageCandidates(stageRun.id, "approve");

  if (pendingCommitResult.error) {
    return stageRunError(pendingCommitResult.error);
  }

  if (pendingCommitResult.committedCount > 0) {
    return {
      candidateCount: pendingCommitResult.stageRun?.candidate_count ?? pendingCommitResult.committedCount,
      error: null,
      ok: true,
      stageRun: pendingCommitResult.stageRun,
    };
  }

  const { data: shard, error: shardError } = await supabase
    .from("document_shards")
    .select("id,document_id,position,heading_path,body")
    .eq("id", run.shard_id)
    .maybeSingle();

  if (shardError) {
    return stageRunError(shardError.message);
  }

  if (!shard) {
    return stageRunError("Shard was not found.");
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,title,label")
    .eq("id", run.document_id)
    .maybeSingle();

  if (documentError) {
    return stageRunError(documentError.message);
  }

  const relationshipTypesResult = await relationshipTypeContext(run.domain_id);

  if (relationshipTypesResult.error) {
    return stageRunError(relationshipTypesResult.error);
  }

  if (relationshipTypesResult.types.length === 0) {
    return stageRunError("No relationship types are available.");
  }

  const claimRelationshipTypes = relationshipTypesResult.types.filter((type) =>
    ["supports", "contradicts"].includes(type.slug),
  );

  if (claimRelationshipTypes.length < 2) {
    return stageRunError("Claim relationship discovery requires Supports and Contradicts relationship types.");
  }

  const claimContext = await domainClaimContext(run.domain_id);

  if (claimContext.error) {
    return stageRunError(claimContext.error);
  }

  if (claimContext.claims.length < 2) {
    return stageRunError("At least two domain claims are required.");
  }

  const relationshipContext = await domainRelationshipContext(run.domain_id, "claims", "claims");

  if (relationshipContext.error) {
    return stageRunError(relationshipContext.error);
  }

  const modelSettings = atlasGenerationSettings(modelSettingsInput, defaultRelationshipExtractionModel);
  const now = Date.now();
  const startResult = await supabase
    .from("distillation_stage_runs")
    .update({
      error_message: null,
      input_context: {
        documentId: run.document_id,
        domainClaimCount: claimContext.claims.length,
        existingRelationshipCount: relationshipContext.relationships.length,
        shardId: run.shard_id,
      },
      started_at: now,
      status: "running",
      updated_at: now,
    })
    .eq("id", stageRun.id);

  if (startResult.error) {
    return stageRunError(startResult.error.message);
  }

  await supabase
    .from("distillation_shard_runs")
    .update({
      current_stage: "claim_relationships",
      error_message: null,
      started_at: run.started_at ?? now,
      status: "running",
      updated_at: now,
    })
    .eq("id", run.id);

  try {
    const registry = await generateShardClaimRelationshipDiscoveryRegistry({
      claims: claimContext.claims.map((claim) => ({
        id: claim.id,
        targetEntityIds: claim.targetEntityIds,
        text: claim.claimText,
        typeId: claim.typeId,
      })),
      documentTitle: document?.title || document?.label,
      existingRelationships: relationshipContext.relationships,
      model: modelSettings.model,
      providerOptions: modelSettings.providerOptions,
      relationshipTypes: claimRelationshipTypes,
      shardHeadingPath: shard.heading_path,
      shardPosition: shard.position,
      shardText: shard.body,
    });
    const relationshipTypeIds = new Set(claimRelationshipTypes.map((type) => type.id));
    const claimIds = new Set(claimContext.claims.map((claim) => claim.id));
    const existingRelationshipIds = new Set(relationshipContext.relationships.map((relationship) => relationship.id));
    const existingRelationshipKeys = new Set(
      relationshipContext.relationships.map((relationship) =>
        relationshipDedupeKey(relationship.sourceRecordId, relationship.targetRecordId, relationship.typeId),
      ),
    );
    const existingCandidateKeys = await candidateDedupeKeys(stageRun.id);

    if (existingCandidateKeys.error) {
      throw new Error(existingCandidateKeys.error);
    }

    const generatedAt = Date.now();
    const candidateRows: DistillationCandidateInsert[] = [];

    for (const candidate of registry.relationships) {
      const sourceClaimId = candidate.sourceClaimId.trim();
      const targetClaimId = candidate.targetClaimId.trim();
      const evidenceClaimIds = sortedUniqueStrings(candidate.evidenceClaimIds).filter((claimId) => claimIds.has(claimId));
      const existingRelationshipId =
        candidate.existingRelationshipId && existingRelationshipIds.has(candidate.existingRelationshipId)
          ? candidate.existingRelationshipId
          : null;
      const dedupeKey = existingRelationshipId
        ? `existing:${existingRelationshipId}`
        : `new:${relationshipDedupeKey(sourceClaimId, targetClaimId, candidate.typeId)}`;

      if (
        sourceClaimId === targetClaimId ||
        !claimIds.has(sourceClaimId) ||
        !claimIds.has(targetClaimId) ||
        !relationshipTypeIds.has(candidate.typeId) ||
        existingCandidateKeys.keys.has(dedupeKey)
      ) {
        continue;
      }

      if (!existingRelationshipId && existingRelationshipKeys.has(relationshipDedupeKey(sourceClaimId, targetClaimId, candidate.typeId))) {
        continue;
      }

      candidateRows.push({
        approval_action: null,
        candidate_kind: "claim_relationship",
        created_at: generatedAt,
        dedupe_key: dedupeKey,
        error_message: null,
        evidence: {
          evidenceClaimIds,
          shardId: run.shard_id,
        },
        generated_at: generatedAt,
        payload: {
          evidenceClaimIds,
          existingRelationshipId,
          rationale: candidate.rationale,
          sourceClassTableName: "claims",
          sourceRecordId: sourceClaimId,
          targetClassTableName: "claims",
          targetRecordId: targetClaimId,
          typeId: candidate.typeId,
        },
        reviewed_at: null,
        shard_run_id: run.id,
        stage: "claim_relationships",
        stage_run_id: stageRun.id,
        status: "pending",
        target_class_id: relationshipContext.relationshipClassId,
        target_record_id: existingRelationshipId,
        updated_at: generatedAt,
      });
    }

    const commitResult = await insertAndApproveCandidateRows(candidateRows, "approve");

    const completedAt = Date.now();
    const candidateCount = commitResult.insertedCount;
    const updateResult = await supabase
      .from("distillation_stage_runs")
      .update({
        approved_count: commitResult.approvedCount,
        candidate_count: candidateCount,
        completed_at: completedAt,
        error_message: null,
        result_summary: {
          approvedCount: commitResult.approvedCount,
          candidateCount,
          model: modelSettings.model,
          warnings: registry.warnings,
        },
        status: "completed",
        updated_at: completedAt,
      })
      .eq("id", stageRun.id)
      .select("*")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    await supabase
      .from("distillation_shard_runs")
      .update({
        current_stage: "promotion",
        error_message: null,
        status: "draft",
        updated_at: completedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount,
      error: null,
      ok: true,
      stageRun: updateResult.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAt = Date.now();

    await supabase
      .from("distillation_stage_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", stageRun.id);

    await supabase
      .from("distillation_shard_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount: 0,
      error: errorMessage,
      ok: false,
      stageRun: null,
    };
  }
}

async function runPromotionReview({
  runId,
}: RunDistillationShardStageInput): Promise<RunDistillationShardStageResult> {
  const cleanRunId = runId.trim();

  if (!cleanRunId) {
    return stageRunError("Select a shard run before running promotion review.");
  }

  const supabase = createSupabaseClient();
  const runResult = await loadShardRun(cleanRunId);

  if (runResult.error) {
    return stageRunError(runResult.error);
  }

  if (!runResult.run) {
    return stageRunError("Shard run was not found.");
  }

  const run = runResult.run;
  const gateResult = await assertStageCanRun(run.id, "promotion");

  if (gateResult.error) {
    return stageRunError(gateResult.error);
  }

  const stageRun = gateResult.stageRun;

  if (!stageRun) {
    return stageRunError("Promotion stage was not found.");
  }

  const entityContext = await domainEntityContext(run.domain_id);

  if (entityContext.error) {
    return stageRunError(entityContext.error);
  }

  const proposedEntities = entityContext.entities.filter((entity) => entity.status === "proposed");
  const now = Date.now();
  const startResult = await supabase
    .from("distillation_stage_runs")
    .update({
      error_message: null,
      input_context: {
        weightThreshold: entityPromotionWeightThreshold,
        proposedEntityCount: proposedEntities.length,
      },
      started_at: now,
      status: "running",
      updated_at: now,
    })
    .eq("id", stageRun.id);

  if (startResult.error) {
    return stageRunError(startResult.error.message);
  }

  await supabase
    .from("distillation_shard_runs")
    .update({
      current_stage: "promotion",
      error_message: null,
      started_at: run.started_at ?? now,
      status: "running",
      updated_at: now,
    })
    .eq("id", run.id);

  try {
    const relationshipContext = await domainRelationshipContext(run.domain_id, "entities", "entities");

    if (relationshipContext.error) {
      throw new Error(relationshipContext.error);
    }

    const entityIds = proposedEntities.map((entity) => entity.id);
    const { data: claims, error: claimsError } =
      entityIds.length > 0
        ? await supabase
            .from("claims")
            .select("id,target_entity_ids")
            .eq("domain_id", run.domain_id)
            .overlaps("target_entity_ids", entityIds)
        : { data: [], error: null };

    if (claimsError) {
      throw new Error(claimsError.message);
    }

    const claimCounts = new Map<string, number>();
    const relationshipCounts = new Map<string, number>();

    for (const entity of proposedEntities) {
      claimCounts.set(entity.id, 0);
      relationshipCounts.set(entity.id, 0);
    }

    for (const claim of claims ?? []) {
      for (const entityId of sortedUniqueStrings(claim.target_entity_ids)) {
        if (claimCounts.has(entityId)) {
          claimCounts.set(entityId, (claimCounts.get(entityId) ?? 0) + 1);
        }
      }
    }

    for (const relationship of relationshipContext.relationships) {
      if (relationshipCounts.has(relationship.sourceRecordId)) {
        relationshipCounts.set(relationship.sourceRecordId, (relationshipCounts.get(relationship.sourceRecordId) ?? 0) + 1);
      }

      if (relationshipCounts.has(relationship.targetRecordId)) {
        relationshipCounts.set(relationship.targetRecordId, (relationshipCounts.get(relationship.targetRecordId) ?? 0) + 1);
      }
    }

    const statusResult = await statusIdsForTableSlugs("entities", ["canon"]);

    if (statusResult.error) {
      throw new Error(statusResult.error);
    }

    const canonStatusId = statusResult.statusIds.get("canon") ?? null;

    if (!canonStatusId) {
      throw new Error("Entity canon status is required.");
    }

    const promotionSummaries: Array<{
      claimCount: number;
      entityId: string;
      label: string;
      relationshipCount: number;
      weight: number;
    }> = [];

    for (const entity of proposedEntities) {
      const claimCount = claimCounts.get(entity.id) ?? 0;
      const relationshipCount = relationshipCounts.get(entity.id) ?? 0;
      const weight = claimCount + relationshipCount;

      if (weight < entityPromotionWeightThreshold) {
        continue;
      }

      const { error: promoteError } = await supabase
        .from("entities")
        .update({
          status_id: canonStatusId,
          updated_at: Date.now(),
        })
        .eq("id", entity.id);

      if (promoteError) {
        throw new Error(promoteError.message);
      }

      promotionSummaries.push({
        claimCount,
        entityId: entity.id,
        label: entity.label,
        relationshipCount,
        weight,
      });
    }

    const completedAt = Date.now();
    const promotedCount = promotionSummaries.length;
    const updateResult = await supabase
      .from("distillation_stage_runs")
      .update({
        approved_count: promotedCount,
        candidate_count: promotedCount,
        completed_at: completedAt,
        error_message: null,
        result_summary: {
          promotedCount,
          promotedEntities: promotionSummaries,
          proposedEntityCount: proposedEntities.length,
          weightThreshold: entityPromotionWeightThreshold,
        },
        status: "completed",
        updated_at: completedAt,
      })
      .eq("id", stageRun.id)
      .select("*")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    await supabase
      .from("distillation_shard_runs")
      .update({
        completed_at: completedAt,
        current_stage: "complete",
        error_message: null,
        status: "completed",
        updated_at: completedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount: promotedCount,
      error: null,
      ok: true,
      stageRun: updateResult.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAt = Date.now();

    await supabase
      .from("distillation_stage_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", stageRun.id);

    await supabase
      .from("distillation_shard_runs")
      .update({
        error_message: errorMessage,
        status: "failed",
        updated_at: failedAt,
      })
      .eq("id", run.id);

    return {
      candidateCount: 0,
      error: errorMessage,
      ok: false,
      stageRun: null,
    };
  }
}

async function loadShardRunByShardId(shardId: string) {
  const { data, error } = await createSupabaseClient()
    .from("distillation_shard_runs")
    .select("*")
    .eq("shard_id", shardId)
    .maybeSingle();

  return {
    error: error?.message ?? null,
    run: data ?? null,
  };
}

async function loadShardRun(runId: string) {
  const { data, error } = await createSupabaseClient()
    .from("distillation_shard_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  return {
    error: error?.message ?? null,
    run: data ?? null,
  };
}

async function ensureStageRows(shardRunId: string): Promise<{
  error: string | null;
  stages: DistillationStageRunRecord[];
}> {
  const supabase = createSupabaseClient();
  const { data: existingStages, error: existingError } = await supabase
    .from("distillation_stage_runs")
    .select("*")
    .eq("shard_run_id", shardRunId)
    .order("stage_order", { ascending: true });

  if (existingError) {
    return {
      error: existingError.message,
      stages: [],
    };
  }

  const existingStageIds = new Set((existingStages ?? []).map((stage) => stage.stage));
  const missingStages = shardDistillationStages.filter((stage) => !existingStageIds.has(stage.id));

  if (missingStages.length === 0) {
    return {
      error: null,
      stages: existingStages ?? [],
    };
  }

  const now = Date.now();
  const skippedOntologySummary: TableValue = {
    mode: "manual",
    note: "Ontology is managed through Eve.",
  };
  const stageRows: DistillationStageRunInsert[] = missingStages.map((stage) => ({
    approved_count: 0,
    candidate_count: 0,
    completed_at: stage.id === "ontology" ? now : null,
    created_at: now,
    error_message: null,
    input_context: {},
    rejected_count: 0,
    result_summary: stage.id === "ontology" ? skippedOntologySummary : {},
    shard_run_id: shardRunId,
    stage: stage.id,
    stage_order: stage.order,
    started_at: null,
    status: stage.id === "ontology" ? "skipped" : "pending",
    updated_at: now,
  }));
  const { error: insertError } = await supabase.from("distillation_stage_runs").insert(stageRows);

  if (insertError) {
    return {
      error: insertError.message,
      stages: [],
    };
  }

  const { data: stages, error: loadError } = await supabase
    .from("distillation_stage_runs")
    .select("*")
    .eq("shard_run_id", shardRunId)
    .order("stage_order", { ascending: true });

  return {
    error: loadError?.message ?? null,
    stages: stages ?? [],
  };
}

async function assertStageCanRun(shardRunId: string, stage: DistillationPipelineStage): Promise<{
  error: string | null;
  stageRun: DistillationStageRunRecord | null;
}> {
  const stages = await ensureStageRows(shardRunId);

  if (stages.error) {
    return {
      error: stages.error,
      stageRun: null,
    };
  }

  const stageRun = stages.stages.find((candidate) => candidate.stage === stage) ?? null;

  if (!stageRun) {
    return {
      error: "Stage was not found.",
      stageRun: null,
    };
  }

  const priorStages = stages.stages.filter(
    (candidate) => candidate.stage_order < stageRun.stage_order && candidate.stage !== "ontology",
  );
  const incompletePriorStage = priorStages.find((candidate) => candidate.status !== "completed" && candidate.status !== "skipped");

  if (incompletePriorStage) {
    return {
      error: `Complete ${stageLabel(incompletePriorStage.stage)} before running ${stageLabel(stage)}.`,
      stageRun: null,
    };
  }

  if (stageRun.status === "running") {
    return {
      error: `${stageLabel(stage)} is already running.`,
      stageRun: null,
    };
  }

  const pendingResult = await createSupabaseClient()
    .from("distillation_candidates")
    .select("id")
    .eq("stage_run_id", stageRun.id)
    .eq("status", "pending")
    .limit(1);

  if (pendingResult.error) {
    return {
      error: pendingResult.error.message,
      stageRun: null,
    };
  }

  if ((pendingResult.data ?? []).length > 0 && !autoCommittedDistillationStages.has(stage)) {
    return {
      error: `Review all ${stageLabel(stage)} candidates before rerunning this stage.`,
      stageRun: null,
    };
  }

  return {
    error: null,
    stageRun,
  };
}

async function entityTypeContext(domainId: string): Promise<{
  error: string | null;
  types: Array<{
    id: string;
    label: string;
    slug: string;
  }>;
}> {
  const classIds = await classIdsForOntology();

  if (classIds.error) {
    return {
      error: classIds.error,
      types: [],
    };
  }

  const entityClassId = classIds.classIds.get("entities");

  if (!entityClassId) {
    return {
      error: "Entity class was not found.",
      types: [],
    };
  }

  const { data, error } = await createSupabaseClient()
    .from("types")
    .select("id,label,slug")
    .eq("class_id", entityClassId)
    .or(`domain_id.is.null,domain_id.eq.${domainId}`)
    .order("label", { ascending: true });

  return {
    error: error?.message ?? null,
    types: data ?? [],
  };
}

async function claimTypeContext(domainId: string): Promise<{
  claimClassId: string | null;
  error: string | null;
  types: Array<{
    id: string;
    label: string;
    slug: string;
  }>;
}> {
  const classIds = await classIdsForOntology();

  if (classIds.error) {
    return {
      claimClassId: null,
      error: classIds.error,
      types: [],
    };
  }

  const claimClassId = classIds.classIds.get("claims") ?? null;

  if (!claimClassId) {
    return {
      claimClassId: null,
      error: "Claim class was not found.",
      types: [],
    };
  }

  const { data, error } = await createSupabaseClient()
    .from("types")
    .select("id,label,slug")
    .eq("class_id", claimClassId)
    .or(`domain_id.is.null,domain_id.eq.${domainId}`)
    .order("label", { ascending: true });

  return {
    claimClassId,
    error: error?.message ?? null,
    types: data ?? [],
  };
}

async function relationshipTypeContext(domainId: string): Promise<{
  error: string | null;
  relationshipClassId: string | null;
  types: Array<{
    id: string;
    label: string;
    slug: string;
  }>;
}> {
  const classIds = await classIdsForOntology();

  if (classIds.error) {
    return {
      error: classIds.error,
      relationshipClassId: null,
      types: [],
    };
  }

  const relationshipClassId = classIds.classIds.get("relationships") ?? null;

  if (!relationshipClassId) {
    return {
      error: "Relationship class was not found.",
      relationshipClassId: null,
      types: [],
    };
  }

  const { data, error } = await createSupabaseClient()
    .from("types")
    .select("id,label,slug")
    .eq("class_id", relationshipClassId)
    .or(`domain_id.is.null,domain_id.eq.${domainId}`)
    .order("label", { ascending: true });

  return {
    error: error?.message ?? null,
    relationshipClassId,
    types: data ?? [],
  };
}

async function domainEntityContext(domainId: string): Promise<{
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
    status: string | null;
    typeId: string | null;
  }>;
  entityClassId: string | null;
  error: string | null;
}> {
  const supabase = createSupabaseClient();
  const classIds = await classIdsForOntology();

  if (classIds.error) {
    return {
      entities: [],
      entityClassId: null,
      error: classIds.error,
    };
  }

  const entityClassId = classIds.classIds.get("entities") ?? null;

  if (!entityClassId) {
    return {
      entities: [],
      entityClassId: null,
      error: "Entity class was not found.",
    };
  }

  const statusResult = await statusIdsForTableSlugs("entities", ["canon", "proposed"]);

  if (statusResult.error) {
    return {
      entities: [],
      entityClassId,
      error: statusResult.error,
    };
  }

  const statusIdBySlug = statusResult.statusIds;
  const statusSlugById = new Map(Array.from(statusIdBySlug.entries()).map(([slug, id]) => [id, slug]));
  const statusIds = Array.from(statusIdBySlug.values());
  const { data: entities, error: entitiesError } = await supabase
    .from("entities")
    .select("id,label,type_id,status_id")
    .eq("domain_id", domainId)
    .in("status_id", statusIds)
    .order("label", { ascending: true });

  if (entitiesError) {
    return {
      entities: [],
      entityClassId,
      error: entitiesError.message,
    };
  }

  const entityIds = (entities ?? []).map((entity) => entity.id);
  const { data: aliases, error: aliasesError } =
    entityIds.length > 0
      ? await supabase
          .from("entity_aliases")
          .select("entity_id,alias")
          .in("entity_id", entityIds)
      : { data: [], error: null };

  if (aliasesError) {
    return {
      entities: [],
      entityClassId,
      error: aliasesError.message,
    };
  }

  const aliasesByEntityId = new Map<string, string[]>();

  for (const alias of aliases ?? []) {
    aliasesByEntityId.set(alias.entity_id, [
      ...(aliasesByEntityId.get(alias.entity_id) ?? []),
      alias.alias,
    ]);
  }

  return {
    entities: (entities ?? []).map((entity) => ({
      aliases: aliasesByEntityId.get(entity.id) ?? [],
      id: entity.id,
      label: entity.label,
      status: entity.status_id ? statusSlugById.get(entity.status_id) ?? null : null,
      typeId: entity.type_id,
    })),
    entityClassId,
    error: null,
  };
}

async function domainClaimContext(domainId: string): Promise<{
  claimClassId: string | null;
  claims: Array<{
    claimText: string;
    id: string;
    targetEntityIds: string[];
    typeId: string | null;
  }>;
  error: string | null;
}> {
  const classIds = await classIdsForOntology();

  if (classIds.error) {
    return {
      claimClassId: null,
      claims: [],
      error: classIds.error,
    };
  }

  const claimClassId = classIds.classIds.get("claims") ?? null;

  if (!claimClassId) {
    return {
      claimClassId: null,
      claims: [],
      error: "Claim class was not found.",
    };
  }

  const { data, error } = await createSupabaseClient()
    .from("claims")
    .select("id,claim_text,type_id,target_entity_ids")
    .eq("domain_id", domainId)
    .order("updated_at", { ascending: false });

  return {
    claimClassId,
    claims: (data ?? []).map((claim) => ({
      claimText: claim.claim_text,
      id: claim.id,
      targetEntityIds: sortedUniqueStrings(claim.target_entity_ids),
      typeId: claim.type_id,
    })),
    error: error?.message ?? null,
  };
}

async function domainRelationshipContext(
  domainId: string,
  sourceClassTableName: Extract<OntologyClassTableName, "claims" | "entities">,
  targetClassTableName: Extract<OntologyClassTableName, "claims" | "entities">,
): Promise<{
  error: string | null;
  relationshipClassId: string | null;
  relationships: Array<{
    id: string;
    sourceRecordId: string;
    targetRecordId: string;
    typeId: string;
  }>;
  sourceClassId: string | null;
  targetClassId: string | null;
}> {
  const classIds = await classIdsForOntology();

  if (classIds.error) {
    return {
      error: classIds.error,
      relationshipClassId: null,
      relationships: [],
      sourceClassId: null,
      targetClassId: null,
    };
  }

  const relationshipClassId = classIds.classIds.get("relationships") ?? null;
  const sourceClassId = classIds.classIds.get(sourceClassTableName) ?? null;
  const targetClassId = classIds.classIds.get(targetClassTableName) ?? null;

  if (!relationshipClassId || !sourceClassId || !targetClassId) {
    return {
      error: "Relationship endpoint classes were not found.",
      relationshipClassId,
      relationships: [],
      sourceClassId,
      targetClassId,
    };
  }

  const { data, error } = await createSupabaseClient()
    .from("relationships")
    .select("id,source_record_id,target_record_id,type_id")
    .eq("domain_id", domainId)
    .eq("source_class_id", sourceClassId)
    .eq("target_class_id", targetClassId)
    .order("updated_at", { ascending: false });

  return {
    error: error?.message ?? null,
    relationshipClassId,
    relationships: (data ?? []).map((relationship) => ({
      id: relationship.id,
      sourceRecordId: relationship.source_record_id,
      targetRecordId: relationship.target_record_id,
      typeId: relationship.type_id,
    })),
    sourceClassId,
    targetClassId,
  };
}

async function approveEntityCandidate(
  candidate: DistillationCandidateRecord,
  action: ReviewDistillationCandidateInput["action"],
): Promise<{
  error: string | null;
  id: string | null;
  ok: boolean;
}> {
  if (action !== "approve_canon" && action !== "approve_proposed" && action !== "approve") {
    return {
      error: "Choose approve canon or approve proposed for entity candidates.",
      id: null,
      ok: false,
    };
  }

  const supabase = createSupabaseClient();
  const payload = tableObject(candidate.payload);
  const label = stringValue(payload?.label);
  const typeId = stringValue(payload?.typeId);
  const aliases = stringArrayValue(payload?.aliases);
  const rationale = stringValue(payload?.rationale);
  const existingEntityId = stringValue(payload?.existingEntityId) || candidate.target_record_id;
  const { data: run, error: runError } = await supabase
    .from("distillation_shard_runs")
    .select("id,domain_id,document_id,shard_id")
    .eq("id", candidate.shard_run_id)
    .maybeSingle();

  if (runError) {
    return {
      error: runError.message,
      id: null,
      ok: false,
    };
  }

  if (!run) {
    return {
      error: "Shard run was not found.",
      id: null,
      ok: false,
    };
  }

  if (!label || !typeId) {
    return {
      error: "Entity candidate is missing its label or type.",
      id: null,
      ok: false,
    };
  }

  const statusSlug = action === "approve_proposed" ? "proposed" : "canon";
  const statusResult = await statusIdsForTableSlugs("entities", ["canon", "proposed"]);

  if (statusResult.error) {
    return {
      error: statusResult.error,
      id: null,
      ok: false,
    };
  }

  const statusId = statusResult.statusIds.get(statusSlug);

  if (!statusId) {
    return {
      error: `Entity ${statusSlug} status is required.`,
      id: null,
      ok: false,
    };
  }

  const existingEntity = existingEntityId
    ? await existingDomainEntity(run.domain_id, existingEntityId)
    : { entity: null, error: null };

  if (existingEntity.error) {
    return {
      error: existingEntity.error,
      id: null,
      ok: false,
    };
  }

  let entityId = existingEntity.entity?.id ?? null;
  const now = Date.now();

  if (entityId && existingEntity.entity) {
    const updateStatusId =
      statusSlug === "canon" || existingEntity.entity?.statusId !== statusResult.statusIds.get("canon")
        ? statusId
        : existingEntity.entity.statusId;
    const { error: updateError } = await supabase
      .from("entities")
      .update({
        status_id: updateStatusId,
        updated_at: now,
      })
      .eq("id", entityId);

    if (updateError) {
      return {
        error: updateError.message,
        id: null,
        ok: false,
      };
    }
  } else {
    const createResult = await createEntityCommand({
      domainId: run.domain_id,
      kindId: null,
      label,
      now,
      statusId,
      typeId,
    });

    if (!createResult.ok || !createResult.id) {
      return {
        error: createResult.error ?? "Entity could not be created.",
        id: null,
        ok: false,
      };
    }

    entityId = createResult.id;
  }

  await createEntityAliases({
    aliases,
    canonicalLabel: existingEntity.entity?.label ?? label,
    documentId: run.document_id,
    domainId: run.domain_id,
    entityId,
    now,
  });
  const sourceResult = await writeRecordSource({
    candidateId: candidate.id,
    classTableName: "entities",
    documentId: run.document_id,
    domainId: run.domain_id,
    evidenceKind: "mentions",
    metadata: {
      aliases,
      approvalAction: statusSlug === "canon" ? "approve_canon" : "approve_proposed",
      candidateLabel: label,
      existingEntityId: existingEntityId || null,
      rationale: rationale || null,
      status: statusSlug,
      typeId,
    },
    recordId: entityId,
    shardId: run.shard_id,
  });

  if (sourceResult.error) {
    return {
      error: sourceResult.error,
      id: null,
      ok: false,
    };
  }

  const reviewedAt = Date.now();
  const { error: updateCandidateError } = await supabase
    .from("distillation_candidates")
    .update({
      approval_action: statusSlug === "canon" ? "approve_canon" : "approve_proposed",
      reviewed_at: reviewedAt,
      status: "approved",
      target_record_id: entityId,
      updated_at: reviewedAt,
    })
    .eq("id", candidate.id);

  return {
    error: updateCandidateError?.message ?? null,
    id: entityId,
    ok: !updateCandidateError,
  };
}

async function approveClaimCandidate(candidate: DistillationCandidateRecord): Promise<{
  error: string | null;
  id: string | null;
  ok: boolean;
}> {
  const supabase = createSupabaseClient();
  const payload = tableObject(candidate.payload);
  const statement = stringValue(payload?.statement);
  const typeId = stringValue(payload?.typeId);
  const sourceType = stringValue(payload?.sourceType);
  const targetEntityIds = sortedUniqueStrings(stringArrayValue(payload?.targetEntityIds));
  const existingClaimId = stringValue(payload?.existingClaimId) || candidate.target_record_id;
  const { data: run, error: runError } = await supabase
    .from("distillation_shard_runs")
    .select("id,domain_id,document_id,shard_id")
    .eq("id", candidate.shard_run_id)
    .maybeSingle();

  if (runError) {
    return {
      error: runError.message,
      id: null,
      ok: false,
    };
  }

  if (!run) {
    return {
      error: "Shard run was not found.",
      id: null,
      ok: false,
    };
  }

  if (!statement || !typeId || targetEntityIds.length === 0) {
    return {
      error: "Claim candidate is missing its statement, type, or targets.",
      id: null,
      ok: false,
    };
  }

  const claimTypes = await claimTypeContext(run.domain_id);

  if (claimTypes.error) {
    return {
      error: claimTypes.error,
      id: null,
      ok: false,
    };
  }

  if (!claimTypes.types.some((type) => type.id === typeId)) {
    return {
      error: "Claim type is not available in this domain.",
      id: null,
      ok: false,
    };
  }

  const entityContext = await domainEntityContext(run.domain_id);

  if (entityContext.error) {
    return {
      error: entityContext.error,
      id: null,
      ok: false,
    };
  }

  const entityIds = new Set(entityContext.entities.map((entity) => entity.id));
  const missingEntityId = targetEntityIds.find((entityId) => !entityIds.has(entityId));

  if (missingEntityId) {
    return {
      error: "Claim target entity is not available in this domain.",
      id: null,
      ok: false,
    };
  }

  const claimContext = await domainClaimContext(run.domain_id);

  if (claimContext.error) {
    return {
      error: claimContext.error,
      id: null,
      ok: false,
    };
  }

  let claimId = existingClaimId
    ? claimContext.claims.find((claim) => claim.id === existingClaimId)?.id ?? null
    : null;

  if (!claimId) {
    claimId = findExistingDomainClaim(claimContext.claims, statement, targetEntityIds)?.id ?? null;
  }

  if (!claimId) {
    const createResult = await createClaimCommand({
      claimText: statement,
      domainId: run.domain_id,
      kindId: null,
      now: Date.now(),
      sourceDocumentId: run.document_id,
      statusId: null,
      targetEntityIds,
      typeId,
    });

    if (!createResult.ok || !createResult.id) {
      return {
        error: createResult.error ?? "Claim could not be created.",
        id: null,
        ok: false,
      };
    }

    claimId = createResult.id;
  }

  const sourceResult = await writeRecordSource({
    candidateId: candidate.id,
    classTableName: "claims",
    documentId: run.document_id,
    domainId: run.domain_id,
    evidenceKind: sourceType === "inferred" ? "inferred_from" : "supports",
    recordId: claimId,
    shardId: run.shard_id,
  });

  if (sourceResult.error) {
    return {
      error: sourceResult.error,
      id: null,
      ok: false,
    };
  }

  const reviewedAt = Date.now();
  const { error: updateCandidateError } = await supabase
    .from("distillation_candidates")
    .update({
      approval_action: "approve",
      reviewed_at: reviewedAt,
      status: "approved",
      target_record_id: claimId,
      updated_at: reviewedAt,
    })
    .eq("id", candidate.id);

  return {
    error: updateCandidateError?.message ?? null,
    id: claimId,
    ok: !updateCandidateError,
  };
}

async function approveRelationshipCandidate(candidate: DistillationCandidateRecord): Promise<{
  error: string | null;
  id: string | null;
  ok: boolean;
}> {
  const supabase = createSupabaseClient();
  const payload = tableObject(candidate.payload);
  const sourceClassTableName = stringValue(payload?.sourceClassTableName);
  const targetClassTableName = stringValue(payload?.targetClassTableName);
  const sourceRecordId = stringValue(payload?.sourceRecordId);
  const targetRecordId = stringValue(payload?.targetRecordId);
  const typeId = stringValue(payload?.typeId);
  const existingRelationshipId = stringValue(payload?.existingRelationshipId) || candidate.target_record_id;
  const { data: run, error: runError } = await supabase
    .from("distillation_shard_runs")
    .select("id,domain_id,document_id,shard_id")
    .eq("id", candidate.shard_run_id)
    .maybeSingle();

  if (runError) {
    return {
      error: runError.message,
      id: null,
      ok: false,
    };
  }

  if (!run) {
    return {
      error: "Shard run was not found.",
      id: null,
      ok: false,
    };
  }

  if (
    !isRelationshipEndpointClass(sourceClassTableName) ||
    !isRelationshipEndpointClass(targetClassTableName) ||
    !sourceRecordId ||
    !targetRecordId ||
    sourceRecordId === targetRecordId ||
    !typeId
  ) {
    return {
      error: "Relationship candidate is missing its endpoints or type.",
      id: null,
      ok: false,
    };
  }

  const relationshipTypes = await relationshipTypeContext(run.domain_id);

  if (relationshipTypes.error) {
    return {
      error: relationshipTypes.error,
      id: null,
      ok: false,
    };
  }

  if (!relationshipTypes.types.some((type) => type.id === typeId)) {
    return {
      error: "Relationship type is not available in this domain.",
      id: null,
      ok: false,
    };
  }

  const endpointResult = await validateRelationshipEndpoints({
    domainId: run.domain_id,
    sourceClassTableName,
    sourceRecordId,
    targetClassTableName,
    targetRecordId,
  });

  if (endpointResult.error) {
    return {
      error: endpointResult.error,
      id: null,
      ok: false,
    };
  }

  const relationshipContext = await domainRelationshipContext(run.domain_id, sourceClassTableName, targetClassTableName);

  if (relationshipContext.error) {
    return {
      error: relationshipContext.error,
      id: null,
      ok: false,
    };
  }

  if (!relationshipContext.sourceClassId || !relationshipContext.targetClassId) {
    return {
      error: "Relationship endpoint classes were not found.",
      id: null,
      ok: false,
    };
  }

  let relationshipId = existingRelationshipId
    ? relationshipContext.relationships.find((relationship) => relationship.id === existingRelationshipId)?.id ?? null
    : null;

  if (!relationshipId) {
    relationshipId =
      relationshipContext.relationships.find(
        (relationship) =>
          relationshipDedupeKey(relationship.sourceRecordId, relationship.targetRecordId, relationship.typeId) ===
          relationshipDedupeKey(sourceRecordId, targetRecordId, typeId),
      )?.id ?? null;
  }

  if (!relationshipId) {
    const createResult = await createRelationshipCommand({
      domainId: run.domain_id,
      kindId: null,
      now: Date.now(),
      sourceClassId: relationshipContext.sourceClassId,
      sourceRecordId,
      statusId: null,
      targetClassId: relationshipContext.targetClassId,
      targetRecordId,
      typeId,
    });

    if (!createResult.ok || !createResult.id) {
      return {
        error: createResult.error ?? "Relationship could not be created.",
        id: null,
        ok: false,
      };
    }

    relationshipId = createResult.id;
  }

  const sourceResult = await writeRecordSource({
    candidateId: candidate.id,
    classTableName: "relationships",
    documentId: run.document_id,
    domainId: run.domain_id,
    evidenceKind: "supports",
    recordId: relationshipId,
    shardId: run.shard_id,
  });

  if (sourceResult.error) {
    return {
      error: sourceResult.error,
      id: null,
      ok: false,
    };
  }

  const reviewedAt = Date.now();
  const { error: updateCandidateError } = await supabase
    .from("distillation_candidates")
    .update({
      approval_action: "approve",
      reviewed_at: reviewedAt,
      status: "approved",
      target_record_id: relationshipId,
      updated_at: reviewedAt,
    })
    .eq("id", candidate.id);

  return {
    error: updateCandidateError?.message ?? null,
    id: relationshipId,
    ok: !updateCandidateError,
  };
}

async function approvePromotionCandidate(candidate: DistillationCandidateRecord): Promise<{
  error: string | null;
  id: string | null;
  ok: boolean;
}> {
  const supabase = createSupabaseClient();
  const payload = tableObject(candidate.payload);
  const entityId = stringValue(payload?.entityId) || candidate.target_record_id;
  const { data: run, error: runError } = await supabase
    .from("distillation_shard_runs")
    .select("id,domain_id")
    .eq("id", candidate.shard_run_id)
    .maybeSingle();

  if (runError) {
    return {
      error: runError.message,
      id: null,
      ok: false,
    };
  }

  if (!run) {
    return {
      error: "Shard run was not found.",
      id: null,
      ok: false,
    };
  }

  if (!entityId) {
    return {
      error: "Promotion candidate is missing its entity.",
      id: null,
      ok: false,
    };
  }

  const entityResult = await existingDomainEntity(run.domain_id, entityId);

  if (entityResult.error) {
    return {
      error: entityResult.error,
      id: null,
      ok: false,
    };
  }

  const statusResult = await statusIdsForTableSlugs("entities", ["canon"]);

  if (statusResult.error) {
    return {
      error: statusResult.error,
      id: null,
      ok: false,
    };
  }

  const canonStatusId = statusResult.statusIds.get("canon") ?? null;

  if (!canonStatusId) {
    return {
      error: "Entity canon status is required.",
      id: null,
      ok: false,
    };
  }

  const now = Date.now();
  const { error: updateEntityError } = await supabase
    .from("entities")
    .update({
      status_id: canonStatusId,
      updated_at: now,
    })
    .eq("id", entityId);

  if (updateEntityError) {
    return {
      error: updateEntityError.message,
      id: null,
      ok: false,
    };
  }

  const { error: updateCandidateError } = await supabase
    .from("distillation_candidates")
    .update({
      approval_action: "approve_promotion",
      reviewed_at: now,
      status: "approved",
      target_record_id: entityId,
      updated_at: now,
    })
    .eq("id", candidate.id);

  return {
    error: updateCandidateError?.message ?? null,
    id: entityId,
    ok: !updateCandidateError,
  };
}

async function existingDomainEntity(domainId: string, entityId: string): Promise<{
  entity: {
    id: string;
    label: string;
    statusId: string | null;
  } | null;
  error: string | null;
}> {
  const { data, error } = await createSupabaseClient()
    .from("entities")
    .select("id,domain_id,label,status_id")
    .eq("id", entityId)
    .maybeSingle();

  if (error) {
    return {
      entity: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      entity: null,
      error: "Matched entity was not found.",
    };
  }

  if (data.domain_id !== domainId) {
    return {
      entity: null,
      error: "Matched entity belongs to a different domain.",
    };
  }

  return {
    entity: {
      id: data.id,
      label: data.label,
      statusId: data.status_id,
    },
    error: null,
  };
}

async function validateRelationshipEndpoints({
  domainId,
  sourceClassTableName,
  sourceRecordId,
  targetClassTableName,
  targetRecordId,
}: {
  domainId: string;
  sourceClassTableName: Extract<OntologyClassTableName, "claims" | "entities">;
  sourceRecordId: string;
  targetClassTableName: Extract<OntologyClassTableName, "claims" | "entities">;
  targetRecordId: string;
}): Promise<{ error: string | null }> {
  const sourceResult = await validateRelationshipEndpoint(domainId, sourceClassTableName, sourceRecordId, "source");

  if (sourceResult.error) {
    return sourceResult;
  }

  return await validateRelationshipEndpoint(domainId, targetClassTableName, targetRecordId, "target");
}

async function validateRelationshipEndpoint(
  domainId: string,
  classTableName: Extract<OntologyClassTableName, "claims" | "entities">,
  recordId: string,
  endpointLabel: "source" | "target",
): Promise<{ error: string | null }> {
  const { data, error } = await createSupabaseClient()
    .from(classTableName)
    .select("id,domain_id")
    .eq("id", recordId)
    .maybeSingle();

  if (error) {
    return {
      error: error.message,
    };
  }

  if (!data) {
    return {
      error: `Relationship ${endpointLabel} was not found.`,
    };
  }

  if (data.domain_id !== domainId) {
    return {
      error: `Relationship ${endpointLabel} belongs to a different domain.`,
    };
  }

  return {
    error: null,
  };
}

async function createEntityAliases({
  aliases,
  canonicalLabel,
  documentId,
  domainId,
  entityId,
  now,
}: {
  aliases: string[];
  canonicalLabel: string;
  documentId: string;
  domainId: string;
  entityId: string;
  now: number;
}) {
  const canonicalKey = normalizeEntityLabel(canonicalLabel);
  const cleanAliasList = cleanAliases(aliases, canonicalLabel).filter((alias) => normalizeEntityLabel(alias) !== canonicalKey);

  if (cleanAliasList.length === 0) {
    return;
  }

  const { data } = await createSupabaseClient()
    .from("entity_aliases")
    .select("alias,normalized_alias")
    .eq("entity_id", entityId);
  const existingAliases = new Set(
    (data ?? []).map((alias) => alias.normalized_alias || normalizeEntityLabel(alias.alias)),
  );

  for (const alias of cleanAliasList) {
    const aliasKey = normalizeEntityLabel(alias);

    if (!aliasKey || existingAliases.has(aliasKey)) {
      continue;
    }

    const result = await createSimpleCurationRecordCommand({
      alias,
      domainId,
      entityId,
      now,
      sourceDocumentId: documentId,
      statusId: null,
      tableName: "entity_aliases",
    });

    if (result.ok) {
      existingAliases.add(aliasKey);
    }
  }
}

async function writeRecordSource({
  candidateId,
  classTableName,
  documentId,
  domainId,
  evidenceKind,
  metadata,
  recordId,
  shardId,
}: {
  candidateId: string | null;
  classTableName: OntologyClassTableName;
  documentId: string;
  domainId: string;
  evidenceKind: "generated_from" | "supports" | "mentions" | "inferred_from" | "reviewed_from";
  metadata?: TableValue;
  recordId: string;
  shardId: string;
}) {
  const classIds = await classIdsForOntology();

  if (classIds.error) {
    return { error: classIds.error };
  }

  const sourceClassId = classIds.classIds.get(classTableName);

  if (!sourceClassId) {
    return { error: `Class ${classTableName} was not found.` };
  }

  const now = Date.now();
  const { error } = await createSupabaseClient().from("record_sources").insert({
    candidate_id: candidateId,
    created_at: now,
    document_id: documentId,
    domain_id: domainId,
    evidence_kind: evidenceKind,
    metadata: metadata ?? {},
    shard_id: shardId,
    source_class_id: sourceClassId,
    source_record_id: recordId,
    updated_at: now,
  });

  return { error: error?.message ?? null };
}

async function statusIdsForTableSlugs(tableName: string, slugs: string[]): Promise<{
  error: string | null;
  statusIds: Map<string, string>;
}> {
  const supabase = createSupabaseClient();
  const { data: classRecord, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("table_name", tableName)
    .maybeSingle();

  if (classError) {
    return {
      error: classError.message,
      statusIds: new Map(),
    };
  }

  if (!classRecord) {
    return {
      error: `Class ${tableName} was not found.`,
      statusIds: new Map(),
    };
  }

  const { data, error } = await supabase
    .from("statuses")
    .select("id,slug")
    .eq("class_id", classRecord.id)
    .in("slug", slugs);

  if (error) {
    return {
      error: error.message,
      statusIds: new Map(),
    };
  }

  const statusIds = new Map((data ?? []).map((status) => [status.slug, status.id]));
  const missingSlug = slugs.find((slug) => !statusIds.has(slug));

  return {
    error: missingSlug ? `Status ${missingSlug} was not found for ${tableName}.` : null,
    statusIds,
  };
}

async function classIdsForOntology(): Promise<{
  classIds: Map<OntologyClassTableName, string>;
  error: string | null;
}> {
  const tableNames: OntologyClassTableName[] = ["entities", "claims", "relationships"];
  const { data, error } = await createSupabaseClient()
    .from("classes")
    .select("id,table_name")
    .in("table_name", tableNames);

  if (error) {
    return {
      classIds: new Map(),
      error: error.message,
    };
  }

  const classIds = new Map<OntologyClassTableName, string>();

  for (const row of data ?? []) {
    if (isOntologyClassTableName(row.table_name)) {
      classIds.set(row.table_name, row.id);
    }
  }

  const missingClass = tableNames.find((tableName) => !classIds.has(tableName));

  return {
    classIds,
    error: missingClass ? `Class ${missingClass} was not found.` : null,
  };
}

async function candidateDedupeKeys(stageRunId: string): Promise<{
  error: string | null;
  keys: Set<string>;
}> {
  const { data, error } = await createSupabaseClient()
    .from("distillation_candidates")
    .select("dedupe_key")
    .eq("stage_run_id", stageRunId);

  if (error) {
    return {
      error: error.message,
      keys: new Set(),
    };
  }

  return {
    error: null,
    keys: new Set((data ?? []).map((candidate) => candidate.dedupe_key).filter((key): key is string => Boolean(key))),
  };
}

async function approveOntologyTypeCandidate(candidate: DistillationCandidateRecord): Promise<{
  error: string | null;
  id: string | null;
  ok: boolean;
}> {
  const payload = tableObject(candidate.payload);
  const classTableName = stringValue(payload?.classTableName);
  const label = stringValue(payload?.label);
  const slug = normalizeSlug(stringValue(payload?.slug) || label);

  if (!isOntologyClassTableName(classTableName) || !label || !slug || !candidate.target_class_id) {
    return {
      error: "Ontology candidate is missing its class, label, or slug.",
      id: null,
      ok: false,
    };
  }

  const supabase = createSupabaseClient();
  const { data: run, error: runError } = await supabase
    .from("distillation_shard_runs")
    .select("id,domain_id")
    .eq("id", candidate.shard_run_id)
    .maybeSingle();

  if (runError) {
    return {
      error: runError.message,
      id: null,
      ok: false,
    };
  }

  if (!run) {
    return {
      error: "Shard run was not found.",
      id: null,
      ok: false,
    };
  }

  const { data: existingType, error: existingError } = await supabase
    .from("types")
    .select("id")
    .eq("domain_id", run.domain_id)
    .eq("class_id", candidate.target_class_id)
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    return {
      error: existingError.message,
      id: null,
      ok: false,
    };
  }

  let typeId = existingType?.id ?? null;

  if (!typeId) {
    const now = Date.now();
    const typePayload: ClassTypeInsert = {
      class_id: candidate.target_class_id,
      created_at: now,
      domain_id: run.domain_id,
      label,
      slug,
      status_id: null,
      updated_at: now,
    };
    const { data: insertedType, error: insertError } = await supabase
      .from("types")
      .insert(typePayload)
      .select("id")
      .single();

    if (insertError) {
      return {
        error: insertError.message,
        id: null,
        ok: false,
      };
    }

    typeId = insertedType.id;
  }

  const reviewedAt = Date.now();
  const { error: updateError } = await supabase
    .from("distillation_candidates")
    .update({
      approval_action: "approve_type",
      reviewed_at: reviewedAt,
      status: "approved",
      target_record_id: typeId,
      updated_at: reviewedAt,
    })
    .eq("id", candidate.id);

  return {
    error: updateError?.message ?? null,
    id: typeId,
    ok: !updateError,
  };
}

async function refreshStageReviewStatus(stageRunId: string) {
  const supabase = createSupabaseClient();
  const { data: candidates, error } = await supabase
    .from("distillation_candidates")
    .select("status")
    .eq("stage_run_id", stageRunId);

  if (error) {
    return;
  }

  const candidateCount = candidates?.length ?? 0;
  const approvedCount = (candidates ?? []).filter((candidate) => candidate.status === "approved").length;
  const rejectedCount = (candidates ?? []).filter((candidate) => candidate.status === "rejected").length;
  const pendingCount = (candidates ?? []).filter((candidate) => candidate.status === "pending").length;
  const completedAt = pendingCount === 0 ? Date.now() : null;
  const nextStatus = pendingCount === 0 ? "completed" : "needs_review";
  const { data: stageRun } = await supabase
    .from("distillation_stage_runs")
    .update({
      approved_count: approvedCount,
      candidate_count: candidateCount,
      completed_at: completedAt,
      rejected_count: rejectedCount,
      status: nextStatus,
      updated_at: Date.now(),
    })
    .eq("id", stageRunId)
    .select("shard_run_id,stage,stage_order")
    .maybeSingle();

  if (!stageRun) {
    return;
  }

  if (pendingCount > 0) {
    await supabase
      .from("distillation_shard_runs")
      .update({
        current_stage: stageRun.stage,
        status: "needs_review",
        updated_at: Date.now(),
      })
      .eq("id", stageRun.shard_run_id);
    return;
  }

  const nextStage = shardDistillationStages.find((stage) => stage.order > stageRun.stage_order)?.id ?? "complete";
  await supabase
    .from("distillation_shard_runs")
    .update({
      completed_at: nextStage === "complete" ? Date.now() : null,
      current_stage: nextStage,
      status: nextStage === "complete" ? "completed" : "draft",
      updated_at: Date.now(),
    })
    .eq("id", stageRun.shard_run_id);
}

function atlasGenerationSettings(
  input: ShardDistillationModelSettingsInput | null | undefined,
  fallbackModel: string,
): AtlasGenerationSettings {
  const selectedModel = findAtlasChatModelOption(input?.model ?? null);
  const defaultSettings = defaultAtlasDistillationModelSettings();
  const model = selectedModel?.id ?? (fallbackModel || defaultSettings.model);
  const effort = isAtlasChatEffort(input?.effort) ? input.effort : defaultAtlasChatEffort;

  return {
    effort,
    model,
    providerOptions: selectedModel ? providerOptionsForAtlasChatModel(selectedModel, effort) : undefined,
  };
}

function isOntologyTypeCandidate(candidate: DistillationCandidateRecord) {
  return (
    candidate.stage === "ontology" &&
    (candidate.candidate_kind === "entity_type" ||
      candidate.candidate_kind === "claim_type" ||
      candidate.candidate_kind === "relationship_type")
  );
}

function isOntologyClassTableName(value: string): value is OntologyClassTableName {
  return value === "entities" || value === "claims" || value === "relationships";
}

function isRelationshipEndpointClass(
  value: string,
): value is Extract<OntologyClassTableName, "claims" | "entities"> {
  return value === "claims" || value === "entities";
}

function stageLabel(stage: DistillationPipelineStage) {
  if (stage === "entity_relationships") {
    return "entity relationships";
  }

  if (stage === "claim_relationships") {
    return "claim relationships";
  }

  return stage.replaceAll("_", " ");
}

function tableObject(value: TableValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function stringValue(value: TableValue | undefined) {
  return typeof value === "string" ? value : "";
}

function stringArrayValue(value: TableValue | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function cleanAliases(aliases: string[], label: string) {
  const labelKey = normalizeEntityLabel(label);
  const aliasByKey = new Map<string, string>();

  for (const alias of aliases) {
    const cleanAlias = alias.trim();
    const key = normalizeEntityLabel(cleanAlias);

    if (!cleanAlias || !key || key === labelKey || aliasByKey.has(key)) {
      continue;
    }

    aliasByKey.set(key, cleanAlias);
  }

  return Array.from(aliasByKey.values());
}

function findExistingDomainClaim(
  claims: Array<{
    claimText: string;
    id: string;
    targetEntityIds: string[];
  }>,
  statement: string,
  targetEntityIds: string[],
) {
  const dedupeKey = claimDedupeKey(statement, targetEntityIds);

  return claims.find((claim) => claimDedupeKey(claim.claimText, claim.targetEntityIds) === dedupeKey) ?? null;
}

function claimDedupeKey(statement: string, targetEntityIds: string[]) {
  return `${normalizeClaimText(statement)}:${sortedUniqueStrings(targetEntityIds).join(",")}`;
}

function relationshipDedupeKey(sourceRecordId: string, targetRecordId: string, typeId: string) {
  return `${sourceRecordId}:${targetRecordId}:${typeId}`;
}

function normalizeClaimText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
}

function sortedUniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((first, second) =>
    first.localeCompare(second),
  );
}

function normalizeEntityLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shardRunError(error: string): CreateDistillationShardRunResult {
  return {
    error,
    ok: false,
    run: null,
    stages: [],
  };
}

function stageRunError(error: string): RunDistillationShardStageResult {
  return {
    candidateCount: 0,
    error,
    ok: false,
    stageRun: null,
  };
}

function candidateReviewError(error: string): ReviewDistillationCandidateResult {
  return {
    error,
    ok: false,
    targetRecordId: null,
  };
}
