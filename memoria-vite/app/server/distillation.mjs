import {
  all,
  db,
  ensureTypeCard,
  get,
  id,
  now,
  recordLexicalizations,
  run,
  slugify
} from "./db.mjs";
import { runSubjectsDistillation } from "./distillation-codex.mjs";

export const DISTILLATION_STAGES = [
  { key: "ontology", label: "Ontology", order: 0 },
  { key: "subjects", label: "Subjects", order: 1 },
  { key: "claims", label: "Claims", order: 2 },
  { key: "subject_relations", label: "Subject Relations", order: 3 },
  { key: "claim_relations", label: "Claim Relations", order: 4 },
  { key: "promotion", label: "Promotion", order: 5 }
];

const SUBJECT_CANDIDATE_KINDS = new Set(["subject", "alias", "claim", "subject_relationship", "claim_relationship"]);
const RUN_STATUS_GROUPS = ["needs_admission", "partially_admitted", "admitted", "failed", "archived"];
const NO_DOMAIN_ID = "__no_domain__";

export function distillationSnapshot(input = {}) {
  const domainId = nullableText(input.domainId ?? input.domain_id);
  const documents = listDistillationDocuments(domainId);
  const runs = listRunSummaries(domainId);
  const selectedDocumentId = input.documentId ?? runs[0]?.document_id ?? documents[0]?.id ?? null;
  const selectedRunId = input.runId ?? runs.find((candidate) => candidate.document_id === selectedDocumentId)?.id ?? runs[0]?.id ?? null;

  return {
    documents,
    runs,
    selectedDocumentId,
    selectedRunId,
    stages: DISTILLATION_STAGES,
    selectedRun: selectedRunId ? readDistillationRun(selectedRunId) : null
  };
}

export function admissionSnapshot(input = {}) {
  const runs = listRunSummaries();
  const selectedRunId = input.runId ?? runs.find((candidate) => candidate.status !== "admitted" && candidate.status !== "archived")?.id ?? runs[0]?.id ?? null;
  const groupedRuns = Object.fromEntries(RUN_STATUS_GROUPS.map((status) => [status, []]));

  for (const distillationRun of runs) {
    const group = groupedRuns[distillationRun.status] ? distillationRun.status : "needs_admission";
    groupedRuns[group].push(distillationRun);
  }

  return {
    groupedRuns,
    runs,
    selectedRunId,
    selectedRun: selectedRunId ? readDistillationRun(selectedRunId) : null
  };
}

