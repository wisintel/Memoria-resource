import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const repoRoot = resolve(import.meta.dirname, "..");
const dbPath = resolve(repoRoot, "app/data/memoria.sqlite");
const outputPath = resolve(repoRoot, "exports/import-semantic-bundles-report.json");
const domainId = "domain_memoria";
const viewId = "view_memoria_workbench";

const bundles = [
  {
    key: "memoria",
    file: resolve(repoRoot, "exports/memoria-domain-bundle.json"),
    subjectLists: ["concepts", "entities", "nodes", "clusters", "reference_cards"],
  },
  {
    key: "atlas",
    file: resolve(repoRoot, "exports/atlas-domain-bundle.json"),
    subjectLists: ["entities"],
  },
];

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

const now = () => new Date().toISOString();

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const json = (value) => JSON.stringify(value ?? {});

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const idFor = (prefix, value) => {
  const base = normalize(value) || Math.random().toString(36).slice(2);
  return `${prefix}_${base}`;
};

const toIso = (value) => {
  if (!value) return now();
  if (typeof value === "number") {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? now() : parsed.toISOString();
};

const run = (sql, params = {}) => db.prepare(sql).run(params);
const get = (sql, params = {}) => db.prepare(sql).get(params);

const tableCount = (table) => get(`SELECT COUNT(*) AS count FROM ${table}`).count;

const report = {
  imported_at: now(),
  destination_domain_id: domainId,
  bundles: {},
  counts: {
    documents_inserted: 0,
    subjects_inserted: 0,
    subjects_merged: 0,
    lexicalizations_inserted: 0,
    claims_inserted: 0,
    claim_targets_inserted: 0,
    relationships_inserted: 0,
    evidence_inserted: 0,
    evidence_links_inserted: 0,
    skipped_claim_targets: 0,
    skipped_relationships: 0,
  },
  skipped: {
    claim_targets: [],
    relationships: [],
  },
  final_counts: {},
};

const insertType = db.prepare(`
  INSERT INTO type_cards (
    id, scope_domain_id, applies_to, slug, label, description,
    behavior_json, fields_json, status, created, updated
  )
  VALUES ($id, NULL, $applies_to, $slug, $label, '', '{}', '{}', 'active', $created, $updated)
  ON CONFLICT(applies_to, slug) WHERE scope_domain_id IS NULL
  DO UPDATE SET label = excluded.label, updated = excluded.updated
`);

function ensureType(appliesTo, label, fallback = "General") {
  const typeLabel = firstText(label, fallback);
  const slug = normalize(typeLabel) || "general";
  const existing = get(
    "SELECT id FROM type_cards WHERE scope_domain_id IS NULL AND applies_to = $applies_to AND slug = $slug",
    { $applies_to: appliesTo, $slug: slug },
  );
  if (existing) return existing.id;

  const id = idFor(`type_${appliesTo}`, slug);
  const stamped = now();
  insertType.run({
    $id: id,
    $applies_to: appliesTo,
    $slug: slug,
    $label: typeLabel,
    $created: stamped,
    $updated: stamped,
  });
  return id;
}

function clearGraphData() {
  for (const table of [
    "view_relationships",
    "view_subjects",
    "evidence_links",
    "evidence",
    "lexicalizations",
    "claim_relationships",
    "claim_targets",
    "claims",
    "relationships",
    "subject_memberships",
    "subjects",
    "source_units",
    "shelf_folder_items",
    "shelf_folders",
    "documents",
    "admission_decisions",
    "candidates",
    "candidate_bundles",
    "views",
  ]) {
    run(`DELETE FROM ${table}`);
  }

  const stamped = now();
  run(
    `
      INSERT INTO domains (id, slug, label, description, status, created, updated)
      VALUES ($id, 'memoria', 'Memoria', '', 'active', $created, $updated)
      ON CONFLICT(id) DO UPDATE SET slug = 'memoria', label = 'Memoria', updated = excluded.updated
    `,
    { $id: domainId, $created: stamped, $updated: stamped },
  );
  run(
    `
      INSERT INTO views (id, domain_id, slug, label, view_kind, description, status, metadata_json, created, updated)
      VALUES ($id, $domain_id, 'memoria-workbench', 'Workbench', 'working', '', 'active', '{}', $created, $updated)
    `,
    { $id: viewId, $domain_id: domainId, $created: stamped, $updated: stamped },
  );
}

const sourceById = new Map();
const subjectIdByOriginalId = new Map();
const subjectIdByLabel = new Map();
const documentIdByOriginalId = new Map();
const claimIdByOriginalId = new Map();

function evidenceFor(targetKind, targetId, bundleKey, original, summary) {
  const stamped = now();
  const evidenceId = idFor("evidence", `${bundleKey}-${targetKind}-${targetId}`);
  const evidenceResult = run(
    `
      INSERT INTO evidence (
        id, evidence_kind, source_kind, document_id, source_unit_id, locator_json,
        excerpt, summary, status, metadata_json, created, updated
      )
      VALUES (
        $id, 'import_record', 'json_bundle', NULL, NULL, '{}',
        '', $summary, 'active', $metadata_json, $created, $updated
      )
      ON CONFLICT(id) DO NOTHING
    `,
    {
      $id: evidenceId,
      $summary: summary,
      $metadata_json: json({ bundle: bundleKey, original }),
      $created: stamped,
      $updated: stamped,
    },
  );
  if (evidenceResult.changes > 0) report.counts.evidence_inserted += 1;

  const linkResult = run(
    `
      INSERT INTO evidence_links (id, evidence_id, target_kind, target_id, link_role, created, updated)
      VALUES ($id, $evidence_id, $target_kind, $target_id, 'provenance', $created, $updated)
      ON CONFLICT(evidence_id, target_kind, target_id, link_role) DO NOTHING
    `,
    {
      $id: idFor("evidence_link", `${evidenceId}-${targetKind}-${targetId}`),
      $evidence_id: evidenceId,
      $target_kind: targetKind,
      $target_id: targetId,
      $created: stamped,
      $updated: stamped,
    },
  );
  if (linkResult.changes > 0) report.counts.evidence_links_inserted += 1;
}

function importDocument(bundleKey, sourceInfo, doc) {
  const originalId = doc.id;
  const id = originalId || idFor("document", `${bundleKey}-${doc.label || doc.title}`);
  const created = toIso(doc.created ?? doc.created_at);
  const updated = toIso(doc.updated ?? doc.updated_at);
  const label = firstText(doc.label, doc.title, doc.source_filename, id);
  const typeId = ensureType("document", "Source", "Source");

  const result = run(
    `
      INSERT INTO documents (
        id, domain_id, label, document_type_id, source_type, status, extraction_stage,
        description, content_sha256, body_sha256, size_bytes, intake_profile,
        source_filename, source_url, mime_type, shard_count, error_message,
        source, metadata_json, created, updated
      )
      VALUES (
        $id, $domain_id, $label, $document_type_id, $source_type, $status, $extraction_stage,
        $description, $content_sha256, $body_sha256, $size_bytes, $intake_profile,
        $source_filename, $source_url, $mime_type, $shard_count, $error_message,
        $source, $metadata_json, $created, $updated
      )
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        document_type_id = excluded.document_type_id,
        updated = excluded.updated
    `,
    {
      $id: id,
      $domain_id: domainId,
      $label: label,
      $document_type_id: typeId,
      $source_type: firstText(doc.source_type, "imported"),
      $status: firstText(doc.status, "ready"),
      $extraction_stage: firstText(doc.extraction_stage, "not_started"),
      $description: firstText(doc.description),
      $content_sha256: firstText(doc.content_sha256, doc.content_hash),
      $body_sha256: firstText(doc.body_sha256),
      $size_bytes: Number(doc.size_bytes ?? 0),
      $intake_profile: firstText(doc.intake_profile),
      $source_filename: doc.source_filename ?? null,
      $source_url: doc.source_url ?? null,
      $mime_type: doc.mime_type ?? null,
      $shard_count: Number(doc.shard_count ?? 0),
      $error_message: doc.error_message ?? null,
      $source: firstText(doc.source, sourceInfo.domain_label, bundleKey),
      $metadata_json: json({ bundle: bundleKey, source: sourceInfo, original: doc }),
      $created: created,
      $updated: updated,
    },
  );
  if (result.changes > 0) report.counts.documents_inserted += 1;
  if (originalId) documentIdByOriginalId.set(originalId, id);
}

function aliasValue(alias) {
  if (typeof alias === "string") return alias;
  return firstText(alias?.alias, alias?.value, alias?.label);
}

function importSubject(bundleKey, sourceInfo, subject, sourceList) {
  const label = firstText(subject.label, subject.normalized, subject.slug, subject.id);
  const normalizedLabel = normalize(label);
  const existingId = subjectIdByLabel.get(normalizedLabel);
  const originalId = subject.id;
  const typeId = ensureType("subject", subject.type_label ?? subject.type, sourceList);
  const created = toIso(subject.created ?? subject.created_at);
  const updated = toIso(subject.updated ?? subject.updated_at ?? subject.last_updated);
  const metadata = { bundle: bundleKey, source: sourceInfo, source_list: sourceList, original: subject };

  if (existingId) {
    subjectIdByOriginalId.set(originalId, existingId);
    sourceById.set(existingId, [...new Set([...(sourceById.get(existingId) ?? []), bundleKey])]);
    const existing = get("SELECT metadata_json, description FROM subjects WHERE id = $id", { $id: existingId });
    const mergedMetadata = {
      ...(JSON.parse(existing.metadata_json || "{}")),
      merged_imports: [
        ...((JSON.parse(existing.metadata_json || "{}").merged_imports) ?? []),
        metadata,
      ],
    };
    const result = run(
      `
        UPDATE subjects
        SET description = CASE WHEN description = '' THEN $description ELSE description END,
            metadata_json = $metadata_json,
            updated = $updated
        WHERE id = $id
      `,
      {
        $id: existingId,
        $description: firstText(subject.description),
        $metadata_json: json(mergedMetadata),
        $updated: updated,
      },
    );
    report.counts.subjects_merged += 1;
    return existingId;
  }

  const id = originalId || idFor("subject", `${bundleKey}-${label}`);
  run(
    `
      INSERT INTO subjects (
        id, canonical_label, subject_type_id, role_type_id, description,
        status, metadata_json, source, created, updated
      )
      VALUES (
        $id, $canonical_label, $subject_type_id, NULL, $description,
        $status, $metadata_json, $source, $created, $updated
      )
    `,
    {
      $id: id,
      $canonical_label: label,
      $subject_type_id: typeId,
      $description: firstText(subject.description),
      $status: firstText(subject.status_label, "active"),
      $metadata_json: json(metadata),
      $source: firstText(subject.source, sourceInfo.domain_label, bundleKey),
      $created: created,
      $updated: updated,
    },
  );
  report.counts.subjects_inserted += 1;
  subjectIdByOriginalId.set(originalId, id);
  subjectIdByLabel.set(normalizedLabel, id);
  sourceById.set(id, [bundleKey]);

  run(
    `
      INSERT INTO subject_memberships (subject_id, domain_id, membership_status, source, created, updated)
      VALUES ($subject_id, $domain_id, 'accepted', $source, $created, $updated)
      ON CONFLICT(subject_id, domain_id) DO NOTHING
    `,
    {
      $subject_id: id,
      $domain_id: domainId,
      $source: firstText(sourceInfo.domain_label, bundleKey),
      $created: created,
      $updated: updated,
    },
  );

  for (const alias of subject.aliases ?? []) {
    const value = aliasValue(alias);
    if (!value || normalize(value) === normalizedLabel) continue;
    const result = run(
      `
        INSERT INTO lexicalizations (
          id, target_kind, target_id, lexical_type, value, normalized_value,
          language, domain_id, source_document_id, status, metadata_json, created, updated
        )
        VALUES (
          $id, 'subject', $target_id, 'alias', $value, $normalized_value,
          'en', $domain_id, NULL, 'active', $metadata_json, $created, $updated
        )
        ON CONFLICT(id) DO NOTHING
      `,
      {
        $id: alias.id || idFor("lex", `${id}-${value}`),
        $target_id: id,
        $value: value,
        $normalized_value: normalize(value),
        $domain_id: domainId,
        $metadata_json: json({ bundle: bundleKey, original: alias }),
        $created: toIso(alias.created ?? alias.created_at),
        $updated: toIso(alias.updated ?? alias.updated_at),
      },
    );
    if (result.changes > 0) report.counts.lexicalizations_inserted += 1;
  }

  evidenceFor("subject", id, bundleKey, subject, `Imported ${label} from ${bundleKey}.`);
  return id;
}

function targetIdsForClaim(claim) {
  if (Array.isArray(claim.target_entity_ids)) return claim.target_entity_ids;
  if (Array.isArray(claim.target_entities)) return claim.target_entities.map((target) => target.id).filter(Boolean);
  if (claim.target_id) return [claim.target_id];
  if (claim.target?.id) return [claim.target.id];
  return [];
}

function importClaim(bundleKey, sourceInfo, claim) {
  const id = claim.id || idFor("claim", `${bundleKey}-${claim.label || claim.claim_text}`);
  const typeId = ensureType("claim", claim.type_label ?? claim.type, "Claim");
  const created = toIso(claim.created ?? claim.created_at);
  const updated = toIso(claim.updated ?? claim.updated_at);
  const text = firstText(claim.claim_text, claim.label, claim.description);

  const result = run(
    `
      INSERT INTO claims (
        id, claim_text, claim_type_id, claim_kind_id, status, assertion_state,
        confidence, metadata_json, source, created, updated
      )
      VALUES (
        $id, $claim_text, $claim_type_id, NULL, $status, 'accepted',
        NULL, $metadata_json, $source, $created, $updated
      )
      ON CONFLICT(id) DO UPDATE SET
        claim_text = excluded.claim_text,
        claim_type_id = excluded.claim_type_id,
        metadata_json = excluded.metadata_json,
        updated = excluded.updated
    `,
    {
      $id: id,
      $claim_text: text,
      $claim_type_id: typeId,
      $status: firstText(claim.status_label, "active"),
      $metadata_json: json({ bundle: bundleKey, source: sourceInfo, original: claim }),
      $source: firstText(claim.source, sourceInfo.domain_label, bundleKey),
      $created: created,
      $updated: updated,
    },
  );
  if (result.changes > 0) report.counts.claims_inserted += 1;
  claimIdByOriginalId.set(claim.id, id);

  let position = 0;
  for (const originalTargetId of targetIdsForClaim(claim)) {
    const targetId = subjectIdByOriginalId.get(originalTargetId);
    if (!targetId) {
      report.counts.skipped_claim_targets += 1;
      report.skipped.claim_targets.push({ bundle: bundleKey, claim_id: claim.id, target_id: originalTargetId });
      continue;
    }
    const targetResult = run(
      `
        INSERT INTO claim_targets (id, claim_id, target_kind, target_id, target_role, position, created, updated)
        VALUES ($id, $claim_id, 'subject', $target_id, 'about', $position, $created, $updated)
        ON CONFLICT(claim_id, target_kind, target_id, target_role) DO NOTHING
      `,
      {
        $id: idFor("claim_target", `${id}-${targetId}`),
        $claim_id: id,
        $target_id: targetId,
        $position: position,
        $created: created,
        $updated: updated,
      },
    );
    if (targetResult.changes > 0) report.counts.claim_targets_inserted += 1;
    position += 1;
  }

  evidenceFor("claim", id, bundleKey, claim, `Imported claim ${claim.label ?? id} from ${bundleKey}.`);
}

function importRelationship(bundleKey, sourceInfo, relationship) {
  const sourceId = subjectIdByOriginalId.get(relationship.source_id);
  const targetId = subjectIdByOriginalId.get(relationship.target_id);
  if (!sourceId || !targetId) {
    report.counts.skipped_relationships += 1;
    report.skipped.relationships.push({
      bundle: bundleKey,
      relationship_id: relationship.id,
      source_id: relationship.source_id,
      target_id: relationship.target_id,
    });
    return;
  }

  const id = relationship.id || idFor("relationship", `${bundleKey}-${sourceId}-${targetId}-${relationship.label}`);
  const typeLabel = firstText(relationship.type_label, relationship.type, relationship.label, "related to");
  const typeId = ensureType("relationship", typeLabel, "related to");
  const created = toIso(relationship.created ?? relationship.created_at);
  const updated = toIso(relationship.updated ?? relationship.updated_at);

  const result = run(
    `
      INSERT INTO relationships (
        id, domain_id, source_subject_id, target_subject_id, relationship_type_id,
        relationship_kind_id, label, status, assertion_state, metadata_json, source, created, updated
      )
      VALUES (
        $id, $domain_id, $source_subject_id, $target_subject_id, $relationship_type_id,
        NULL, $label, 'active', 'accepted', $metadata_json, $source, $created, $updated
      )
      ON CONFLICT(id) DO UPDATE SET
        source_subject_id = excluded.source_subject_id,
        target_subject_id = excluded.target_subject_id,
        relationship_type_id = excluded.relationship_type_id,
        label = excluded.label,
        metadata_json = excluded.metadata_json,
        updated = excluded.updated
    `,
    {
      $id: id,
      $domain_id: domainId,
      $source_subject_id: sourceId,
      $target_subject_id: targetId,
      $relationship_type_id: typeId,
      $label: typeLabel,
      $metadata_json: json({ bundle: bundleKey, source: sourceInfo, original: relationship }),
      $source: firstText(relationship.source, sourceInfo.domain_label, bundleKey),
      $created: created,
      $updated: updated,
    },
  );
  if (result.changes > 0) report.counts.relationships_inserted += 1;
  evidenceFor("relationship", id, bundleKey, relationship, `Imported relationship ${typeLabel} from ${bundleKey}.`);
}

db.exec("BEGIN");
try {
  clearGraphData();

  const loadedBundles = bundles.map((definition) => ({
    ...definition,
    data: JSON.parse(readFileSync(definition.file, "utf8")),
  }));

  for (const bundle of loadedBundles) {
    report.bundles[bundle.key] = {
      schema: bundle.data.bundle_schema,
      source: bundle.data.source,
      summary: bundle.data.summary,
    };
  }

  for (const bundle of loadedBundles) {
    for (const doc of bundle.data.documents ?? []) {
      importDocument(bundle.key, bundle.data.source, doc);
    }
  }

  for (const bundle of loadedBundles) {
    for (const listName of bundle.subjectLists) {
      for (const subject of bundle.data[listName] ?? []) {
        importSubject(bundle.key, bundle.data.source, subject, listName);
      }
    }
  }

  for (const bundle of loadedBundles) {
    for (const claim of bundle.data.claims ?? []) {
      importClaim(bundle.key, bundle.data.source, claim);
    }
  }

  for (const bundle of loadedBundles) {
    const seenRelationships = new Set();
    const relationships = [...(bundle.data.relationships ?? []), ...(bundle.data.edges ?? [])].filter((relationship) => {
      const key = relationship.id || `${relationship.source_id}:${relationship.target_id}:${relationship.label}`;
      if (seenRelationships.has(key)) return false;
      seenRelationships.add(key);
      return true;
    });
    for (const relationship of relationships) {
      importRelationship(bundle.key, bundle.data.source, relationship);
    }
  }

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

for (const table of ["documents", "subjects", "claims", "claim_targets", "relationships", "lexicalizations", "evidence", "evidence_links"]) {
  report.final_counts[table] = tableCount(table);
}

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
