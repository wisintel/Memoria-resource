import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { all, get } from "./db.mjs";

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, "..", "..");
const promptsDir = join(serverDir, "distillation", "prompts");
const distillationModel = process.env.MEMORIA_DISTILLATION_MODEL ?? "gpt-5.5";

export async function listCodexModels() {
  try {
    const models = await codexDistillationService().listModels();

    if (models.length > 0) {
      return { models, source: "codex-appserver" };
    }
  } catch (error) {
    console.warn(`[codex model list] ${error instanceof Error ? error.message : "failed"}`);
  }

  return { models: cachedCodexModels(), source: "codex-cache" };
}

export async function runDomainContextDistillation({ domainId, prompt, model }) {
  const domain = get(`SELECT id, slug, label, description FROM domains WHERE id = ?`, domainId);

  if (!domain) {
    throw new Error("Domain not found.");
  }

  const context = domainContextPacket(domain);
  const modelId = normalizeCodexModel(model);
  const outputText = await codexDistillationService().runJsonTask({
    input: `${prompt}\n\n## Domain Context JSON\n${JSON.stringify(context, null, 2)}`,
    model: modelId
  });
  const parsed = parseModelJson(outputText);
  const profile = validateDomainContextOutput(parsed, domain.label);

  return {
    contextSummary: {
      claim_count: context.counts.claims,
      document_count: context.counts.documents,
      relationship_count: context.counts.relationships,
      subject_count: context.counts.subjects,
      type_count: context.types.length
    },
    model: modelId,
    profile,
    rawOutput: {
      parsed,
      text: outputText
    }
  };
}

function normalizeCodexModel(model) {
  const modelId = typeof model === "string" ? model.trim() : "";

  if (!modelId || modelId.startsWith("codex-appserver/")) {
    return distillationModel;
  }

  return modelId;
}

function cachedCodexModels() {
  try {
    const cache = JSON.parse(readFileSync(join(homedir(), ".codex", "models_cache.json"), "utf8"));
    const models = Array.isArray(cache?.models) ? cache.models : [];

    return dedupeModels(models.map((model) => ({
      description: modelTextValue(model.description),
      isDefault: modelTextValue(model.slug) === distillationModel,
      label: modelTextValue(model.display_name) || modelTextValue(model.slug),
      value: modelTextValue(model.slug)
    })));
  } catch {
    return [{
      description: "Default Codex model.",
      isDefault: true,
      label: distillationModel,
      value: distillationModel
    }];
  }
}

function modelOptions(models) {
  return models
    .map((model) => ({
      description: modelTextValue(model.description),
      isDefault: Boolean(model.isDefault) || modelTextValue(model.model) === distillationModel,
      label: modelTextValue(model.displayName) || modelTextValue(model.model) || modelTextValue(model.id),
      value: modelTextValue(model.model) || modelTextValue(model.id)
    }))
    .filter((model) => model.value && !model.value.includes("auto-review"));
}

function dedupeModels(models) {
  const seen = new Set();

  return models.filter((model) => {
    if (!model.value || seen.has(model.value)) {
      return false;
    }

    seen.add(model.value);
    return true;
  });
}

function modelTextValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function runSubjectsDistillation(runRecord) {
  const prompt = loadPrompt("subjects.md");
  const document = get(`SELECT id, domain_id, label, description, source, source_type, mime_type FROM documents WHERE id = ?`, runRecord.document_id);
  const sourceUnits = all(
    `
      SELECT id, position, heading_path_json, body
      FROM source_units
      WHERE document_id = ?
      ORDER BY position ASC
    `,
    runRecord.document_id
  );

  if (!document) {
    throw new Error("Document not found.");
  }

  const context = {
    document: {
      description: document.description,
      domain_id: document.domain_id,
      id: document.id,
      label: document.label,
      mime_type: document.mime_type,
      source_type: document.source_type
    },
    prior_candidates: [],
    run: {
      current_stage: runRecord.current_stage,
      id: runRecord.id
    },
    source_units: sourceUnits.map((unit) => ({
      body: unit.body,
      heading_path: parseJsonArray(unit.heading_path_json),
      id: unit.id,
      position: unit.position
    }))
  };
  const outputText = await codexDistillationService().runJsonTask({
    input: `${prompt.source}\n\n## Context JSON\n${JSON.stringify(context, null, 2)}`,
    model: distillationModel
  });
  const parsed = parseModelJson(outputText);
  const subjects = validateSubjectsOutput(parsed);

  return {
    candidates: subjects.flatMap((subject, index) => subjectCandidates(runRecord.id, subject, index)),
    model: distillationModel,
    promptRef: `subjects.md:${prompt.hash}`,
    rawOutput: {
      parsed,
      text: outputText
    },
    summary: {
      candidate_count: subjects.length,
      input_unit_count: sourceUnits.length,
      subject_count: subjects.length
    }
  };
}

