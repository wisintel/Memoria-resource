import { createHash } from "node:crypto";
import { all, db, get, id, now, run } from "./db.mjs";

const DOMAIN_CONTEXT_DEFAULT_PROMPT = `## Task

Create a reusable Memoria domain context packet from the provided domain graph context.

Return only JSON with this shape:

{
  "profile": "Markdown context packet for future extraction tools"
}

The profile should include:
- Domain summary
- Expected subjects
- Expected claims
- Expected relationships
- Reuse guidance

Rules:
- Use only the provided domain context.
- Keep the packet compact enough to send with extraction tools.
- Describe expected extraction targets, not UI behavior.
- Do not create canonical records.
- Do not include speculation that is unsupported by the domain context.`;

const DEFAULT_PROMPTS = {
  domain_context: {
    body: DOMAIN_CONTEXT_DEFAULT_PROMPT,
    label: "Domain Context Generator"
  }
};

export function promptSnapshot(input = {}) {
  const domainId = nullableText(input.domainId ?? input.domain_id);
  const toolKey = requiredText(input.toolKey ?? input.tool_key, "Tool key is required.");
  const defaultPrompt = DEFAULT_PROMPTS[toolKey];

  if (defaultPrompt && domainId) {
    ensureDefaultPrompt({ domainId, toolKey, ...defaultPrompt });
  }

  const prompts = all(
    `
      SELECT *
      FROM prompts
      WHERE tool_key = ?
        AND COALESCE(domain_id, '') = COALESCE(?, '')
        AND status != 'archived'
      ORDER BY updated DESC
    `,
    toolKey,
    domainId
  ).map(mapPrompt);
  const versions = prompts.length
    ? all(
        `
          SELECT prompt_versions.*
          FROM prompt_versions
          JOIN prompts ON prompts.id = prompt_versions.prompt_id
          WHERE prompts.tool_key = ?
            AND COALESCE(prompts.domain_id, '') = COALESCE(?, '')
            AND prompts.status != 'archived'
          ORDER BY prompt_versions.prompt_id ASC, prompt_versions.version_number DESC
        `,
        toolKey,
        domainId
      ).map(mapPromptVersion)
    : [];
  const activeBinding = get(
    `
      SELECT *
      FROM prompt_bindings
      WHERE scope_key = ? AND tool_key = ?
    `,
    scopeKey(domainId),
    toolKey
  );

  return {
    activeBinding: activeBinding ? mapPromptBinding(activeBinding) : null,
    prompts,
    selectedPromptId: activeBinding
      ? versions.find((version) => version.id === activeBinding.active_prompt_version_id)?.prompt_id ?? prompts[0]?.id ?? null
      : prompts[0]?.id ?? null,
    selectedVersionId: activeBinding?.active_prompt_version_id ?? versions[0]?.id ?? null,
    toolKey,
    versions
  };
}

