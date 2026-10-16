import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, get, all, id, now, run } from "./db.mjs";

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, "..", "..");
const assistantAgentPath = join(serverDir, "assistant-agent.toml");
const assistantAgentConfig = loadAssistantAgentConfig();
const assistantModel = process.env.MEMORIA_ASSISTANT_MODEL ?? assistantAgentConfig.model ?? "gpt-5.5";
const memoriaInstructions = assistantAgentConfig.instructions;
const memoriaDynamicToolNames = new Set([
  "app_summary",
  "current_app_context",
  "get_domain_context",
  "get_graph_view",
  "search_entities",
  "search_claims",
  "get_entity_context",
  "list_documents",
  "get_document_context",
  "propose_entity",
  "create_entity",
  "create_claim",
  "create_relationship",
  "merge_entity",
  "create_type",
  "change_type",
  "delete_relationship",
  "add_record_to_view",
  "list_domains",
  "search_cards",
  "read_card",
  "graph_view",
  "read_only_sql",
  "import_document",
  "import_document_file",
  "convert_pdf_to_document"
]);

export function assistantStatus() {
  return {
    model: assistantModel,
    instructions_path: assistantAgentPath,
    ready: true,
    transport: "codex app-server stdio"
  };
}

export function listAssistantThreads() {
  const rows = all(`
    SELECT id, codex_thread_id, title, context_json, created, updated
    FROM assistant_threads
    ORDER BY updated DESC
  `);

  return rows.map(assistantThreadFromRow);
}

export function createAssistantThread(input = {}) {
  const timestamp = now();
  const threadId = id("assistant_thread");
  const title = textOr(input.title, "New chat");
  const contextJson = JSON.stringify(input.context ?? {});

  run(
    `
      INSERT INTO assistant_threads (id, codex_thread_id, title, context_json, created, updated)
      VALUES (?, NULL, ?, ?, ?, ?)
    `,
    threadId,
    title,
    contextJson,
    timestamp,
    timestamp
  );

  return readAssistantThread(threadId);
}

export function deleteAssistantThread(threadId) {
  run(`DELETE FROM assistant_threads WHERE id = ?`, threadId);
  return { deleted: true };
}

export function stopAssistantTurn(threadId = null) {
  const service = globalThis.__memoriaAssistantService;

  if (!service) {
    return { active_turns: 0, stopped: false };
  }

  return service.stopTurns(threadId);
}

export function readAssistantThread(threadId) {
  const row = get(
    `
      SELECT id, codex_thread_id, title, context_json, created, updated
      FROM assistant_threads
      WHERE id = ?
    `,
    threadId
  );

  if (!row) {
    return null;
  }

  const events = all(
    `
      SELECT id, event_type, payload_json, created, sequence
      FROM assistant_events
      WHERE assistant_thread_id = ?
      ORDER BY sequence ASC, created ASC, id ASC
    `,
    threadId
  ).map(assistantEventFromRow);

  return {
    ...assistantThreadFromRow(row),
    events
  };
}

export async function streamAssistantTurn({ input, model, threadId }, onEvent) {
  const trimmedInput = textOr(input, "").trim();
  const turnModel = textOr(model, assistantModel).trim() || assistantModel;
  const assistantThread = threadId ? readAssistantThread(threadId) : createAssistantThread();

  if (!assistantThread) {
    throw new Error("Assistant thread not found.");
  }

  if (!trimmedInput) {
    throw new Error("Message is required.");
  }

  const service = getAssistantService();
  const codexThreadId = await ensureCodexThread(service, assistantThread, turnModel);
  const userEvent = persistAssistantEvent(assistantThread.id, "user.message", {
    role: "user",
    text: trimmedInput
  });

  touchAssistantThread(assistantThread.id, titleFromInput(assistantThread.title, trimmedInput));
  onEvent(userEvent);

  const turnStarted = persistAssistantEvent(assistantThread.id, "turn.started", {
    codex_thread_id: codexThreadId
  });
  onEvent(turnStarted);

  const turnId = await service.turnStart({
    threadId: codexThreadId,
    input: [
      {
        type: "text",
        text: trimmedInput,
        text_elements: []
      }
    ],
    cwd: repoRoot,
    model: turnModel,
    approvalPolicy: "on-request",
    sandboxPolicy: {
      type: "readOnly",
      networkAccess: false
    }
  });

  await service.waitForTurn(turnId, assistantThread.id, codexThreadId, onEvent);
}

