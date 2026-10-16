import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
const dbPath = process.env.MEMORIA_DB_PATH ?? join(dataDir, "memoria.sqlite");
const schemaVersion = "semantic_core_1";

export const ALL_DOMAINS_ID = "__all_domains__";
export const NO_DOMAIN_ID = "__no_domain__";

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
`);

initializeSchema();

export function graphSnapshot(viewId = null, domainId = null) {
  const domains = all(`
    SELECT
      id,
      slug,
      label,
      description,
      json_extract(metadata_json, '$.domain_context_profile') AS domain_context_profile,
      json_extract(metadata_json, '$.domain_context_last_run') AS domain_context_last_run_json,
      NULL AS type_id,
      created,
      updated
    FROM domains
    ORDER BY label ASC
  `).map((domain) => {
    const domainContextLastRun = parseNullableJsonObject(domain.domain_context_last_run_json);

    return {
      ...domain,
      domain_context_last_run: domainContextLastRun,
      domain_context_last_run_json: undefined
    };
  });
  const allDomainsSelected = domainId === ALL_DOMAINS_ID;
  const noDomainSelected = domainId === NO_DOMAIN_ID;
  const requestedDomainId = allDomainsSelected || noDomainSelected ? null : domainId ?? domains[0]?.id ?? null;
  const activeDomain = allDomainsSelected || noDomainSelected
    ? null
    : domains.find((domain) => domain.id === requestedDomainId) ?? null;
  const activeDomainId = activeDomain?.id ?? null;
  const views = allDomainsSelected
    ? all(`SELECT id, domain_id, slug, label, description, created, updated FROM views ORDER BY created ASC`)
    : noDomainSelected
    ? all(`SELECT id, domain_id, slug, label, description, created, updated FROM views WHERE domain_id IS NULL ORDER BY created ASC`)
    : activeDomainId
    ? all(`SELECT id, domain_id, slug, label, description, created, updated FROM views WHERE domain_id = ? ORDER BY created ASC`, activeDomainId)
    : [];
  const activeView =
    views.find((view) => view.id === viewId) ??
    views.find((view) => view.label.trim().toLowerCase() === "workbench") ??
    views[0] ??
    null;
  const activeViewId = activeView?.id ?? null;
  const itemClasses = [
    { name: "nodes" },
    { name: "claims" },
    { name: "documents" },
    { name: "edges" },
    { name: "domains" },
    { name: "types" },
    { name: "prompts" }
  ];
  const types = compatibilityTypes();
  const items = allDomainsSelected
    ? compatibilityItems("")
    : noDomainSelected
    ? compatibilityItems("WHERE domain_id IS NULL")
    : activeDomainId
    ? compatibilityItems("WHERE domain_id = ?", activeDomainId)
    : [];
  const edges = allDomainsSelected
    ? compatibilityEdges("")
    : noDomainSelected
    ? compatibilityEdges("WHERE relationships.domain_id IS NULL")
    : activeDomainId
    ? compatibilityEdges("WHERE relationships.domain_id = ?", activeDomainId)
    : [];
  const viewItems = activeViewId
    ? all(
        `
          SELECT
            view_subjects.id AS view_item_id,
            view_subjects.view_id,
            view_subjects.subject_id AS item_id,
            json_extract(view_subjects.position_json, '$.x') AS x,
            json_extract(view_subjects.position_json, '$.y') AS y,
            view_subjects.visibility,
            view_subjects.created AS view_created,
            view_subjects.updated AS view_updated,
            item_records.*
          FROM view_subjects
          JOIN (${compatibilityItemsSql("")}) AS item_records ON item_records.id = view_subjects.subject_id
          WHERE view_subjects.view_id = ?
            ${allDomainsSelected ? "" : noDomainSelected ? "AND item_records.domain_id IS NULL" : "AND item_records.domain_id = ?"}
          ORDER BY view_subjects.created ASC
        `,
        ...(allDomainsSelected || noDomainSelected ? [activeViewId] : [activeViewId, activeDomainId])
      ).map((row) => ({
        ...row,
        x: numberOr(row.x, 0),
        y: numberOr(row.y, 0)
      }))
    : [];
  const viewEdges = activeViewId
    ? all(
        `
          SELECT
            view_relationships.id AS view_edge_id,
            view_relationships.view_id,
            view_relationships.relationship_id AS edge_id,
            view_relationships.visibility,
            view_relationships.created AS view_created,
            view_relationships.updated AS view_updated,
            edge_records.*
          FROM view_relationships
          JOIN (${compatibilityEdgesSql("")}) AS edge_records ON edge_records.id = view_relationships.relationship_id
          WHERE view_relationships.view_id = ?
            ${allDomainsSelected ? "" : noDomainSelected ? "AND edge_records.domain_id IS NULL" : "AND edge_records.domain_id = ?"}
          ORDER BY view_relationships.created ASC
        `,
        ...(allDomainsSelected || noDomainSelected ? [activeViewId] : [activeViewId, activeDomainId])
      )
    : [];
  const placedItemIds = new Set(viewItems.map((viewItem) => viewItem.item_id));
  const shelfItems = items.filter((item) => !placedItemIds.has(item.id));

  return {
    activeDomain,
    activeView,
    domains,
    edges,
    itemClasses,
    items,
    shelfItems,
    types,
    views,
    viewEdges,
    viewItems
  };
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function now() {
  return new Date().toISOString();
}

export function resetWorkspace() {
  db.exec("BEGIN");
  try {
    clearSemanticData();
    seedDatabase(now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function ensureTypeCard({ appliesTo, label, scopeDomainId = null, slug = null }) {
  const resolvedSlug = slug ?? slugify(label);
  const existing = scopeDomainId
    ? get(
        `
          SELECT id
          FROM type_cards
          WHERE scope_domain_id = ? AND applies_to = ? AND slug = ?
        `,
        scopeDomainId,
        appliesTo,
        resolvedSlug
      )
    : get(
        `
          SELECT id
          FROM type_cards
          WHERE scope_domain_id IS NULL AND applies_to = ? AND slug = ?
        `,
        appliesTo,
        resolvedSlug
      );

  if (existing?.id) {
    return existing.id;
  }

  const timestamp = now();
  const typeId = id("type");
  run(
    `
      INSERT INTO type_cards (
        id,
        scope_domain_id,
        applies_to,
        slug,
        label,
        created,
        updated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    typeId,
    scopeDomainId,
    appliesTo,
    resolvedSlug,
    label,
    timestamp,
    timestamp
  );
  return typeId;
}