export function createPrompt(input = {}) {
  const body = requiredText(input.body, "Prompt body is required.");
  const domainId = nullableText(input.domain_id ?? input.domainId);
  const label = requiredText(input.label, "Prompt name is required.");
  const toolKey = requiredText(input.tool_key ?? input.toolKey, "Tool key is required.");
  const timestamp = now();
  const promptId = id("prompt");
  const versionId = id("prompt_version");
  const setActive = input.set_active ?? input.setActive ?? true;

  db.exec("BEGIN");
  try {
    run(
      `
        INSERT INTO prompts (
          id, domain_id, tool_key, label, status, metadata_json, created, updated
        )
        VALUES (?, ?, ?, ?, 'active', '{}', ?, ?)
      `,
      promptId,
      domainId,
      toolKey,
      label,
      timestamp,
      timestamp
    );
    insertPromptVersion({ body, notes: textValue(input.notes), promptId, timestamp, versionId, versionNumber: 1 });

    if (setActive) {
      bindPromptVersion({ domainId, toolKey, timestamp, versionId });
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return promptSnapshot({ domainId, toolKey });
}

export function createPromptVersion(promptId, input = {}) {
  const prompt = get(`SELECT * FROM prompts WHERE id = ?`, promptId);

  if (!prompt) {
    throw new Error("Prompt not found.");
  }

  const body = requiredText(input.body, "Prompt body is required.");
  const timestamp = now();
  const versionId = id("prompt_version");
  const versionNumber = Number(get(`SELECT MAX(version_number) AS version_number FROM prompt_versions WHERE prompt_id = ?`, promptId)?.version_number ?? 0) + 1;
  const setActive = input.set_active ?? input.setActive ?? true;

  db.exec("BEGIN");
  try {
    insertPromptVersion({
      body,
      notes: textValue(input.notes),
      promptId,
      timestamp,
      versionId,
      versionNumber
    });
    run(`UPDATE prompts SET updated = ? WHERE id = ?`, timestamp, promptId);

    if (setActive) {
      bindPromptVersion({
        domainId: prompt.domain_id,
        toolKey: prompt.tool_key,
        timestamp,
        versionId
      });
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return promptSnapshot({ domainId: prompt.domain_id, toolKey: prompt.tool_key });
}

export function setActivePromptVersion(input = {}) {
  const versionId = requiredText(input.prompt_version_id ?? input.promptVersionId, "Prompt version is required.");
  const version = get(
    `
      SELECT prompt_versions.*, prompts.domain_id, prompts.tool_key
      FROM prompt_versions
      JOIN prompts ON prompts.id = prompt_versions.prompt_id
      WHERE prompt_versions.id = ?
    `,
    versionId
  );

  if (!version) {
    throw new Error("Prompt version not found.");
  }

  bindPromptVersion({
    domainId: version.domain_id,
    toolKey: version.tool_key,
    timestamp: now(),
    versionId
  });

  return promptSnapshot({ domainId: version.domain_id, toolKey: version.tool_key });
}

function ensureDefaultPrompt({ body, domainId, label, toolKey }) {
  const existing = get(
    `
      SELECT id
      FROM prompts
      WHERE tool_key = ?
        AND COALESCE(domain_id, '') = COALESCE(?, '')
        AND status != 'archived'
      LIMIT 1
    `,
    toolKey,
    domainId
  );

  if (existing) {
    return;
  }

  createPrompt({
    body,
    domain_id: domainId,
    label,
    set_active: true,
    tool_key: toolKey
  });
}

function insertPromptVersion({ body, notes, promptId, timestamp, versionId, versionNumber }) {
  run(
    `
      INSERT INTO prompt_versions (
        id, prompt_id, version_number, body, notes, content_sha256, created, updated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    versionId,
    promptId,
    versionNumber,
    body,
    notes,
    sha256(body),
    timestamp,
    timestamp
  );
}

function bindPromptVersion({ domainId, timestamp, toolKey, versionId }) {
  const existing = get(`SELECT id FROM prompt_bindings WHERE scope_key = ? AND tool_key = ?`, scopeKey(domainId), toolKey);

  if (existing) {
    run(
      `
        UPDATE prompt_bindings
        SET active_prompt_version_id = ?, updated = ?
        WHERE id = ?
      `,
      versionId,
      timestamp,
      existing.id
    );
    return;
  }

  run(
    `
      INSERT INTO prompt_bindings (
        id, domain_id, scope_key, tool_key, active_prompt_version_id, created, updated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    id("prompt_binding"),
    domainId,
    scopeKey(domainId),
    toolKey,
    versionId,
    timestamp,
    timestamp
  );
}

function mapPrompt(row) {
  return {
    created: row.created,
    domain_id: row.domain_id,
    id: row.id,
    label: row.label,
    status: row.status,
    tool_key: row.tool_key,
    updated: row.updated
  };
}

function mapPromptVersion(row) {
  return {
    body: row.body,
    content_sha256: row.content_sha256,
    created: row.created,
    id: row.id,
    notes: row.notes,
    prompt_id: row.prompt_id,
    updated: row.updated,
    version_number: Number(row.version_number)
  };
}

function mapPromptBinding(row) {
  return {
    active_prompt_version_id: row.active_prompt_version_id,
    created: row.created,
    domain_id: row.domain_id,
    id: row.id,
    scope_key: row.scope_key,
    tool_key: row.tool_key,
    updated: row.updated
  };
}

function scopeKey(domainId) {
  return domainId || "__global__";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nullableText(value) {
  const text = textValue(value);
  return text || null;
}

function requiredText(value, message) {
  const text = textValue(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