export function createOrReadDistillationRun(input = {}) {
  const documentId = requiredText(input.document_id ?? input.documentId, "Document is required.");
  const document = get(`SELECT id, domain_id, label FROM documents WHERE id = ?`, documentId);

  if (!document) {
    throw new Error("Document not found.");
  }

  const domainId = nullableText(input.domain_id ?? input.domainId) ?? document.domain_id ?? null;
  const existingRun = get(
    `
      SELECT *
      FROM distillation_runs
      WHERE document_id = ?
        AND COALESCE(domain_id, '') = COALESCE(?, '')
        AND status != 'archived'
      ORDER BY created DESC
      LIMIT 1
    `,
    documentId,
    domainId
  );

  if (existingRun?.id) {
    return readDistillationRun(existingRun.id);
  }

  const timestamp = now();
  const runId = id("dist_run");
  const bundleId = id("bundle");

  db.exec("BEGIN");
  try {
    run(
      `
        INSERT INTO distillation_runs (
          id, domain_id, document_id, status, current_stage,
          settings_json, summary_json, created, updated
        )
        VALUES (?, ?, ?, 'draft', 'ontology', '{}', '{}', ?, ?)
      `,
      runId,
      domainId,
      documentId,
      timestamp,
      timestamp
    );

    for (const stage of DISTILLATION_STAGES) {
      run(
        `
          INSERT INTO distillation_stage_runs (
            id, run_id, stage, stage_order, status, created, updated
          )
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `,
        id("dist_stage"),
        runId,
        stage.key,
        stage.order,
        timestamp,
        timestamp
      );
    }

    run(
      `
        INSERT INTO candidate_bundles (
          id, domain_id, distillation_run_id, bundle_kind, status,
          source_context_json, payload_json, created, updated
        )
        VALUES (?, ?, ?, 'distillation_run', 'draft', ?, '{}', ?, ?)
      `,
      bundleId,
      domainId,
      runId,
      JSON.stringify({
        document_id: documentId,
        domain_id: domainId,
        run_id: runId
      }),
      timestamp,
      timestamp
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return readDistillationRun(runId);
}

export async function runDistillationStage(runId, stageKey) {
  const runRecord = get(`SELECT * FROM distillation_runs WHERE id = ?`, runId);
  const stage = DISTILLATION_STAGES.find((candidate) => candidate.key === stageKey);

  if (!runRecord) {
    throw new Error("Distillation run not found.");
  }

  if (!stage) {
    throw new Error("Distillation stage not found.");
  }

  if (stage.key !== "subjects") {
    markStageFailed(runId, stage.key, "This stage is wired in the workflow shell but is not implemented yet.");
    return readDistillationRun(runId);
  }

  const timestamp = now();

  db.exec("BEGIN");
  try {
    run(
      `
        UPDATE distillation_runs
        SET status = 'running', current_stage = ?, error_message = NULL, updated = ?
        WHERE id = ?
      `,
      stage.key,
      timestamp,
      runId
    );
    run(
      `
        UPDATE distillation_stage_runs
        SET status = 'running', error_message = NULL, started = ?, completed = NULL, updated = ?
        WHERE run_id = ? AND stage = ?
      `,
      timestamp,
      timestamp,
      runId,
      stage.key
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  try {
    const generated = await runSubjectsDistillation(runRecord);
    const bundle = ensureRunBundle(runRecord);
    const completedAt = now();

    db.exec("BEGIN");
    try {
      run(
        `
          UPDATE candidates
          SET status = 'failed', review_json = ?, updated = ?
          WHERE bundle_id = ?
            AND status = 'pending'
            AND json_extract(payload_json, '$.stage') = ?
        `,
        JSON.stringify({ superseded_by_stage_rerun: true }),
        completedAt,
        bundle.id,
        stage.key
      );

      for (const candidate of generated.candidates) {
        insertCandidate(bundle.id, candidate, completedAt);
      }

      run(
        `
          UPDATE distillation_stage_runs
          SET status = 'completed',
              candidate_count = ?,
              result_summary_json = ?,
              raw_output_json = ?,
              prompt_ref = ?,
              model = ?,
              error_message = NULL,
              completed = ?,
              updated = ?
          WHERE run_id = ? AND stage = ?
        `,
        generated.candidates.length,
        JSON.stringify(generated.summary),
        JSON.stringify(generated.rawOutput),
        generated.promptRef,
        generated.model,
        completedAt,
        completedAt,
        runId,
        stage.key
      );
      run(
        `
          UPDATE distillation_runs
          SET status = 'needs_admission',
              current_stage = ?,
              summary_json = ?,
              error_message = NULL,
              updated = ?
          WHERE id = ?
        `,
        nextStageKey(stage.key),
        JSON.stringify({ last_stage: stage.key, candidate_count: generated.candidates.length }),
        completedAt,
        runId
      );
      run(
        `
          UPDATE candidate_bundles
          SET status = 'ready', updated = ?
          WHERE id = ?
        `,
        completedAt,
        bundle.id
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    markStageFailed(runId, stage.key, error instanceof Error ? error.message : "Stage failed.");
  }

  return readDistillationRun(runId);
}

export function resetDistillationRun(runId) {
  const runRecord = get(`SELECT * FROM distillation_runs WHERE id = ?`, runId);

  if (!runRecord) {
    throw new Error("Distillation run not found.");
  }

  const timestamp = now();
  const bundle = get(`SELECT * FROM candidate_bundles WHERE distillation_run_id = ?`, runId);

  db.exec("BEGIN");
  try {
    run(
      `
        UPDATE distillation_runs
        SET status = 'draft',
            current_stage = 'ontology',
            summary_json = '{}',
            error_message = NULL,
            updated = ?
        WHERE id = ?
      `,
      timestamp,
      runId
    );
    run(
      `
        UPDATE distillation_stage_runs
        SET status = 'pending',
            candidate_count = 0,
            result_summary_json = '{}',
            raw_output_json = '{}',
            prompt_ref = NULL,
            model = NULL,
            error_message = NULL,
            started = NULL,
            completed = NULL,
            updated = ?
        WHERE run_id = ?
      `,
      timestamp,
      runId
    );

    if (bundle?.id) {
      run(
        `
          DELETE FROM candidates
          WHERE bundle_id = ?
            AND status IN ('pending', 'waiting', 'failed')
        `,
        bundle.id
      );
      run(
        `
          UPDATE candidate_bundles
          SET status = 'draft', updated = ?
          WHERE id = ?
        `,
        timestamp,
        bundle.id
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return readDistillationRun(runId);
}

export function readDistillationRun(runId) {
  const runRecord = get(
    `
      SELECT
        distillation_runs.*,
        documents.label AS document_label
      FROM distillation_runs
      JOIN documents ON documents.id = distillation_runs.document_id
      WHERE distillation_runs.id = ?
    `,
    runId
  );

  if (!runRecord) {
    return null;
  }

  const bundle = get(`SELECT * FROM candidate_bundles WHERE distillation_run_id = ?`, runId) ?? null;
  const candidates = bundle
    ? all(
        `
          SELECT *
          FROM candidates
          WHERE bundle_id = ?
          ORDER BY created ASC, id ASC
        `,
        bundle.id
      ).map(serializeCandidate)
    : [];

  return {
    bundle: bundle ? serializeBundle(bundle) : null,
    candidates,
    candidateCounts: candidateCounts(candidates),
    decisions: all(
      `
        SELECT admission_decisions.*
        FROM admission_decisions
        JOIN candidates ON candidates.id = admission_decisions.candidate_id
        ${bundle ? "WHERE candidates.bundle_id = ?" : "WHERE 1 = 0"}
        ORDER BY admission_decisions.created ASC
      `,
      ...(bundle ? [bundle.id] : [])
    ).map(serializeDecision),
    run: serializeRun(runRecord),
    stages: all(
      `
        SELECT *
        FROM distillation_stage_runs
        WHERE run_id = ?
        ORDER BY stage_order ASC
      `,
      runId
    ).map(serializeStageRun),
    subjectPackages: subjectPackages(candidates)
  };
}

export function resolveAdmissionSubject(input = {}) {
  const runId = requiredText(input.run_id ?? input.runId, "Run is required.");
  const localSubjectId = requiredText(input.local_subject_id ?? input.localSubjectId, "Subject package is required.");
  const disposition = requiredText(input.disposition, "Disposition is required.");
  const detail = readDistillationRun(runId);

  if (!detail?.bundle) {
    throw new Error("Distillation run candidates were not found.");
  }

  const subjectCandidate = detail.candidates.find(
    (candidate) => candidate.candidate_kind === "subject" && candidate.payload.localSubjectId === localSubjectId
  );

  if (!subjectCandidate) {
    throw new Error("Subject candidate not found.");
  }

  if (disposition === "reject") {
    rejectSubjectPackage(detail, localSubjectId, input.rationale);
    updateRunAdmissionStatus(runId);
    return readDistillationRun(runId);
  }

  if (disposition !== "admit" && disposition !== "merge") {
    throw new Error("Unsupported subject disposition.");
  }

  const targetSubjectId =
    disposition === "merge"
      ? requiredText(input.target_subject_id ?? input.targetSubjectId, "Merge target subject is required.")
      : null;

  if (disposition === "merge" && !get(`SELECT id FROM subjects WHERE id = ?`, targetSubjectId)) {
    throw new Error("Merge target subject was not found.");
  }

  applySubjectPackage(detail, localSubjectId, targetSubjectId, disposition, input.rationale);
  updateRunAdmissionStatus(runId);
  return readDistillationRun(runId);
}

export function resolveAdmissionCandidate(input = {}) {
  const runId = requiredText(input.run_id ?? input.runId, "Run is required.");
  const candidateId = requiredText(input.candidate_id ?? input.candidateId, "Candidate is required.");
  const disposition = requiredText(input.disposition, "Disposition is required.");
  const detail = readDistillationRun(runId);
  const candidate = detail?.candidates.find((item) => item.id === candidateId);

  if (!detail?.bundle || !candidate) {
    throw new Error("Candidate not found.");
  }

  if (disposition === "reject") {
    decideCandidate(candidate, "reject", "rejected", null, input.rationale, { run_id: runId });
    updateRunAdmissionStatus(runId);
    return readDistillationRun(runId);
  }

  if (disposition !== "admit") {
    throw new Error("Unsupported candidate disposition.");
  }

  if (candidate.candidate_kind === "claim") {
    const targetSubjectId = resolvedSubjectId(detail, candidate.payload.localSubjectId);

    if (!targetSubjectId) {
      markCandidateWaiting(candidate.id, { reason: "Subject endpoint is not admitted or merged." });
      return readDistillationRun(runId);
    }

    const claimId = createCanonicalClaim(candidate.payload, targetSubjectId);
    decideCandidate(candidate, "admit", "admitted", { kind: "claim", id: claimId }, input.rationale, { run_id: runId });
    updateRunAdmissionStatus(runId);
    return readDistillationRun(runId);
  }

  if (candidate.candidate_kind === "subject_relationship") {
    const sourceId = resolvedSubjectId(detail, candidate.payload.sourceLocalSubjectId);
    const targetId = resolvedSubjectId(detail, candidate.payload.targetLocalSubjectId);

    if (!sourceId || !targetId) {
      markCandidateWaiting(candidate.id, { reason: "Relationship endpoints are not admitted or merged." });
      return readDistillationRun(runId);
    }

    const relationshipId = createCanonicalRelationship(detail.run.domain_id, candidate.payload, sourceId, targetId);
    decideCandidate(candidate, "admit", "admitted", { kind: "relationship", id: relationshipId }, input.rationale, { run_id: runId });
    updateRunAdmissionStatus(runId);
    return readDistillationRun(runId);
  }

  throw new Error("Only claim and relationship candidates can be admitted individually in this view.");
}

function listDistillationDocuments(domainId = null) {
  const whereClause = domainId === NO_DOMAIN_ID
    ? "WHERE documents.domain_id IS NULL"
    : domainId
      ? "WHERE documents.domain_id = ?"
      : "";

  return all(`
    SELECT
      documents.id,
      documents.domain_id,
      documents.label,
      COALESCE(type_cards.label, documents.source_type) AS type,
      documents.source_type,
      documents.status,
      documents.extraction_stage,
      documents.description,
      '[]' AS aliases,
      '[]' AS tags,
      documents.content_sha256,
      documents.body_sha256,
      documents.size_bytes,
      documents.intake_profile,
      documents.source_filename,
      documents.source_url,
      documents.mime_type,
      documents.shard_count,
      documents.error_message,
      documents.source,
      documents.created,
      documents.updated
    FROM documents
    LEFT JOIN type_cards ON type_cards.id = documents.document_type_id
    ${whereClause}
    ORDER BY documents.updated DESC, documents.label ASC
  `, ...(domainId && domainId !== NO_DOMAIN_ID ? [domainId] : []));
}

function listRunSummaries(domainId = null) {
  const whereClause = domainId === NO_DOMAIN_ID
    ? "WHERE distillation_runs.domain_id IS NULL"
    : domainId
      ? "WHERE distillation_runs.domain_id = ?"
      : "";

  return all(
    `
      SELECT
        distillation_runs.*,
        documents.label AS document_label,
        candidate_bundles.id AS bundle_id,
        SUM(CASE WHEN candidates.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN candidates.status = 'admitted' THEN 1 ELSE 0 END) AS admitted_count,
        SUM(CASE WHEN candidates.status = 'merged' THEN 1 ELSE 0 END) AS merged_count,
        SUM(CASE WHEN candidates.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
        COUNT(candidates.id) AS candidate_count
      FROM distillation_runs
      JOIN documents ON documents.id = distillation_runs.document_id
      LEFT JOIN candidate_bundles ON candidate_bundles.distillation_run_id = distillation_runs.id
      LEFT JOIN candidates ON candidates.bundle_id = candidate_bundles.id
      ${whereClause}
      GROUP BY distillation_runs.id
      ORDER BY distillation_runs.updated DESC
    `,
    ...(domainId && domainId !== NO_DOMAIN_ID ? [domainId] : [])
  ).map((row) => ({
    ...serializeRun(row),
    admitted_count: Number(row.admitted_count ?? 0),
    bundle_id: row.bundle_id ?? null,
    candidate_count: Number(row.candidate_count ?? 0),
    merged_count: Number(row.merged_count ?? 0),
    pending_count: Number(row.pending_count ?? 0),
    rejected_count: Number(row.rejected_count ?? 0)
  }));
}

function ensureRunBundle(runRecord) {
  const existing = get(`SELECT * FROM candidate_bundles WHERE distillation_run_id = ?`, runRecord.id);

  if (existing) {
    return existing;
  }

  const timestamp = now();
  const bundleId = id("bundle");
  run(
    `
      INSERT INTO candidate_bundles (
        id, domain_id, distillation_run_id, bundle_kind, status,
        source_context_json, payload_json, created, updated
      )
      VALUES (?, ?, ?, 'distillation_run', 'draft', ?, '{}', ?, ?)
    `,
    bundleId,
    runRecord.domain_id ?? null,
    runRecord.id,
    JSON.stringify({
      document_id: runRecord.document_id,
      domain_id: runRecord.domain_id ?? null,
      run_id: runRecord.id
    }),
    timestamp,
    timestamp
  );

  return get(`SELECT * FROM candidate_bundles WHERE id = ?`, bundleId);
}

function generateSubjectCandidates(runRecord) {
  const document = get(`SELECT * FROM documents WHERE id = ?`, runRecord.document_id);
  const units = all(
    `
      SELECT id, position, heading_path_json, body
      FROM source_units
      WHERE document_id = ?
      ORDER BY position ASC
      LIMIT 8
    `,
    runRecord.document_id
  );

  if (!document) {
    throw new Error("Document not found.");
  }

  const localSubjectId = "subject_001";
  const evidenceRefs = units.slice(0, 3).map((unit) => ({
    evidenceText: trimText(unit.body, 480),
    sourceUnitId: unit.id
  }));
  const subjectPayload = {
    aliases: [],
    description: trimText(document.description || document.source || units[0]?.body || "", 280),
    evidenceRefs,
    label: document.label,
    localSubjectId,
    rationale: "Initial document-level subject candidate from the selected source.",
    stage: "subjects",
    type: "artifact"
  };

  return {
    candidates: [
      {
        candidate_kind: "subject",
        dedupe_key: `${runRecord.id}:subjects:${localSubjectId}`,
        payload: subjectPayload
      }
    ],
    rawOutput: {
      subjects: [subjectPayload]
    },
    summary: {
      candidate_count: 1,
      subject_count: 1
    }
  };
}

function insertCandidate(bundleId, candidate, timestamp) {
  run(
    `
      INSERT INTO candidates (
        id, bundle_id, candidate_kind, status, dedupe_key,
        payload_json, review_json, created, updated
      )
      VALUES (?, ?, ?, 'pending', ?, ?, '{}', ?, ?)
    `,
    id("candidate"),
    bundleId,
    candidate.candidate_kind,
    candidate.dedupe_key ?? null,
    JSON.stringify(candidate.payload ?? {}),
    timestamp,
    timestamp
  );
}

function rejectSubjectPackage(detail, localSubjectId, rationale) {
  const attached = attachedSubjectCandidates(detail.candidates, localSubjectId);

  db.exec("BEGIN");
  try {
    for (const candidate of attached) {
      decideCandidate(candidate, "reject", "rejected", null, rationale, {
        run_id: detail.run.id,
        local_subject_id: localSubjectId
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function applySubjectPackage(detail, localSubjectId, targetSubjectId, disposition, rationale) {
  const attached = attachedSubjectCandidates(detail.candidates, localSubjectId);
  const subjectCandidate = attached.find((candidate) => candidate.candidate_kind === "subject");
  const aliases = attached
    .filter((candidate) => candidate.candidate_kind === "alias")
    .map((candidate) => candidate.payload.alias)
    .filter((value) => typeof value === "string" && value.trim());

  if (subjectCandidate) {
    aliases.push(...arrayOfStrings(subjectCandidate.payload.aliases));
  }

  db.exec("BEGIN");
  try {
    const resolvedTargetSubjectId = targetSubjectId ?? createCanonicalSubject(detail.run, subjectCandidate?.payload ?? {});
    const existingAliases = all(
      `
        SELECT value
        FROM lexicalizations
        WHERE target_kind = 'subject'
          AND target_id = ?
          AND lexical_type = 'alias'
      `,
      resolvedTargetSubjectId
    ).map((row) => row.value);

    recordLexicalizations({
      domainId: detail.run.domain_id,
      targetId: resolvedTargetSubjectId,
      targetKind: "subject",
      values: uniqueStrings([...existingAliases, ...aliases])
    });

    for (const candidate of attached) {
      if (candidate.candidate_kind === "subject" || candidate.candidate_kind === "alias") {
        decideCandidate(candidate, disposition, disposition === "merge" ? "merged" : "admitted", { kind: "subject", id: resolvedTargetSubjectId }, rationale, {
          local_subject_id: localSubjectId,
          run_id: detail.run.id
        });
      }
    }

    for (const candidate of attached.filter((item) => item.candidate_kind === "claim")) {
      const claimId = createCanonicalClaim(candidate.payload, resolvedTargetSubjectId);
      decideCandidate(candidate, "admit", "admitted", { kind: "claim", id: claimId }, rationale, {
        local_subject_id: localSubjectId,
        run_id: detail.run.id
      });
    }

    for (const candidate of attached.filter((item) => item.candidate_kind === "subject_relationship")) {
      const sourceId = candidate.payload.sourceLocalSubjectId === localSubjectId
        ? resolvedTargetSubjectId
        : resolvedSubjectId(detail, candidate.payload.sourceLocalSubjectId);
      const targetId = candidate.payload.targetLocalSubjectId === localSubjectId
        ? resolvedTargetSubjectId
        : resolvedSubjectId(detail, candidate.payload.targetLocalSubjectId);

      if (!sourceId || !targetId) {
        markCandidateWaiting(candidate.id, { reason: "Relationship endpoint is not admitted or merged." });
        continue;
      }

      const relationshipId = createCanonicalRelationship(detail.run.domain_id, candidate.payload, sourceId, targetId);
      decideCandidate(candidate, "admit", "admitted", { kind: "relationship", id: relationshipId }, rationale, {
        local_subject_id: localSubjectId,
        run_id: detail.run.id
      });
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function createCanonicalSubject(runRecord, payload) {
  const timestamp = now();
  const subjectId = id("subject");
  const typeLabel = normalizeTypeLabel(payload.type) || "Concept";
  const typeId = ensureTypeCard({ appliesTo: "subject", label: typeLabel });

  run(
    `
      INSERT INTO subjects (
        id, canonical_label, subject_type_id, description,
        source, metadata_json, created, updated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    subjectId,
    requiredText(payload.label, "Subject label is required."),
    typeId,
    nullableText(payload.description) ?? "",
    `distillation:${runRecord.id}`,
    JSON.stringify({
      distillation_run_id: runRecord.id,
      local_subject_id: payload.localSubjectId ?? null,
      rationale: payload.rationale ?? null
    }),
    timestamp,
    timestamp
  );

  if (runRecord.domain_id) {
    run(
      `
        INSERT INTO subject_memberships (subject_id, domain_id, source, created, updated)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(subject_id, domain_id)
        DO UPDATE SET membership_status = 'accepted', updated = excluded.updated
      `,
      subjectId,
      runRecord.domain_id,
      `distillation:${runRecord.id}`,
      timestamp,
      timestamp
    );
  }

  return subjectId;
}

function createCanonicalClaim(payload, targetSubjectId) {
  const timestamp = now();
  const claimId = id("claim");
  const claimTypeId = ensureTypeCard({ appliesTo: "claim", label: normalizeTypeLabel(payload.claimType) || "Observation" });

  run(
    `
      INSERT INTO claims (
        id, claim_text, claim_type_id, assertion_state,
        confidence, source, metadata_json, created, updated
      )
      VALUES (?, ?, ?, 'accepted', ?, ?, ?, ?, ?)
    `,
    claimId,
    requiredText(payload.claimText, "Claim text is required."),
    claimTypeId,
    nullableText(payload.confidence),
    nullableText(payload.sourceUnitId),
    JSON.stringify({
      evidence_text: payload.evidenceText ?? null,
      local_claim_id: payload.localClaimId ?? null,
      local_subject_id: payload.localSubjectId ?? null
    }),
    timestamp,
    timestamp
  );
  run(
    `
      INSERT INTO claim_targets (id, claim_id, target_kind, target_id, created, updated)
      VALUES (?, ?, 'subject', ?, ?, ?)
    `,
    id("claim_target"),
    claimId,
    targetSubjectId,
    timestamp,
    timestamp
  );

  return claimId;
}

function createCanonicalRelationship(domainId, payload, sourceId, targetId) {
  const timestamp = now();
  const relationshipTypeId = ensureTypeCard({ appliesTo: "relationship", label: normalizeTypeLabel(payload.relationshipType) || "related to" });
  const existing = get(
    `
      SELECT id
      FROM relationships
      WHERE source_subject_id = ?
        AND target_subject_id = ?
        AND relationship_type_id = ?
        AND COALESCE(domain_id, '') = COALESCE(?, '')
      LIMIT 1
    `,
    sourceId,
    targetId,
    relationshipTypeId,
    domainId
  );

  if (existing?.id) {
    return existing.id;
  }

  const relationshipId = id("relationship");
  run(
    `
      INSERT INTO relationships (
        id, domain_id, source_subject_id, target_subject_id,
        relationship_type_id, label, source, metadata_json, created, updated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    relationshipId,
    domainId,
    sourceId,
    targetId,
    relationshipTypeId,
    normalizeTypeLabel(payload.relationshipType) || "related to",
    payload.sourceUnitId ?? null,
    JSON.stringify({
      local_relationship_id: payload.localRelationshipId ?? null,
      rationale: payload.rationale ?? null,
      supporting_claim_local_ids: payload.supportingClaimLocalIds ?? []
    }),
    timestamp,
    timestamp
  );
  return relationshipId;
}

function decideCandidate(candidate, disposition, status, target, rationale, metadata) {
  const timestamp = now();
  run(
    `
      UPDATE candidates
      SET status = ?, target_kind = ?, target_id = ?, updated = ?
      WHERE id = ?
    `,
    status,
    target?.kind ?? null,
    target?.id ?? null,
    timestamp,
    candidate.id
  );
  run(
    `
      INSERT INTO admission_decisions (
        id, candidate_id, disposition, target_kind, target_id,
        rationale, decided_at, metadata_json, created, updated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    id("decision"),
    candidate.id,
    disposition,
    target?.kind ?? null,
    target?.id ?? null,
    nullableText(rationale) ?? "",
    timestamp,
    JSON.stringify(metadata ?? {}),
    timestamp,
    timestamp
  );
}

function markCandidateWaiting(candidateId, metadata) {
  const timestamp = now();
  run(
    `
      UPDATE candidates
      SET status = 'waiting', review_json = ?, updated = ?
      WHERE id = ?
    `,
    JSON.stringify(metadata ?? {}),
    timestamp,
    candidateId
  );
}

function attachedSubjectCandidates(candidates, localSubjectId) {
  const claimIds = new Set();
  const attached = candidates.filter((candidate) => {
    if (!SUBJECT_CANDIDATE_KINDS.has(candidate.candidate_kind)) {
      return false;
    }

    if (candidate.payload.localSubjectId === localSubjectId) {
      if (candidate.payload.localClaimId) {
        claimIds.add(candidate.payload.localClaimId);
      }
      return true;
    }

    if (candidate.payload.sourceLocalSubjectId === localSubjectId || candidate.payload.targetLocalSubjectId === localSubjectId) {
      return true;
    }

    return false;
  });

  return candidates.filter((candidate) => {
    if (attached.some((item) => item.id === candidate.id)) {
      return true;
    }

    if (candidate.candidate_kind !== "claim_relationship") {
      return false;
    }

    return claimIds.has(candidate.payload.sourceLocalClaimId) || claimIds.has(candidate.payload.targetLocalClaimId);
  });
}

function subjectPackages(candidates) {
  return candidates
    .filter((candidate) => candidate.candidate_kind === "subject")
    .map((subject) => {
      const localSubjectId = subject.payload.localSubjectId;
      const attached = attachedSubjectCandidates(candidates, localSubjectId);
      const aliases = attached.filter((candidate) => candidate.candidate_kind === "alias");
      const claims = attached.filter((candidate) => candidate.candidate_kind === "claim");
      const relationships = attached.filter((candidate) => candidate.candidate_kind === "subject_relationship");
      const claimRelationships = attached.filter((candidate) => candidate.candidate_kind === "claim_relationship");

      return {
        aliases,
        claims,
        claimRelationships,
        evidenceRefs: subject.payload.evidenceRefs ?? [],
        localSubjectId,
        relationships,
        status: subject.status,
        subject
      };
    });
}

function resolvedSubjectId(detail, localSubjectId) {
  return detail.candidates.find(
    (candidate) =>
      candidate.candidate_kind === "subject" &&
      candidate.payload.localSubjectId === localSubjectId &&
      (candidate.status === "admitted" || candidate.status === "merged") &&
      candidate.target_kind === "subject"
  )?.target_id ?? null;
}

function updateRunAdmissionStatus(runId) {
  const detail = readDistillationRun(runId);

  if (!detail?.bundle) {
    return;
  }

  const actionable = detail.candidates.filter((candidate) => candidate.candidate_kind !== "ontology_type");
  const pending = actionable.filter((candidate) => candidate.status === "pending" || candidate.status === "waiting").length;
  const accepted = actionable.filter((candidate) => candidate.status === "admitted" || candidate.status === "merged").length;
  const rejected = actionable.filter((candidate) => candidate.status === "rejected").length;
  const status = actionable.length > 0 && pending === 0 ? "admitted" : accepted > 0 || rejected > 0 ? "partially_admitted" : detail.run.status;
  const timestamp = now();

  run(
    `
      UPDATE distillation_runs
      SET status = ?, summary_json = ?, updated = ?
      WHERE id = ?
    `,
    status,
    JSON.stringify({ admitted: accepted, pending, rejected }),
    timestamp,
    runId
  );
}

function markStageFailed(runId, stageKey, message) {
  const timestamp = now();
  run(
    `
      UPDATE distillation_stage_runs
      SET status = 'failed', error_message = ?, completed = ?, updated = ?
      WHERE run_id = ? AND stage = ?
    `,
    message,
    timestamp,
    timestamp,
    runId,
    stageKey
  );
  run(
    `
      UPDATE distillation_runs
      SET status = 'failed', current_stage = ?, error_message = ?, updated = ?
      WHERE id = ?
    `,
    stageKey,
    message,
    timestamp,
    runId
  );
}

function candidateCounts(candidates) {
  return candidates.reduce(
    (counts, candidate) => ({
      ...counts,
      [candidate.status]: (counts[candidate.status] ?? 0) + 1,
      total: counts.total + 1
    }),
    { total: 0 }
  );
}

function serializeRun(row) {
  return {
    ...row,
    settings: parseJsonObject(row.settings_json),
    summary: parseJsonObject(row.summary_json)
  };
}

function serializeStageRun(row) {
  return {
    ...row,
    candidate_count: Number(row.candidate_count ?? 0),
    raw_output: parseJsonObject(row.raw_output_json),
    result_summary: parseJsonObject(row.result_summary_json)
  };
}

function serializeBundle(row) {
  return {
    ...row,
    payload: parseJsonObject(row.payload_json),
    source_context: parseJsonObject(row.source_context_json)
  };
}

function serializeCandidate(row) {
  return {
    ...row,
    payload: parseJsonObject(row.payload_json),
    review: parseJsonObject(row.review_json)
  };
}

function serializeDecision(row) {
  return {
    ...row,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function requiredText(value, message) {
  const text = nullableText(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function nullableText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTypeLabel(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    return nullableText(value.label) ?? nullableText(value.type) ?? null;
  }

  return null;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = slugify(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(value.trim());
  }

  return output;
}

function trimText(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function nextStageKey(stageKey) {
  const index = DISTILLATION_STAGES.findIndex((stage) => stage.key === stageKey);
  return DISTILLATION_STAGES[index + 1]?.key ?? "complete";
}