function codexDistillationService() {
  if (!globalThis.__memoriaDistillationCodexService) {
    globalThis.__memoriaDistillationCodexService = new CodexDistillationBridge();
  }

  return globalThis.__memoriaDistillationCodexService;
}

class CodexDistillationBridge {
  constructor() {
    this.initialized = false;
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
    this.process = null;
    this.readyPromise = null;
    this.turnWaiters = new Map();
  }

  async runJsonTask({ input, model }) {
    const threadId = await this.startThread(model);
    const turnId = await this.turnStart({
      approvalPolicy: "never",
      cwd: repoRoot,
      input: [
        {
          text: input,
          text_elements: [],
          type: "text"
        }
      ],
      model,
      sandboxPolicy: {
        networkAccess: false,
        type: "readOnly"
      },
      threadId
    });

    return this.waitForTurn(turnId);
  }

  async listModels() {
    let cursor = null;
    const models = [];

    do {
      const response = await this.request("model/list", {
        cursor,
        includeHidden: false,
        limit: 100
      });

      models.push(...modelOptions(response?.data ?? []));
      cursor = response?.nextCursor ?? null;
    } while (cursor);

    return dedupeModels(models);
  }

  async startThread(model) {
    const response = await this.request("thread/start", {
      approvalPolicy: "never",
      baseInstructions: [
        "You are a distillation stage runner for Memoria.",
        "Return only valid JSON matching the requested schema.",
        "Do not call tools. Do not mutate files. Do not include markdown unless explicitly asked."
      ].join("\n"),
      cwd: repoRoot,
      dynamicTools: [],
      model,
      sandbox: "read-only",
      serviceName: "memoria-distillation",
      threadSource: "memoria-distillation"
    });
    const threadId = response?.thread?.id;

    if (!threadId) {
      throw new Error("Codex did not return a distillation thread id.");
    }

    return threadId;
  }

  async turnStart(params) {
    const response = await this.request("turn/start", params);
    const turnId = response?.turn?.id;

    if (!turnId) {
      throw new Error("Codex did not return a distillation turn id.");
    }

    return turnId;
  }

  waitForTurn(turnId) {
    return new Promise((resolvePromise, rejectPromise) => {
      this.turnWaiters.set(turnId, {
        reject: rejectPromise,
        resolve: resolvePromise,
        text: ""
      });
    });
  }

  async request(method, params) {
    await this.ensureReady();

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise((resolvePromise, rejectPromise) => {
      this.pendingRequests.set(requestId, {
        reject: rejectPromise,
        resolve: resolvePromise
      });

      this.process.stdin.write(`${JSON.stringify({ id: requestId, method, params })}\n`);
    });
  }

  async ensureReady() {
    if (this.initialized && this.process) {
      return;
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.startProcess();

    try {
      await this.readyPromise;
    } finally {
      this.readyPromise = null;
    }
  }

  startProcess() {
    this.process = spawn("codex", ["app-server", "--stdio"], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.process.once("exit", () => {
      this.failAll(new Error("Codex distillation app-server stopped."));
      this.initialized = false;
      this.process = null;
    });

    this.process.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();

      if (text) {
        console.warn(`[codex distillation app-server] ${text}`);
      }
    });

    const lines = createInterface({ input: this.process.stdout });
    lines.on("line", (line) => {
      this.handleMessage(line);
    });

    return new Promise((resolvePromise, rejectPromise) => {
      const initializeId = this.nextRequestId;
      this.nextRequestId += 1;

      this.pendingRequests.set(initializeId, {
        reject: rejectPromise,
        resolve: () => {
          this.process.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
          this.initialized = true;
          resolvePromise();
        }
      });

      this.process.stdin.write(
        `${JSON.stringify({
          id: initializeId,
          method: "initialize",
          params: {
            capabilities: {
              experimentalApi: true
            },
            clientInfo: {
              name: "memoria_distillation",
              title: "Memoria Distillation",
              version: "0.1.0"
            }
          }
        })}\n`
      );
    });
  }

  handleMessage(line) {
    let message;

    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if ("id" in message && (message.result || message.error)) {
      const pending = this.pendingRequests.get(message.id);

      if (!pending) {
        return;
      }

      this.pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Codex distillation request failed."));
      } else {
        pending.resolve(message.result);
      }

      return;
    }