function getAssistantService() {
  if (!globalThis.__memoriaAssistantService) {
    globalThis.__memoriaAssistantService = new CodexAppServerBridge();
  }

  return globalThis.__memoriaAssistantService;
}

async function ensureCodexThread(service, assistantThread, model) {
  if (assistantThread.codex_thread_id) {
    await service.resumeThread(assistantThread.codex_thread_id);
    return assistantThread.codex_thread_id;
  }

  const codexThreadId = await service.startThread(model);
  run(
    `
      UPDATE assistant_threads
      SET codex_thread_id = ?, updated = ?
      WHERE id = ?
    `,
    codexThreadId,
    now(),
    assistantThread.id
  );

  return codexThreadId;
}

class CodexAppServerBridge {
  constructor() {
    this.activeTurnWaiters = new Map();
    this.initialized = false;
    this.memoriaMcp = new MemoriaMcpClient();
    this.dynamicToolsPromise = null;
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
    this.process = null;
    this.readyPromise = null;
    this.resumedThreads = new Set();
  }

  async startThread(model = assistantModel) {
    const dynamicTools = await this.memoriaDynamicTools();
    const response = await this.request("thread/start", {
      approvalPolicy: "on-request",
      baseInstructions: memoriaInstructions,
      cwd: repoRoot,
      dynamicTools,
      model,
      sandbox: "read-only",
      serviceName: "memoria",
      threadSource: "memoria-local-assistant"
    });

    const threadId = response?.thread?.id;

    if (!threadId) {
      throw new Error("Codex did not return a thread id.");
    }

    this.resumedThreads.add(threadId);
    return threadId;
  }

  async resumeThread(threadId) {
    if (this.resumedThreads.has(threadId)) {
      return;
    }

    await this.request("thread/resume", { threadId });
    this.resumedThreads.add(threadId);
  }

  async turnStart(params) {
    const response = await this.request("turn/start", params);
    const turnId = response?.turn?.id;

    if (!turnId) {
      throw new Error("Codex did not return a turn id.");
    }

    return turnId;
  }

  waitForTurn(turnId, assistantThreadId, codexThreadId, onEvent) {
    return new Promise((resolve, reject) => {
      this.activeTurnWaiters.set(turnId, {
        assistantThreadId,
        codexThreadId,
        onEvent,
        reject,
        resolve
      });
    });
  }

  stopTurns(assistantThreadId = null) {
    const targets = [...this.activeTurnWaiters.entries()].filter(([, waiter]) => {
      return !assistantThreadId || waiter.assistantThreadId === assistantThreadId;
    });

    const error = new Error("Assistant stopped.");

    for (const [turnId, waiter] of targets) {
      void this.request("turn/interrupt", {
        threadId: waiter.codexThreadId,
        turnId
      }).catch(() => {
        if (this.process) {
          this.process.kill("SIGTERM");
        }
      });
      this.activeTurnWaiters.delete(turnId);
      waiter.reject(error);
    }

    if (targets.length === 0 && this.process) {
      this.process.kill("SIGTERM");
      this.failPending(error);
      this.initialized = false;
      this.process = null;
      this.resumedThreads.clear();
    }

    return {
      active_turns: targets.length,
      stopped: targets.length > 0
    };
  }

