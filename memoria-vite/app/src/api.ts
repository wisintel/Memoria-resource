import type {
  AssistantEvent,
  AssistantStatus,
  AssistantThread,
  AdmissionSnapshot,
  CodexModelSnapshot,
  DocumentWorkbenchSnapshot,
  DistillationRunDetail,
  DistillationSnapshot,
  DistillationStageKey,
  GraphSnapshot,
  ImportDocumentResult,
  PromptSnapshot
} from "./types";

export async function loadGraph(viewId?: string | null, domainId?: string | null) {
  const search = new URLSearchParams();

  if (viewId) {
    search.set("viewId", viewId);
  }

  if (domainId) {
    search.set("domainId", domainId);
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  return api<GraphSnapshot>(`/api/graph${query}`);
}

export async function loadCodexModels() {
  return api<CodexModelSnapshot>("/api/codex/models");
}

export async function loadDocumentWorkbench() {
  return api<DocumentWorkbenchSnapshot>("/api/documents/workbench");
}

export async function loadDistillationSnapshot(input: { documentId?: string | null; domainId?: string | null; runId?: string | null } = {}) {
  const search = new URLSearchParams();

  if (input.documentId) {
    search.set("documentId", input.documentId);
  }

  if (input.domainId) {
    search.set("domainId", input.domainId);
  }

  if (input.runId) {
    search.set("runId", input.runId);
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  return api<DistillationSnapshot>(`/api/distillation/snapshot${query}`);
}

export async function createDistillationRun(input: { document_id: string; domain_id?: string | null }) {
  return api<DistillationRunDetail>("/api/distillation/runs", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function loadDistillationRun(id: string) {
  return api<DistillationRunDetail>(`/api/distillation/runs/${encodeURIComponent(id)}`);
}

export async function runDistillationStage(id: string, stage: DistillationStageKey) {
  return api<DistillationRunDetail>(`/api/distillation/runs/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/run`, {
    method: "POST"
  });
}

export async function resetDistillationRun(id: string) {
  return api<DistillationRunDetail>(`/api/distillation/runs/${encodeURIComponent(id)}/reset`, {
    method: "POST"
  });
}

export async function loadPromptSnapshot(input: { domainId?: string | null; toolKey: string }) {
  const search = new URLSearchParams();
  search.set("toolKey", input.toolKey);

  if (input.domainId) {
    search.set("domainId", input.domainId);
  }

  return api<PromptSnapshot>(`/api/prompts?${search.toString()}`);
}

export async function createPrompt(input: {
  body: string;
  domain_id?: string | null;
  label: string;
  set_active?: boolean;
  tool_key: string;
}) {
  return api<PromptSnapshot>("/api/prompts", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function createPromptVersion(
  promptId: string,
  input: { body: string; notes?: string; set_active?: boolean }
) {
  return api<PromptSnapshot>(`/api/prompts/${encodeURIComponent(promptId)}/versions`, {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function setActivePromptVersion(input: { prompt_version_id: string }) {
  return api<PromptSnapshot>("/api/prompt-bindings", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function loadAdmissionSnapshot(input: { runId?: string | null } = {}) {
  const search = new URLSearchParams();

  if (input.runId) {
    search.set("runId", input.runId);
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  return api<AdmissionSnapshot>(`/api/admission/snapshot${query}`);
}

export async function resolveAdmissionSubject(input: {
  disposition: "admit" | "merge" | "reject";
  local_subject_id: string;
  rationale?: string;
  run_id: string;
  target_subject_id?: string | null;
}) {
  return api<DistillationRunDetail>("/api/admission/subjects/resolve", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function resolveAdmissionCandidate(input: {
  candidate_id: string;
  disposition: "admit" | "reject";
  rationale?: string;
  run_id: string;
  target_id?: string | null;
}) {
  return api<DistillationRunDetail>("/api/admission/candidates/resolve", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function updateAppContext(input: unknown) {
  return api<{ created: string; recorded: true }>("/api/app-context", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function loadAssistantStatus() {
  return api<AssistantStatus>("/api/assistant/status");
}

export async function loadAssistantThreads() {
  return api<{ threads: AssistantThread[] }>("/api/assistant/threads");
}

export async function createAssistantThread(input: { context?: Record<string, unknown>; title?: string } = {}) {
  return api<AssistantThread>("/api/assistant/threads", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function loadAssistantThread(id: string) {
  return api<AssistantThread>(`/api/assistant/threads/${encodeURIComponent(id)}`);
}

export async function deleteAssistantThread(id: string) {
  return api<{ deleted: boolean }>(`/api/assistant/threads/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function stopAssistantTurn(threadId?: string | null) {
  return api<{ active_turns: number; stopped: boolean }>("/api/assistant/stop", {
    body: JSON.stringify({
      thread_id: threadId ?? null
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
}

export async function streamAssistantTurn(input: {
  message: string;
  model?: string | null;
  threadId?: string | null;
  onEvent: (event: AssistantEvent) => void;
}) {
  const response = await fetch("/api/assistant/turn", {
    body: JSON.stringify({
      input: input.message,
      model: input.model ?? null,
      thread_id: input.threadId ?? null
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok || !response.body) {
    let message = "Assistant request failed.";

    try {
      const payload = await response.json();
      message = payload.error ?? message;
    } catch {
      // Keep the generic error.
    }

    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      input.onEvent(JSON.parse(trimmed) as AssistantEvent);
    }
  }

  const remaining = buffer.trim();

  if (remaining) {
    input.onEvent(JSON.parse(remaining) as AssistantEvent);
  }
}

export async function importDocument(input: {
  content: string;
  domain_id?: string | null;
  label: string;
  mime_type?: string | null;
  source_filename?: string | null;
  source_type: "html" | "markdown";
}) {
  return api<ImportDocumentResult>("/api/documents/import", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function importDocumentFile(input: {
  data_base64: string;
  domain_id?: string | null;
  label: string;
  mime_type?: string | null;
  source_filename?: string | null;
  source_type?: "html" | "markdown";
}) {
  return api<ImportDocumentResult>("/api/documents/import-file", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function deleteDocument(id: string) {
  return api<DocumentWorkbenchSnapshot>(`/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function createShelfFolder(input: { label: string; scope: "documents" }) {
  return api<DocumentWorkbenchSnapshot>("/api/shelf-folders", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function updateShelfFolder(
  id: string,
  input: { collapsed?: boolean; label?: string; position?: number; scope?: "documents" }
) {
  return api<DocumentWorkbenchSnapshot>(`/api/shelf-folders/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}

export async function deleteShelfFolder(id: string) {
  return api<DocumentWorkbenchSnapshot>(`/api/shelf-folders/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function assignShelfFolderItem(input: {
  folder_id: string;
  item_id: string;
  position?: number;
  scope: "documents";
}) {
  return api<DocumentWorkbenchSnapshot>("/api/shelf-folder-items", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function resetWorkbench(domainId?: string | null) {
  const search = new URLSearchParams();

  if (domainId) {
    search.set("domainId", domainId);
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  return api<GraphSnapshot>(`/api/views/workbench/reset${query}`, {
    method: "POST"
  });
}

export async function createItem(input: {
  aliases?: string;
  claim_text?: string | null;
  description?: string;
  domain_filter_id?: string | null;
  domain_id?: string | null;
  item_table: string;
  label: string;
  role?: string;
  type: string;
  source: string | null;
  target_id?: string | null;
  view_id?: string | null;
}) {
  return api<GraphSnapshot>("/api/items", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function updateItem(
  id: string,
  input: {
    aliases?: string;
    claim_text?: string | null;
    description?: string;
    domain_id?: string | null;
    domain_filter_id?: string | null;
    extraction_stage?: string;
    intake_profile?: string;
    label: string;
    last_updated?: string;
    mime_type?: string | null;
    role?: string;
    source?: string | null;
    source_filename?: string | null;
    source_url?: string | null;
    target_id?: string | null;
    type: string;
    view_id?: string | null;
  }
) {
  return api<GraphSnapshot>(`/api/items/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}

export async function deleteItem(id: string, viewId?: string | null, domainId?: string | null) {
  const search = new URLSearchParams();

  if (viewId) {
    search.set("viewId", viewId);
  }

  if (domainId) {
    search.set("domainId", domainId);
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  return api<GraphSnapshot>(`/api/items/${encodeURIComponent(id)}${query}`, {
    method: "DELETE"
  });
}

export async function placeItem(input: {
  domain_filter_id?: string | null;
  item_id: string;
  view_id: string;
  x: number;
  y: number;
}) {
  return api<GraphSnapshot>("/api/view-items", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function saveItemPositions(input: {
  domain_filter_id?: string | null;
  view_id: string;
  updates: { id: string; x: number; y: number }[];
}) {
  return api<GraphSnapshot>("/api/view-items", {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}

export async function removeViewItem(viewItemId: string) {
  return api<GraphSnapshot>(`/api/view-items/${encodeURIComponent(viewItemId)}`, {
    method: "DELETE"
  });
}

export async function createEdge(input: {
  domain_filter_id?: string | null;
  domain_id?: string | null;
  source?: string | null;
  source_id: string;
  target_id: string;
  type: string;
  view_id?: string | null;
}) {
  return api<GraphSnapshot>("/api/edges", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function updateEdge(
  id: string,
  input: {
    domain_id?: string | null;
    domain_filter_id?: string | null;
    source?: string | null;
    source_id?: string | null;
    target_id?: string | null;
    type: string;
    view_id?: string | null;
  }
) {
  return api<GraphSnapshot>(`/api/edges/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}

export async function deleteEdge(id: string, viewId?: string | null, domainId?: string | null) {
  const search = new URLSearchParams();

  if (viewId) {
    search.set("viewId", viewId);
  }

  if (domainId) {
    search.set("domainId", domainId);
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  return api<GraphSnapshot>(`/api/edges/${encodeURIComponent(id)}${query}`, {
    method: "DELETE"
  });
}

export async function removeViewEdge(viewEdgeId: string) {
  return api<GraphSnapshot>(`/api/view-edges/${encodeURIComponent(viewEdgeId)}`, {
    method: "DELETE"
  });
}

export async function placeEdge(input: {
  domain_filter_id?: string | null;
  edge_id: string;
  view_id: string;
}) {
  return api<GraphSnapshot>("/api/view-edges", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function createDomain(input: { label: string; slug?: string | null }) {
  return api<GraphSnapshot>("/api/domains", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function updateDomain(
  id: string,
  input: { description?: string; domain_context_profile?: string; label: string; slug?: string | null }
) {
  return api<GraphSnapshot>(`/api/domains/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}

export async function runDomainContext(
  id: string,
  input: { model?: string; prompt: string; prompt_version_id?: string | null }
) {
  return api<GraphSnapshot>(`/api/domains/${encodeURIComponent(id)}/context/run`, {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function deleteDomain(id: string) {
  return api<GraphSnapshot>(`/api/domains/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function createView(input: {
  copy_from_view_id?: string | null;
  description?: string | null;
  domain_filter_id?: string | null;
  domain_id: string | null;
  label: string;
  placement_edges?: { edge_id: string }[];
  placement_items?: { item_id: string; x: number; y: number }[];
  position_updates?: { id: string; x: number; y: number }[];
}) {
  return api<GraphSnapshot>("/api/views", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function updateView(id: string, input: { description?: string | null; label: string }) {
  return api<GraphSnapshot>(`/api/views/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}

export async function deleteView(id: string) {
  return api<GraphSnapshot>(`/api/views/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...init?.headers
    },
    ...init
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload as T;
}