    if ("id" in message && message.method) {
      this.resolveServerRequest(message);
      return;
    }

    if (message.method) {
      this.handleNotification(message);
    }
  }

  resolveServerRequest(message) {
    const method = message.method ?? "";

    if (method.includes("requestApproval")) {
      this.process?.stdin.write(
        `${JSON.stringify({
          id: message.id,
          result: {
            decision: "denied",
            message: "Distillation runs are read-only and do not request approvals."
          }
        })}\n`
      );
      return;
    }

    this.process?.stdin.write(
      `${JSON.stringify({
        id: message.id,
        error: {
          code: -32601,
          message: "Distillation runner does not expose tools."
        }
      })}\n`
    );
  }

  handleNotification(message) {
    const params = message.params ?? {};
    const turnId = params.turnId ?? params.turn?.id ?? null;

    if (!turnId) {
      return;
    }

    const waiter = this.turnWaiters.get(turnId);

    if (!waiter) {
      return;
    }

    if (message.method === "item/agentMessage/delta") {
      waiter.text += params.delta ?? "";
    }

    if (message.method === "turn/completed") {
      this.turnWaiters.delete(turnId);

      if (params.turn?.status === "failed") {
        waiter.reject(new Error(params.turn?.error?.message ?? "Codex distillation turn failed."));
        return;
      }

      waiter.resolve(waiter.text.trim());
    }

    if (message.method === "error") {
      this.turnWaiters.delete(turnId);
      waiter.reject(new Error(params.message ?? "Codex distillation turn failed."));
    }
  }

  failAll(error) {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }

    this.pendingRequests.clear();

    for (const waiter of this.turnWaiters.values()) {
      waiter.reject(error);
    }

    this.turnWaiters.clear();
  }
}

function loadPrompt(fileName) {
  const path = join(promptsDir, fileName);
  const source = readFileSync(path, "utf8");
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);

  return { hash, source };
}