  async request(method, params) {
    await this.ensureReady();

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const payload = {
      id: requestId,
      method,
      params
    };

    return new Promise((resolvePromise, rejectPromise) => {
      this.pendingRequests.set(requestId, {
        reject: rejectPromise,
        resolve: resolvePromise
      });

      this.process.stdin.write(`${JSON.stringify(payload)}\n`);
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
    this.process = spawn("codex", ["app-server", "--stdio", "-c", memoriaMcpConfigOverride()], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.process.once("exit", () => {
      this.failAll(new Error("Codex app-server stopped."));
      this.initialized = false;
      this.process = null;
      this.resumedThreads.clear();
    });

    this.process.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();

      if (text) {
        console.warn(`[codex app-server] ${text}`);
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
              name: "memoria_local",
              title: "Memoria Local",
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
        pending.reject(new Error(message.error.message ?? "Codex request failed."));
      } else {
        pending.resolve(message.result);
      }

      return;
    }

    if ("id" in message && message.method) {
      this.resolveServerRequest(message);
      return;
    }

    if (!message.method) {
      return;
    }

    this.handleNotification(message);
  }

  resolveServerRequest(message) {
    const eventType = message.method ?? "server/request";

    if (eventType.includes("requestApproval")) {
      const response = denialResponseForServerRequest(eventType);
      this.process?.stdin.write(`${JSON.stringify({ id: message.id, result: response })}\n`);
      return;
    }

    if (eventType === "item/tool/call") {
      void this.resolveDynamicToolCall(message);
      return;
    }

    this.process?.stdin.write(
      `${JSON.stringify({
        id: message.id,
        error: {
          code: -32601,
          message: "Unsupported Memoria assistant server request."
        }
      })}\n`
    );
  }

  async resolveDynamicToolCall(message) {
    const params = message.params ?? {};
    const startedAt = Date.now();

    try {
      if (params.namespace && params.namespace !== "memoria") {
        throw new Error(`Unsupported dynamic tool namespace: ${params.namespace}`);
      }

      const result = await this.memoriaMcp.callTool(params.tool, params.arguments ?? {});
      const text = toolResultText(result);
      this.process?.stdin.write(
        `${JSON.stringify({
          id: message.id,
          result: {
            contentItems: [
              {
                type: "inputText",
                text
              }
            ],
            success: true
          }
        })}\n`
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.process?.stdin.write(
        `${JSON.stringify({
          id: message.id,
          result: {
            contentItems: [
              {
                type: "inputText",
                text
              }
            ],
            success: false
          }
        })}\n`
      );
    } finally {
      const waiter = this.activeTurnWaiters.get(params.turnId);

      if (waiter) {
        waiter.onEvent(
          persistAssistantEvent(waiter.assistantThreadId, "tool.completed", {
            detail: `${Date.now() - startedAt}ms`,
            item_id: params.callId,
            label: params.namespace ? `${params.namespace}.${params.tool}` : params.tool
          })
        );
      }
    }
  }

  async memoriaDynamicTools() {
    if (!this.dynamicToolsPromise) {
      this.dynamicToolsPromise = this.memoriaMcp.listTools().then((tools) => [
        {
          type: "namespace",
          name: "memoria",
          description: "Memoria app context, graph, document, ontology, and mutation tools.",
          tools: tools
            .filter((tool) => memoriaDynamicToolNames.has(tool.name))
            .map((tool) => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              inputSchema: sanitizeDynamicToolInputSchema(tool.inputSchema)
            }))
        }
      ]);
    }

    return this.dynamicToolsPromise;
  }

  handleNotification(message) {
    const params = message.params ?? {};
    const turnId = params.turnId ?? params.turn?.id ?? null;

    if (!turnId) {
      return;
    }

    const waiter = this.activeTurnWaiters.get(turnId);

    if (!waiter) {
      return;
    }

    const normalized = normalizeCodexNotification(message);

    if (normalized) {
      waiter.onEvent(persistAssistantEvent(waiter.assistantThreadId, normalized.event_type, normalized.payload));
    }

    if (message.method === "turn/completed") {
      this.activeTurnWaiters.delete(turnId);
      touchAssistantThread(waiter.assistantThreadId);
      waiter.resolve();
    }

    if (message.method === "error") {
      this.activeTurnWaiters.delete(turnId);
      waiter.reject(new Error(params.message ?? "Codex turn failed."));
    }
  }

  failAll(error) {
    this.failPending(error);
    this.memoriaMcp.stop();

    for (const waiter of this.activeTurnWaiters.values()) {
      waiter.reject(error);
    }

    this.activeTurnWaiters.clear();
  }

  failPending(error) {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }

    this.pendingRequests.clear();
  }
}