export function compatibilityTypes() {
  return all(`
    SELECT
      id,
      scope_domain_id AS domain_id,
      CASE applies_to
        WHEN 'subject' THEN 'nodes'
        WHEN 'relationship' THEN 'edges'
        WHEN 'claim' THEN 'claims'
        WHEN 'document' THEN 'documents'
        WHEN 'domain_type' THEN 'domains'
        ELSE applies_to
      END AS item_table,
      slug,
      label,
      created,
      updated
    FROM type_cards
    ORDER BY item_table ASC, domain_id IS NOT NULL ASC, label ASC
  `);
}

export function compatibilityItems(whereClause, ...params) {
  return all(`${compatibilityItemsSql(whereClause)} ORDER BY label ASC`, ...params);
}

export function compatibilityEdges(whereClause, ...params) {
  return all(`${compatibilityEdgesSql(whereClause)} ORDER BY relationships.created ASC`, ...params);
}

export function subjectLabel(subjectId) {
  return get(`SELECT canonical_label AS label FROM subjects WHERE id = ?`, subjectId)?.label ?? null;
}

export function recordLexicalizations({ targetKind, targetId, values, lexicalType = "alias", domainId = null }) {
  run(`DELETE FROM lexicalizations WHERE target_kind = ? AND target_id = ? AND lexical_type = ?`, targetKind, targetId, lexicalType);

  for (const value of values) {
    const normalizedValue = normalizeLexicalValue(value);

    if (!normalizedValue) {
      continue;
    }

    const timestamp = now();
    run(
      `
        INSERT INTO lexicalizations (
          id,
          target_kind,
          target_id,
          lexical_type,
          value,
          normalized_value,
          domain_id,
          created,
          updated
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      id("lex"),
      targetKind,
      targetId,
      lexicalType,
      value.trim(),
      normalizedValue,
      domainId,
      timestamp,
      timestamp
    );
  }
}

export function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function aliasesFor(targetKind, targetId) {
  return JSON.stringify(
    all(
      `
        SELECT value
        FROM lexicalizations
        WHERE target_kind = ?
          AND target_id = ?
          AND lexical_type IN ('alias', 'acronym', 'source_label', 'search_hint')
          AND status = 'active'
        ORDER BY created ASC
      `,
      targetKind,
      targetId
    ).map((row) => row.value)
  );
}

export function slugify(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

function initializeSchema() {
  const currentVersion = getSchemaVersion();

  if (currentVersion !== schemaVersion) {
    rebuildSchema();
  }

  db.exec(createSchemaSql());
  migrateAssistantEventOrder();
  migrateSubjectRoleField();
  migrateTypeKindCategories();
  migrateSubjectTypes();
  migrateDocumentTypes();
  migrateDistillationSchema();
  migratePromptSchema();
  run(
    `
      INSERT INTO schema_meta (key, value)
      VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    schemaVersion
  );
  seedDatabase(now());
}

function migrateAssistantEventOrder() {
  const columns = all(`PRAGMA table_info(assistant_events)`).map((column) => column.name);

  if (!columns.includes("sequence")) {
    db.exec(`ALTER TABLE assistant_events ADD COLUMN sequence INTEGER`);
  }

  db.exec(`
    WITH ranked_events AS (
      SELECT
        rowid,
        ROW_NUMBER() OVER (
          PARTITION BY assistant_thread_id
          ORDER BY rowid ASC
        ) - 1 AS next_sequence
      FROM assistant_events
      WHERE sequence IS NULL
    )
    UPDATE assistant_events
    SET sequence = (
      SELECT next_sequence
      FROM ranked_events
      WHERE ranked_events.rowid = assistant_events.rowid
    )
    WHERE sequence IS NULL
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assistant_events_thread_sequence
    ON assistant_events(assistant_thread_id, sequence)
  `);
}

function migrateSubjectRoleField() {
  const columns = all(`PRAGMA table_info(subjects)`).map((column) => column.name);

  if (!columns.includes("role")) {
    db.exec(`ALTER TABLE subjects ADD COLUMN role TEXT NOT NULL DEFAULT ''`);
  }

  db.exec(`
    UPDATE subjects
    SET role = COALESCE((
      SELECT label
      FROM type_cards
      WHERE type_cards.id = subjects.role_type_id
    ), '')
    WHERE role = ''
      AND role_type_id IS NOT NULL
  `);

  db.exec(`
    UPDATE subjects
    SET role_type_id = NULL
    WHERE role_type_id IN (
      SELECT id
      FROM type_cards
      WHERE applies_to = 'subject_role'
    )
  `);

  db.exec(`DELETE FROM type_cards WHERE applies_to = 'subject_role'`);
}

function migrateTypeKindCategories() {
  const canonicalCategories = [
    { from: ["claim_type", "claim_kind"], to: "claim", table: "claims", typeColumn: "claim_type_id", kindColumn: "claim_kind_id" },
    {
      from: ["relationship_type", "relationship_kind"],
      to: "relationship",
      table: "relationships",
      typeColumn: "relationship_type_id",
      kindColumn: "relationship_kind_id"
    }
  ];

  for (const category of canonicalCategories) {
    for (const type of all(
      `
        SELECT *
        FROM type_cards
        WHERE applies_to IN (${category.from.map(() => "?").join(", ")})
      `,
      ...category.from
    )) {
      const canonicalId = ensureTypeCard({
        appliesTo: category.to,
        label: type.label,
        scopeDomainId: type.scope_domain_id,
        slug: type.slug
      });

      run(`UPDATE ${category.table} SET ${category.typeColumn} = ? WHERE ${category.typeColumn} = ?`, canonicalId, type.id);
      run(`UPDATE ${category.table} SET ${category.typeColumn} = ? WHERE ${category.kindColumn} = ? AND ${category.typeColumn} IS NULL`, canonicalId, type.id);
    }

    run(`UPDATE ${category.table} SET ${category.kindColumn} = NULL`);
    run(
      `
        DELETE FROM type_cards
        WHERE applies_to IN (${category.from.map(() => "?").join(", ")})
      `,
      ...category.from
    );
  }
}

function migrateSubjectTypes() {
  const canonicalSlugs = ["actor", "artifact", "concept", "event", "object", "operation", "phase", "primitive", "principle", "process", "step"];
  const conceptTypeId = ensureTypeCard({ appliesTo: "subject", label: "Concept", slug: "concept" });

  run(
    `
      UPDATE subjects
      SET subject_type_id = ?
      WHERE subject_type_id IS NULL
         OR subject_type_id IN (
          SELECT id
          FROM type_cards
          WHERE applies_to = 'subject'
            AND slug NOT IN (${canonicalSlugs.map(() => "?").join(", ")})
        )
    `,
    conceptTypeId,
    ...canonicalSlugs
  );

  run(
    `
      DELETE FROM type_cards
      WHERE applies_to = 'subject'
        AND slug NOT IN (${canonicalSlugs.map(() => "?").join(", ")})
    `,
    ...canonicalSlugs
  );
}

function migrateDocumentTypes() {
  const sourceTypeId = ensureTypeCard({ appliesTo: "document", label: "Source", slug: "source" });

  run(`UPDATE documents SET document_type_id = ?`, sourceTypeId);
  run(`DELETE FROM type_cards WHERE applies_to = 'document_type'`);
  run(`DELETE FROM type_cards WHERE applies_to = 'document' AND id != ?`, sourceTypeId);
}

function migrateDistillationSchema() {
  const bundleColumns = all(`PRAGMA table_info(candidate_bundles)`).map((column) => column.name);

  if (!bundleColumns.includes("distillation_run_id")) {
    db.exec(`ALTER TABLE candidate_bundles ADD COLUMN distillation_run_id TEXT`);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_bundles_distillation_run
    ON candidate_bundles(distillation_run_id)
    WHERE distillation_run_id IS NOT NULL
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_candidates_bundle_status
    ON candidates(bundle_id, status)
  `);
}

function migratePromptSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      tool_key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompts_tool_domain
    ON prompts(tool_key, domain_id, status)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      body TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      content_sha256 TEXT NOT NULL DEFAULT '',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (prompt_id, version_number),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt
    ON prompt_versions(prompt_id, version_number DESC)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_bindings (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      scope_key TEXT NOT NULL,
      tool_key TEXT NOT NULL,
      active_prompt_version_id TEXT NOT NULL,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (scope_key, tool_key),
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (active_prompt_version_id) REFERENCES prompt_versions(id)
    )
  `);
}

function getSchemaVersion() {
  try {
    return get(`SELECT value FROM schema_meta WHERE key = 'schema_version'`)?.value ?? null;
  } catch {
    return null;
  }
}

function rebuildSchema() {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    for (const view of all(`SELECT name FROM sqlite_master WHERE type = 'view' AND name NOT LIKE 'sqlite_%'`)) {
      run(`DROP VIEW IF EXISTS ${quoteIdentifier(view.name)}`);
    }

    for (const table of all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)) {
      run(`DROP TABLE IF EXISTS ${quoteIdentifier(table.name)}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function createSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS type_cards (
      id TEXT PRIMARY KEY,
      scope_domain_id TEXT,
      applies_to TEXT NOT NULL,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      parent_type_id TEXT,
      description TEXT NOT NULL DEFAULT '',
      behavior_json TEXT NOT NULL DEFAULT '{}',
      fields_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (scope_domain_id) REFERENCES domains(id),
      FOREIGN KEY (parent_type_id) REFERENCES type_cards(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_type_cards_global_slug
    ON type_cards(applies_to, slug)
    WHERE scope_domain_id IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_type_cards_domain_slug
    ON type_cards(scope_domain_id, applies_to, slug)
    WHERE scope_domain_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      tool_key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_tool_domain
    ON prompts(tool_key, domain_id, status);

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      body TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      content_sha256 TEXT NOT NULL DEFAULT '',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (prompt_id, version_number),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt
    ON prompt_versions(prompt_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS prompt_bindings (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      scope_key TEXT NOT NULL,
      tool_key TEXT NOT NULL,
      active_prompt_version_id TEXT NOT NULL,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (scope_key, tool_key),
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (active_prompt_version_id) REFERENCES prompt_versions(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      canonical_label TEXT NOT NULL,
      subject_type_id TEXT,
      role TEXT NOT NULL DEFAULT '',
      role_type_id TEXT,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      source TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (subject_type_id) REFERENCES type_cards(id),
      FOREIGN KEY (role_type_id) REFERENCES type_cards(id)
    );

    CREATE TABLE IF NOT EXISTS subject_memberships (
      subject_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      membership_status TEXT NOT NULL DEFAULT 'accepted',
      source TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      PRIMARY KEY (subject_id, domain_id),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_subject_memberships_domain_id ON subject_memberships(domain_id);

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      source_subject_id TEXT NOT NULL,
      target_subject_id TEXT NOT NULL,
      relationship_type_id TEXT,
      relationship_kind_id TEXT,
      label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      assertion_state TEXT NOT NULL DEFAULT 'accepted',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      source TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (source_subject_id) REFERENCES subjects(id),
      FOREIGN KEY (target_subject_id) REFERENCES subjects(id),
      FOREIGN KEY (relationship_type_id) REFERENCES type_cards(id),
      FOREIGN KEY (relationship_kind_id) REFERENCES type_cards(id)
    );

    CREATE INDEX IF NOT EXISTS idx_relationships_domain_id ON relationships(domain_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_source_subject_id ON relationships(source_subject_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_target_subject_id ON relationships(target_subject_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_unique_type_triple
    ON relationships(
      COALESCE(domain_id, ''),
      source_subject_id,
      target_subject_id,
      COALESCE(relationship_type_id, '')
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      claim_text TEXT NOT NULL,
      claim_type_id TEXT,
      claim_kind_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      assertion_state TEXT NOT NULL DEFAULT 'candidate',
      confidence TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      source TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (claim_type_id) REFERENCES type_cards(id),
      FOREIGN KEY (claim_kind_id) REFERENCES type_cards(id)
    );

    CREATE TABLE IF NOT EXISTS claim_targets (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_role TEXT NOT NULL DEFAULT 'about',
      position INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (claim_id, target_kind, target_id, target_role),
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_claim_targets_target ON claim_targets(target_kind, target_id);

    CREATE TABLE IF NOT EXISTS claim_relationships (
      id TEXT PRIMARY KEY,
      source_claim_id TEXT NOT NULL,
      target_claim_id TEXT NOT NULL,
      relationship_type_id TEXT,
      relationship_kind_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (source_claim_id) REFERENCES claims(id) ON DELETE CASCADE,
      FOREIGN KEY (target_claim_id) REFERENCES claims(id) ON DELETE CASCADE,
      FOREIGN KEY (relationship_type_id) REFERENCES type_cards(id),
      FOREIGN KEY (relationship_kind_id) REFERENCES type_cards(id)
    );

    CREATE TABLE IF NOT EXISTS lexicalizations (
      id TEXT PRIMARY KEY,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      lexical_type TEXT NOT NULL DEFAULT 'alias',
      value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      domain_id TEXT,
      source_document_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (source_document_id) REFERENCES documents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_lexicalizations_target ON lexicalizations(target_kind, target_id);
    CREATE INDEX IF NOT EXISTS idx_lexicalizations_normalized ON lexicalizations(normalized_value);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      label TEXT NOT NULL,
      document_type_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'markdown',
      status TEXT NOT NULL DEFAULT 'ready',
      extraction_stage TEXT NOT NULL DEFAULT 'not_started',
      description TEXT NOT NULL DEFAULT '',
      content_sha256 TEXT NOT NULL DEFAULT '',
      body_sha256 TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      intake_profile TEXT NOT NULL DEFAULT '',
      source_filename TEXT,
      source_url TEXT,
      mime_type TEXT,
      shard_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      source TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (document_type_id) REFERENCES type_cards(id)
    );

    CREATE INDEX IF NOT EXISTS idx_documents_domain_id ON documents(domain_id);
    CREATE INDEX IF NOT EXISTS idx_documents_content_sha256 ON documents(content_sha256);

    CREATE TABLE IF NOT EXISTS source_units (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      unit_type TEXT NOT NULL DEFAULT 'chunk',
      heading_path_json TEXT NOT NULL DEFAULT '[]',
      body TEXT NOT NULL,
      locator_json TEXT NOT NULL DEFAULT '{}',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (document_id, position),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_source_units_document_id ON source_units(document_id);

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      evidence_kind TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      document_id TEXT,
      source_unit_id TEXT,
      locator_json TEXT NOT NULL DEFAULT '{}',
      excerpt TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (source_unit_id) REFERENCES source_units(id)
    );

    CREATE TABLE IF NOT EXISTS evidence_links (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      link_role TEXT NOT NULL DEFAULT 'supports',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (evidence_id, target_kind, target_id, link_role),
      FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      view_kind TEXT NOT NULL DEFAULT 'working',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    );

    CREATE INDEX IF NOT EXISTS idx_views_domain_id ON views(domain_id);

    CREATE TABLE IF NOT EXISTS view_subjects (
      id TEXT PRIMARY KEY,
      view_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden', 'collapsed', 'metadata_only')),
      position_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (view_id, subject_id),
      FOREIGN KEY (view_id) REFERENCES views(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_view_subjects_view_id ON view_subjects(view_id);

    CREATE TABLE IF NOT EXISTS view_relationships (
      id TEXT PRIMARY KEY,
      view_id TEXT NOT NULL,
      relationship_id TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden', 'collapsed', 'metadata_only')),
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (view_id, relationship_id),
      FOREIGN KEY (view_id) REFERENCES views(id) ON DELETE CASCADE,
      FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_view_relationships_view_id ON view_relationships(view_id);

    CREATE TABLE IF NOT EXISTS candidate_bundles (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      distillation_run_id TEXT,
      bundle_kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      source_context_json TEXT NOT NULL DEFAULT '{}',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    );

    CREATE TABLE IF NOT EXISTS distillation_runs (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      document_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_stage TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}',
      summary_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_distillation_runs_document_id ON distillation_runs(document_id);
    CREATE INDEX IF NOT EXISTS idx_distillation_runs_status ON distillation_runs(status);

    CREATE TABLE IF NOT EXISTS distillation_stage_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      stage_order INTEGER NOT NULL,
      status TEXT NOT NULL,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      result_summary_json TEXT NOT NULL DEFAULT '{}',
      raw_output_json TEXT NOT NULL DEFAULT '{}',
      prompt_ref TEXT,
      model TEXT,
      error_message TEXT,
      started TEXT,
      completed TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE (run_id, stage),
      FOREIGN KEY (run_id) REFERENCES distillation_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_distillation_stage_runs_run_id ON distillation_stage_runs(run_id);

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL,
      candidate_kind TEXT NOT NULL,
      target_kind TEXT,
      target_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      dedupe_key TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      review_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (bundle_id) REFERENCES candidate_bundles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_candidates_bundle_status
    ON candidates(bundle_id, status);

    CREATE TABLE IF NOT EXISTS admission_decisions (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      disposition TEXT NOT NULL,
      target_kind TEXT,
      target_id TEXT,
      rationale TEXT NOT NULL DEFAULT '',
      decided_by TEXT NOT NULL DEFAULT 'user',
      decided_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shelf_folders (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shelf_folder_items (
      folder_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      PRIMARY KEY (folder_id, item_id),
      FOREIGN KEY (folder_id) REFERENCES shelf_folders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_shelf_folders_scope ON shelf_folders(scope);
    CREATE INDEX IF NOT EXISTS idx_shelf_folder_items_item_id ON shelf_folder_items(item_id);

    CREATE TABLE IF NOT EXISTS app_context_snapshots (
      id TEXT PRIMARY KEY,
      context_json TEXT NOT NULL,
      created TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_app_context_snapshots_created ON app_context_snapshots(created);

    CREATE TABLE IF NOT EXISTS assistant_threads (
      id TEXT PRIMARY KEY,
      codex_thread_id TEXT,
      title TEXT NOT NULL,
      context_json TEXT NOT NULL DEFAULT '{}',
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assistant_events (
      id TEXT PRIMARY KEY,
      assistant_thread_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created TEXT NOT NULL,
      sequence INTEGER,
      FOREIGN KEY (assistant_thread_id) REFERENCES assistant_threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_assistant_threads_updated ON assistant_threads(updated);
    CREATE INDEX IF NOT EXISTS idx_assistant_events_thread_created ON assistant_events(assistant_thread_id, created);
  `;
}

function seedDatabase(timestamp) {
  if (!get(`SELECT id FROM domains LIMIT 1`)) {
    run(
      `
        INSERT INTO domains (id, slug, label, description, created, updated)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      "domain_memoria",
      "memoria",
      "Memoria",
      "Default Memoria workspace domain.",
      timestamp,
      timestamp
    );
  }

  seedTypeCards();

  if (!get(`SELECT id FROM views LIMIT 1`)) {
    run(
      `
        INSERT INTO views (id, domain_id, slug, label, description, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      "view_memoria_workbench",
      "domain_memoria",
      "memoria-workbench",
      "Workbench",
      "Default graph editing view.",
      timestamp,
      timestamp
    );
  }
}

function seedTypeCards() {
  const types = [
    ["subject", "concept", "Concept", "An idea, category, method, principle, phase, operation, or abstraction."],
    ["subject", "actor", "Actor", "A person, organization, system, or agent capable of acting."],
    ["subject", "object", "Object", "A concrete artifact, document, product, tool, system, or versioned thing."],
    ["subject", "event", "Event", "A bounded occurrence or change that happens at a time or within a process."],
    ["subject", "primitive", "Primitive", "A core semantic record or graph building block that belongs to Memoria canonical state, such as a subject, claim, edge, evidence, lexicalization, domain, or cluster."],
    ["subject", "process", "Process", "An organized flow of work or activity that unfolds over time, coordinates operations or phases, and transforms inputs, state, or understanding toward an outcome."],
    ["subject", "phase", "Phase", "A major stage within a process that groups related operations and changes the process state toward its outcome."],
    ["subject", "artifact", "Artifact", "A produced or maintained work product, surface, bundle, registry, index, or representation derived from or used by graph state."],
    ["subject", "operation", "Operation", "A bounded action or procedure performed within a process or phase to transform, validate, normalize, admit, or produce something."],
    ["subject", "principle", "Principle", "A governing rule, heuristic, invariant, or design commitment that shapes how processes, operations, or graph records should behave."],
    ["subject", "step", "Step", "A discrete unit of work within an operation, phase, or process, usually ordered or reviewable as part of a larger workflow."],
    ["relationship", "relates-to", "relates to", "The source subject has a meaningful but currently unspecified connection to the target subject."],
    ["relationship", "about", "about", "The source record is about, describes, or directly concerns the target subject."],
    ["relationship", "supports", "supports", "The source subject or claim provides support for the target subject, claim, or relationship."],
    ["relationship", "contradicts", "contradicts", "The source subject or claim conflicts with or challenges the target subject, claim, or relationship."],
    ["relationship", "part-of", "part of", "The source subject is a component, phase, step, or substructure of the target subject."],
    ["relationship", "precedes", "precedes", "The source subject comes before the target subject in an ordered process or sequence."],
    ["relationship", "uses", "uses", "The source subject depends on, applies, or makes use of the target subject."],
    ["relationship", "produces", "produces", "The source subject creates, yields, or outputs the target subject."],
    ["relationship", "performs", "performs", "The source process, operation, actor, or system carries out the target practice, function, or activity."],
    ["relationship", "classified-as", "classified as", "The source subject is an instance or member of the target classifier concept."],
    ["relationship", "governs", "governs", "The source principle, rule, or practice constrains or guides the target process, operation, or behavior."],
    ["relationship", "extracts", "extracts", "The source process or operation identifies and pulls the target subject from source material."],
    ["relationship", "normalizes", "normalizes", "The source process or operation standardizes the target subject into a canonical form."],
    ["relationship", "phase-of", "phase of", "The source subject is a named phase within the target process or cycle."],
    ["relationship", "structures", "structures", "The source subject organizes or gives shape to the target subject."],
    ["relationship", "addresses", "addresses", "The source subject is intended to handle, resolve, or respond to the target subject."],
    ["claim", "definition", "Definition"],
    ["claim", "classification", "Classification"],
    ["claim", "principle", "Principle"],
    ["claim", "property", "Property"],
    ["claim", "requirement", "Requirement"],
    ["claim", "causal", "Causal"],
    ["claim", "boundary", "Boundary"],
    ["claim", "composition", "Composition"],
    ["claim", "comparison", "Comparison"],
    ["claim", "constraint", "Constraint"],
    ["claim", "identity", "Identity"],
    ["claim", "measurement", "Measurement"],
    ["claim", "role", "Role"],
    ["claim", "state", "State"],
    ["claim", "temporal", "Temporal"],
    ["claim", "vocabulary", "Vocabulary"],
    ["document", "source", "Source"],
    ["view_kind", "working", "Working"],
    ["view_kind", "semantic", "Semantic"],
    ["view_kind", "review", "Review"]
  ];

  for (const [appliesTo, slug, label, description] of types) {
    ensureTypeCard({ appliesTo, label, slug });
    if (description) {
      run(
        `
          UPDATE type_cards
          SET description = ?
          WHERE applies_to = ? AND slug = ? AND description = ''
        `,
        description,
        appliesTo,
        slug
      );
    }
  }
}

function clearSemanticData() {
  db.exec(`
    DELETE FROM view_relationships;
    DELETE FROM view_subjects;
    DELETE FROM evidence_links;
    DELETE FROM evidence;
    DELETE FROM lexicalizations;
    DELETE FROM claim_relationships;
    DELETE FROM claim_targets;
    DELETE FROM claims;
    DELETE FROM relationships;
    DELETE FROM subject_memberships;
    DELETE FROM subjects;
    DELETE FROM source_units;
    DELETE FROM shelf_folder_items;
    DELETE FROM shelf_folders;
    DELETE FROM documents;
    DELETE FROM views;
    DELETE FROM admission_decisions;
    DELETE FROM candidates;
    DELETE FROM candidate_bundles;
  `);
}

function compatibilityItemsSql(whereClause) {
  return `
    SELECT *
    FROM (
      SELECT
        subjects.id AS id,
        'nodes' AS item_table,
        subject_domain.domain_id,
        subjects.canonical_label AS label,
        subjects.subject_type_id AS type_id,
        COALESCE(subject_type.label, 'Subject') AS type,
        COALESCE(subjects.role, '') AS role,
        subjects.description,
        ${aliasesSql("'subject'", "subjects.id")} AS aliases,
        '[]' AS tags,
        '' AS normalized,
        '' AS last_updated,
        NULL AS content_sha256,
        NULL AS body_sha256,
        NULL AS size_bytes,
        NULL AS intake_profile,
        NULL AS extraction_stage,
        subjects.source,
        NULL AS claim_text,
        NULL AS source_id,
        NULL AS target_id,
        subjects.created,
        subjects.updated
      FROM subjects
      LEFT JOIN type_cards AS subject_type ON subject_type.id = subjects.subject_type_id
      LEFT JOIN (
        SELECT subject_id, MIN(domain_id) AS domain_id
        FROM subject_memberships
        WHERE membership_status != 'rejected'
        GROUP BY subject_id
      ) AS subject_domain ON subject_domain.subject_id = subjects.id

      UNION ALL

      SELECT
        claims.id AS id,
        'claims' AS item_table,
        target_domain.domain_id,
        COALESCE(claim_type.label, 'Claim') || '-' || COALESCE(target_label.canonical_label, claims.id) AS label,
        claims.claim_type_id AS type_id,
        COALESCE(claim_type.label, 'Claim') AS type,
        '' AS role,
        '' AS description,
        '[]' AS aliases,
        '[]' AS tags,
        '' AS normalized,
        '' AS last_updated,
        NULL AS content_sha256,
        NULL AS body_sha256,
        NULL AS size_bytes,
        NULL AS intake_profile,
        NULL AS extraction_stage,
        claims.source,
        claims.claim_text,
        NULL AS source_id,
        primary_target.target_id AS target_id,
        claims.created,
        claims.updated
      FROM claims
      LEFT JOIN type_cards AS claim_type ON claim_type.id = claims.claim_type_id
      LEFT JOIN (
        SELECT claim_id, target_id
        FROM claim_targets
        WHERE target_role = 'about'
        GROUP BY claim_id
      ) AS primary_target ON primary_target.claim_id = claims.id
      LEFT JOIN subjects AS target_label ON target_label.id = primary_target.target_id
      LEFT JOIN (
        SELECT subject_id, MIN(domain_id) AS domain_id
        FROM subject_memberships
        WHERE membership_status != 'rejected'
        GROUP BY subject_id
      ) AS target_domain ON target_domain.subject_id = primary_target.target_id

      UNION ALL

      SELECT
        documents.id AS id,
        'documents' AS item_table,
        documents.domain_id,
        documents.label,
        documents.document_type_id AS type_id,
        COALESCE(document_type.label, documents.source_type) AS type,
        '' AS role,
        documents.description,
        ${aliasesSql("'document'", "documents.id")} AS aliases,
        '[]' AS tags,
        '' AS normalized,
        '' AS last_updated,
        documents.content_sha256,
        documents.body_sha256,
        documents.size_bytes,
        documents.intake_profile,
        documents.extraction_stage,
        documents.source,
        NULL AS claim_text,
        NULL AS source_id,
        NULL AS target_id,
        documents.created,
        documents.updated
      FROM documents
      LEFT JOIN type_cards AS document_type ON document_type.id = documents.document_type_id

      UNION ALL

      SELECT
        domains.id AS id,
        'domains' AS item_table,
        domains.id AS domain_id,
        domains.label,
        NULL AS type_id,
        'domain' AS type,
        '' AS role,
        domains.description,
        '[]' AS aliases,
        '[]' AS tags,
        domains.slug AS normalized,
        '' AS last_updated,
        NULL AS content_sha256,
        NULL AS body_sha256,
        NULL AS size_bytes,
        NULL AS intake_profile,
        NULL AS extraction_stage,
        NULL AS source,
        NULL AS claim_text,
        NULL AS source_id,
        NULL AS target_id,
        domains.created,
        domains.updated
      FROM domains

      UNION ALL

      SELECT
        type_cards.id AS id,
        'types' AS item_table,
        type_cards.scope_domain_id AS domain_id,
        type_cards.label,
        type_cards.parent_type_id AS type_id,
        type_cards.applies_to AS type,
        '' AS role,
        type_cards.description,
        '[]' AS aliases,
        '[]' AS tags,
        type_cards.slug AS normalized,
        '' AS last_updated,
        NULL AS content_sha256,
        NULL AS body_sha256,
        NULL AS size_bytes,
        NULL AS intake_profile,
        NULL AS extraction_stage,
        NULL AS source,
        NULL AS claim_text,
        NULL AS source_id,
        NULL AS target_id,
        type_cards.created,
        type_cards.updated
      FROM type_cards

      UNION ALL

      SELECT
        prompts.id AS id,
        'prompts' AS item_table,
        prompts.domain_id,
        prompts.label,
        NULL AS type_id,
        prompts.tool_key AS type,
        '' AS role,
        '' AS description,
        '[]' AS aliases,
        '[]' AS tags,
        prompts.status AS normalized,
        '' AS last_updated,
        NULL AS content_sha256,
        NULL AS body_sha256,
        NULL AS size_bytes,
        NULL AS intake_profile,
        NULL AS extraction_stage,
        NULL AS source,
        NULL AS claim_text,
        NULL AS source_id,
        NULL AS target_id,
        prompts.created,
        prompts.updated
      FROM prompts
    )
    ${whereClause}
  `;
}

function compatibilityEdgesSql(whereClause) {
  return `
    SELECT
      relationships.id,
      relationships.domain_id,
      relationships.source_subject_id AS source_id,
      relationships.target_subject_id AS target_id,
      relationships.relationship_type_id AS type_id,
      COALESCE(relationship_type.label, 'relationship') AS type,
      relationships.label,
      relationships.source,
      relationships.created,
      relationships.updated,
      source_subject.canonical_label AS source_label,
      target_subject.canonical_label AS target_label
    FROM relationships
    LEFT JOIN type_cards AS relationship_type ON relationship_type.id = relationships.relationship_type_id
    LEFT JOIN subjects AS source_subject ON source_subject.id = relationships.source_subject_id
    LEFT JOIN subjects AS target_subject ON target_subject.id = relationships.target_subject_id
    ${whereClause}
  `;
}

function aliasesSql(targetKindSql, targetIdExpression) {
  return `COALESCE((
    SELECT json_group_array(value)
    FROM lexicalizations
    WHERE lexicalizations.target_kind = ${targetKindSql}
      AND lexicalizations.target_id = ${targetIdExpression}
      AND lexicalizations.lexical_type IN ('alias', 'acronym', 'source_label', 'search_hint')
      AND lexicalizations.status = 'active'
  ), '[]')`;
}

function normalizeLexicalValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseNullableJsonObject(value) {
  try {
    const parsed = JSON.parse(value ?? "null");

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