function parseModelJson(text) {
  const trimmed = text.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const source = fencedMatch ? fencedMatch[1] : trimmed;

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Codex returned invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

function validateSubjectsOutput(parsed) {
  const subjects = Array.isArray(parsed?.subjects) ? parsed.subjects : null;

  if (!subjects) {
    throw new Error("Subjects stage JSON must contain a subjects array.");
  }

  return subjects.map((subject, index) => {
    if (!subject || typeof subject !== "object") {
      throw new Error(`Subject ${index + 1} must be an object.`);
    }

    const label = textValue(subject.label);

    if (!label) {
      throw new Error(`Subject ${index + 1} is missing a label.`);
    }

    return {
      aliases: stringArray(subject.aliases),
      description: textValue(subject.description) ?? "",
      evidenceRefs: evidenceRefs(subject.evidenceRefs),
      label,
      localSubjectId: textValue(subject.localSubjectId) ?? `subject_${String(index + 1).padStart(3, "0")}`,
      rationale: textValue(subject.rationale) ?? "",
      type: textValue(subject.type) ?? "concept"
    };
  });
}

function domainContextPacket(domain) {
  const domainId = domain.id;
  const counts = {
    claims: get(
      `
        SELECT COUNT(DISTINCT claims.id) AS count
        FROM claims
        JOIN claim_targets ON claim_targets.claim_id = claims.id
        JOIN subject_memberships ON subject_memberships.subject_id = claim_targets.target_id
        WHERE claim_targets.target_kind = 'subject'
          AND subject_memberships.domain_id = ?
      `,
      domainId
    )?.count ?? 0,
    documents: get(`SELECT COUNT(*) AS count FROM documents WHERE domain_id = ?`, domainId)?.count ?? 0,
    relationships: get(`SELECT COUNT(*) AS count FROM relationships WHERE domain_id = ?`, domainId)?.count ?? 0,
    subjects: get(`SELECT COUNT(*) AS count FROM subject_memberships WHERE domain_id = ?`, domainId)?.count ?? 0
  };
  const types = all(
    `
      SELECT applies_to AS item_table, slug, label
      FROM type_cards
      WHERE scope_domain_id IS NULL OR scope_domain_id = ?
      ORDER BY applies_to ASC, label ASC
    `,
    domainId
  );
  const subjects = all(
    `
      SELECT
        subjects.id,
        subjects.canonical_label AS label,
        COALESCE(subject_type.label, 'Subject') AS type,
        subjects.description
      FROM subject_memberships
      JOIN subjects ON subjects.id = subject_memberships.subject_id
      LEFT JOIN type_cards AS subject_type ON subject_type.id = subjects.subject_type_id
      WHERE subject_memberships.domain_id = ?
      ORDER BY subjects.updated DESC
      LIMIT 80
    `,
    domainId
  );
  const claims = all(
    `
      SELECT DISTINCT
        claims.claim_text,
        COALESCE(claim_type.label, 'Claim') AS type
      FROM claims
      JOIN claim_targets ON claim_targets.claim_id = claims.id
      JOIN subject_memberships ON subject_memberships.subject_id = claim_targets.target_id
      LEFT JOIN type_cards AS claim_type ON claim_type.id = claims.claim_type_id
      WHERE claim_targets.target_kind = 'subject'
        AND subject_memberships.domain_id = ?
      ORDER BY claims.updated DESC
      LIMIT 60
    `,
    domainId
  );
  const relationships = all(
    `
      SELECT
        source_subject.canonical_label AS source,
        target_subject.canonical_label AS target,
        COALESCE(relationship_type.label, 'relationship') AS type
      FROM relationships
      LEFT JOIN subjects AS source_subject ON source_subject.id = relationships.source_subject_id
      LEFT JOIN subjects AS target_subject ON target_subject.id = relationships.target_subject_id
      LEFT JOIN type_cards AS relationship_type ON relationship_type.id = relationships.relationship_type_id
      WHERE relationships.domain_id = ?
      ORDER BY relationships.updated DESC
      LIMIT 80
    `,
    domainId
  );
  const documents = all(
    `
      SELECT label, source_type, status, extraction_stage, description
      FROM documents
      WHERE domain_id = ?
      ORDER BY updated DESC
      LIMIT 20
    `,
    domainId
  );

  return {
    counts,
    documents,
    domain,
    graph_samples: {
      claims,
      relationships,
      subjects
    },
    types
  };
}

function validateDomainContextOutput(parsed, domainLabel) {
  if (typeof parsed?.profile === "string" && parsed.profile.trim()) {
    return parsed.profile.trim();
  }

  const summary = stringArray(parsed?.summary);
  const expectedSubjects = stringArray(parsed?.expectedSubjects);
  const expectedClaims = stringArray(parsed?.expectedClaims);
  const expectedRelationships = stringArray(parsed?.expectedRelationships);
  const reuseGuidance = stringArray(parsed?.reuseGuidance);

  if (!summary.length && !expectedSubjects.length && !expectedClaims.length && !expectedRelationships.length && !reuseGuidance.length) {
    throw new Error("Domain context JSON must include a profile string or structured context sections.");
  }

  return [
    `# ${domainLabel} Domain Context`,
    "",
    "## Domain Summary",
    ...markdownList(summary, "No domain summary generated."),
    "",
    "## Expected Subjects",
    ...markdownList(expectedSubjects, "No subject guidance generated."),
    "",
    "## Expected Claims",
    ...markdownList(expectedClaims, "No claim guidance generated."),
    "",
    "## Expected Relationships",
    ...markdownList(expectedRelationships, "No relationship guidance generated."),
    "",
    "## Reuse Guidance",
    ...markdownList(reuseGuidance, "No reuse guidance generated.")
  ].join("\n");
}

function markdownList(items, fallback) {
  return items.length ? items.map((item) => `- ${item}`) : [`- ${fallback}`];
}

function subjectCandidates(runId, subject, index) {
  const localSubjectId = subject.localSubjectId || `subject_${String(index + 1).padStart(3, "0")}`;
  const subjectPayload = {
    ...subject,
    localSubjectId,
    stage: "subjects"
  };
  const aliasCandidates = subject.aliases.map((alias, aliasIndex) => ({
    candidate_kind: "alias",
    dedupe_key: `${runId}:subjects:${localSubjectId}:alias:${aliasIndex}`,
    payload: {
      alias,
      evidenceText: "",
      localSubjectId,
      sourceUnitId: subject.evidenceRefs[0]?.sourceUnitId ?? null,
      stage: "subjects"
    }
  }));

  return [
    {
      candidate_kind: "subject",
      dedupe_key: `${runId}:subjects:${localSubjectId}`,
      payload: subjectPayload
    },
    ...aliasCandidates
  ];
}

function evidenceRefs(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      evidenceText: textValue(item?.evidenceText) ?? "",
      sourceUnitId: textValue(item?.sourceUnitId) ?? ""
    }))
    .filter((item) => item.sourceUnitId || item.evidenceText);
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => textValue(item)).filter(Boolean) : [];
}

function textValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