class MemoriaMcpClient {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.initialized = false;
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
    this.process = null;
    this.readyPromise = null;
  }

  async listTools() {
    const response = await this.request("tools/list", {});
    return response?.tools ?? [];
  }

  async callTool(name, args) {
    return this.request("tools/call", {
      name,
      arguments: args ?? {}
    });
  }

  stop() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }

    this.initialized = false;
    this.readyPromise = null;
    this.failPending(new Error("Memoria MCP server stopped."));
  }

  async request(method, params) {
    await this.ensureReady();

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const payload = {
      id: requestId,
      jsonrpc: "2.0",
      method,
      params
    };

    return new Promise((resolvePromise, rejectPromise) => {
      this.pendingRequests.set(requestId, {
        reject: rejectPromise,
        resolve: resolvePromise
      });

      this.write(payload);
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
    const serverPath = join(repoRoot, "tools", "mcp", "server.mjs");
    this.buffer = Buffer.alloc(0);
    this.process = spawn("node", [serverPath], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.process.once("exit", () => {
      this.failPending(new Error("Memoria MCP server stopped."));
      this.initialized = false;
      this.process = null;
    });

    this.process.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();

      if (text) {
        console.warn(`[memoria mcp] ${text}`);
      }
    });

    this.process.stdout.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processMessages();
    });

    return this.requestInitialize();
  }

  requestInitialize() {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise((resolvePromise, rejectPromise) => {
      this.pendingRequests.set(requestId, {
        reject: rejectPromise,
        resolve: () => {
          this.write({
            jsonrpc: "2.0",
            method: "notifications/initialized"
          });
          this.initialized = true;
          resolvePromise();
        }
      });

      this.write({
        id: requestId,
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          capabilities: {},
          clientInfo: {
            name: "memoria-assistant",
            version: "0.1.0"
          },
          protocolVersion: "2024-11-05"
        }
      });
    });
  }

  processMessages() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);

      if (!lengthMatch) {
        this.stop();
        return;
      }

      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;

      if (this.buffer.length < bodyEnd) {
        return;
      }

      const raw = this.buffer.slice(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.slice(bodyEnd);
      this.handleMessage(raw);
    }
  }

  handleMessage(raw) {
    let message;

    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (!("id" in message)) {
      return;
    }

    const pending = this.pendingRequests.get(message.id);

    if (!pending) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message ?? "Memoria MCP request failed."));
    } else {
      pending.resolve(message.result);
    }
  }

  write(payload) {
    const body = JSON.stringify(payload);
    this.process?.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  failPending(error) {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }

    this.pendingRequests.clear();
  }
}

function loadAssistantAgentConfig() {
  const fallback = {
    instructions: "You are Memoria, David's local assistant. Use the memoria-app MCP server for app context and mutations.",
    model: "gpt-5.5"
  };

  try {
    const source = readFileSync(assistantAgentPath, "utf8");
    const instructions = multilineTomlValue(source, "instructions") ?? fallback.instructions;
    const model = stringTomlValue(source, "model") ?? fallback.model;
    const skills = [...source.matchAll(/\[\[skills\]\][\s\S]*?body\s*=\s*"""([\s\S]*?)"""/g)].map((match) =>
      match[1].trim()
    );

    return {
      instructions: [instructions.trim(), ...skills].join("\n\n").trim(),
      model
    };
  } catch {
    return fallback;
  }
}

function multilineTomlValue(source, key) {
  const pattern = new RegExp(`^${key}\\s*=\\s*"""\\n?([\\s\\S]*?)\\n?"""`, "m");
  return pattern.exec(source)?.[1] ?? null;
}

function stringTomlValue(source, key) {
  const pattern = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m");
  return pattern.exec(source)?.[1] ?? null;
}

function memoriaMcpConfigOverride() {
  const mcpServerPath = join(repoRoot, "tools", "mcp", "server.mjs");
  return `mcp_servers={ "memoria-app" = { command = "node", args = [${tomlString(mcpServerPath)}], cwd = ${tomlString(repoRoot)} } }`;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function normalizeCodexNotification(message) {
  const params = message.params ?? {};

  switch (message.method) {
    case "item/agentMessage/delta":
      return {
        event_type: "assistant.message.delta",
        payload: {
          item_id: params.itemId,
          text: params.delta
        }
      };
    case "item/started":
      return itemEvent("tool.started", params);
    case "item/completed":
      return itemEvent("tool.completed", params);
    case "item/mcpToolCall/progress":
      return {
        event_type: "tool.started",
        payload: {
          detail: params.message,
          item_id: params.itemId,
          label: "MCP tool"
        }
      };
    case "turn/completed":
      return {
        event_type: params.turn?.status === "failed" ? "turn.failed" : "turn.completed",
        payload: params
      };
    default:
      return null;
  }
}

function itemEvent(eventType, params) {
  const item = params.item ?? {};

  if (!["mcpToolCall", "dynamicToolCall", "commandExecution", "fileChange"].includes(item.type)) {
    return null;
  }

  return {
    event_type: eventType,
    payload: {
      detail: toolDetail(item),
      item,
      item_id: item.id ?? params.itemId,
      label: toolLabel(item)
    }
  };
}

function toolLabel(item) {
  if (item.type === "mcpToolCall") {
    return `${item.server}.${item.tool}`;
  }

  if (item.type === "dynamicToolCall") {
    return item.namespace ? `${item.namespace}.${item.tool}` : item.tool;
  }

  if (item.type === "commandExecution") {
    return "Command";
  }

  if (item.type === "fileChange") {
    return "File change";
  }

  return "Tool";
}

function toolDetail(item) {
  if (item.type === "commandExecution") {
    return item.command;
  }

  if (item.type === "fileChange") {
    return item.status;
  }

  return item.status ?? "";
}

function sanitizeDynamicToolInputSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return {
      additionalProperties: false,
      properties: {},
      type: "object"
    };
  }

  const sanitized = sanitizeJsonSchema(schema);

  if (sanitized.type !== "object") {
    sanitized.type = "object";
  }

  if (!sanitized.properties || typeof sanitized.properties !== "object" || Array.isArray(sanitized.properties)) {
    sanitized.properties = {};
  }

  if (!Array.isArray(sanitized.required)) {
    sanitized.required = [];
  }

  sanitized.additionalProperties = false;
  return sanitized;
}

function sanitizeJsonSchema(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonSchema);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};

  for (const [key, child] of Object.entries(value)) {
    result[key] = sanitizeJsonSchema(child);
  }

  if (result.type === "array" && !result.items) {
    result.items = {};
  }

  return result;
}

function toolResultText(result) {
  const content = result?.content;

  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n\n")
      .trim();

    if (text) {
      return text;
    }
  }

  return JSON.stringify(result ?? null, null, 2);
}

function denialResponseForServerRequest(method) {
  if (method.includes("commandExecution")) {
    return { decision: "decline" };
  }

  if (method.includes("fileChange")) {
    return { decision: "decline" };
  }

  if (method.includes("permissions")) {
    return { permissions: {}, scope: "turn", strictAutoReview: true };
  }

  return { decision: "decline" };
}

function persistAssistantEvent(assistantThreadId, eventType, payload) {
  const timestamp = now();
  const eventId = id("assistant_event");
  const sequence = get(
    `
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
      FROM assistant_events
      WHERE assistant_thread_id = ?
    `,
    assistantThreadId
  ).next_sequence;

  run(
    `
      INSERT INTO assistant_events (id, assistant_thread_id, event_type, payload_json, created, sequence)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    eventId,
    assistantThreadId,
    eventType,
    JSON.stringify(payload ?? {}),
    timestamp,
    sequence
  );

  return {
    created: timestamp,
    id: eventId,
    payload: payload ?? {},
    sequence,
    type: eventType
  };
}

function touchAssistantThread(threadId, title) {
  if (title) {
    run(`UPDATE assistant_threads SET title = ?, updated = ? WHERE id = ?`, title, now(), threadId);
    return;
  }

  run(`UPDATE assistant_threads SET updated = ? WHERE id = ?`, now(), threadId);
}

function assistantThreadFromRow(row) {
  return {
    codex_thread_id: row.codex_thread_id,
    context: safeParseJson(row.context_json, {}),
    created: row.created,
    id: row.id,
    title: row.title,
    updated: row.updated
  };
}

function assistantEventFromRow(row) {
  return {
    created: row.created,
    id: row.id,
    payload: safeParseJson(row.payload_json, {}),
    sequence: row.sequence,
    type: row.event_type
  };
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function textOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function titleFromInput(currentTitle, input) {
  if (currentTitle && currentTitle !== "New chat") {
    return currentTitle;
  }

  return input.slice(0, 48) || "New chat";
}
