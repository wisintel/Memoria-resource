import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import {
  ALL_DOMAINS_ID,
  NO_DOMAIN_ID,
  aliasesFor,
  all,
  db,
  ensureTypeCard,
  get,
  graphSnapshot,
  id,
  now,
  parseJsonArray,
  recordLexicalizations,
  resetWorkspace,
  run,
  slugify,
  subjectLabel
} from "./db.mjs";
import {
  assistantStatus,
  createAssistantThread,
  deleteAssistantThread,
  listAssistantThreads,
  readAssistantThread,
  stopAssistantTurn,
  streamAssistantTurn
} from "./assistant.mjs";
import {
  decodeBase64Upload,
  importDocumentPayload,
  importPdfBufferAsDocument,
  isPdfUpload
} from "./document-intake.mjs";
import {
  admissionSnapshot,
  createOrReadDistillationRun,
  distillationSnapshot,
  readDistillationRun,
  resetDistillationRun,
  resolveAdmissionCandidate,
  resolveAdmissionSubject,
  runDistillationStage
} from "./distillation.mjs";
import { listCodexModels, runDomainContextDistillation } from "./distillation-codex.mjs";
import {
  createPrompt,
  createPromptVersion,
  promptSnapshot,
  setActivePromptVersion
} from "./prompts.mjs";

const port = Number(process.env.PORT ?? 4174);
const serverDir = dirname(fileURLToPath(import.meta.url));
const discoveryReportPath = join(serverDir, "..", "..", "tools", "discovery", "discovery-report.json");

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (!url.pathname.startsWith("/api")) {
      send(response, 404, { error: "Not found" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/graph") {
      send(response, 200, graphSnapshot(url.searchParams.get("viewId"), url.searchParams.get("domainId")));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/codex/models") {
      send(response, 200, await listCodexModels());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/app-context") {
      send(response, 201, recordAppContext(await readJson(request)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/assistant/status") {
      send(response, 200, assistantStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/assistant/threads") {
      send(response, 200, { threads: listAssistantThreads() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assistant/threads") {
      send(response, 201, createAssistantThread(await readJson(request)));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/assistant/threads/")) {
      const threadId = decodeURIComponent(url.pathname.replace("/api/assistant/threads/", ""));
      const thread = readAssistantThread(threadId);

      if (!thread) {
        send(response, 404, { error: "Assistant thread not found." });
        return;
      }

      send(response, 200, thread);
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/assistant/threads/")) {
      const threadId = decodeURIComponent(url.pathname.replace("/api/assistant/threads/", ""));
      send(response, 200, deleteAssistantThread(threadId));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assistant/stop") {
      const body = await readJson(request);
      send(response, 200, stopAssistantTurn(body.thread_id ?? body.threadId ?? null));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assistant/turn") {
      await streamAssistantTurnResponse(response, await readJson(request));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/distillation/snapshot") {
      send(response, 200, distillationSnapshot({
        documentId: url.searchParams.get("documentId"),
        domainId: url.searchParams.get("domainId"),
        runId: url.searchParams.get("runId")
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/distillation/runs") {
      send(response, 201, createOrReadDistillationRun(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/distillation/runs/") && url.pathname.endsWith("/run")) {
      const match = url.pathname.match(/^\/api\/distillation\/runs\/([^/]+)\/stages\/([^/]+)\/run$/);

      if (!match) {
        send(response, 404, { error: "Distillation stage route not found." });
        return;
      }

      send(response, 200, await runDistillationStage(decodeURIComponent(match[1]), decodeURIComponent(match[2])));
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/distillation/runs/") && url.pathname.endsWith("/reset")) {
      const runId = decodeURIComponent(url.pathname.replace("/api/distillation/runs/", "").replace("/reset", ""));
      send(response, 200, resetDistillationRun(runId));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/distillation/runs/")) {
      const runId = decodeURIComponent(url.pathname.replace("/api/distillation/runs/", ""));
      const detail = readDistillationRun(runId);

      if (!detail) {
        send(response, 404, { error: "Distillation run not found." });
        return;
      }

      send(response, 200, detail);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admission/snapshot") {
      send(response, 200, admissionSnapshot({ runId: url.searchParams.get("runId") }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admission/subjects/resolve") {
      send(response, 200, resolveAdmissionSubject(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admission/candidates/resolve") {
      send(response, 200, resolveAdmissionCandidate(await readJson(request)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/documents/workbench") {
      send(response, 200, await documentWorkbenchSnapshot());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/documents/import") {
      send(response, 201, await importDocument(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/documents/import-file") {
      send(response, 201, await importUploadedDocument(await readJson(request)));
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/documents/")) {
      send(response, 200, await deleteDocument(decodeURIComponent(url.pathname.replace("/api/documents/", ""))));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/shelf-folders") {
      send(response, 201, await createShelfFolder(await readJson(request)));
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/shelf-folders/")) {
      const folderId = decodeURIComponent(url.pathname.replace("/api/shelf-folders/", ""));
      send(response, 200, await deleteShelfFolder(folderId));
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/shelf-folders/")) {
      const folderId = decodeURIComponent(url.pathname.replace("/api/shelf-folders/", ""));
      send(response, 200, await updateShelfFolder(folderId, await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/shelf-folder-items") {
      send(response, 200, await assignShelfFolderItem(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/reset") {
      resetWorkspace();
      send(response, 200, graphSnapshot());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/domains") {
      const body = await readJson(request);
      const timestamp = now();
      const label = requiredText(body.label, "Domain name is required.");
      const domainId = id("domain");
      const slug = uniqueDomainSlug(nullableText(body.slug) ?? label);

      db.exec("BEGIN");
      try {
        run(
          `
            INSERT INTO domains (id, slug, label, created, updated)
            VALUES (?, ?, ?, ?, ?)
          `,
          domainId,
          slug,
          label,
          timestamp,
          timestamp
        );
        createDomainView(domainId, slug, timestamp);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      send(response, 201, graphSnapshot(null, domainId));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/types") {
      send(response, 201, createTypeCard(await readJson(request)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/prompts") {
      send(response, 200, promptSnapshot({
        domainId: url.searchParams.get("domainId"),
        toolKey: url.searchParams.get("toolKey")
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/prompts") {
      send(response, 201, createPrompt(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/prompts/") && url.pathname.endsWith("/versions")) {
      const promptId = decodeURIComponent(url.pathname.replace("/api/prompts/", "").replace("/versions", ""));
      send(response, 201, createPromptVersion(promptId, await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/prompt-bindings") {
      send(response, 200, setActivePromptVersion(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/domains/") && url.pathname.endsWith("/context/run")) {
      const domainId = decodeURIComponent(url.pathname.replace("/api/domains/", "").replace("/context/run", ""));
      const body = await readJson(request);
      const timestamp = now();
      const current = get(`SELECT metadata_json FROM domains WHERE id = ?`, domainId);

      if (!current) {
        send(response, 404, { error: "Domain not found." });
        return;
      }

      const result = await runDomainContextDistillation({
        domainId,
        model: nullableText(body.model),
        prompt: requiredText(body.prompt, "Prompt is required.")
      });
      const metadata = parseJsonObject(current.metadata_json);
      metadata.domain_context_last_run = {
        context_summary: result.contextSummary,
        generated_at: timestamp,
        model: result.model,
        profile: result.profile,
        prompt_version_id: nullableText(body.prompt_version_id ?? body.promptVersionId),
        prompt: requiredText(body.prompt, "Prompt is required."),
        raw_output: result.rawOutput,
        status: "completed"
      };

      run(`UPDATE domains SET metadata_json = ?, updated = ? WHERE id = ?`, JSON.stringify(metadata), timestamp, domainId);
      send(response, 200, graphSnapshot(null, domainId));
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/domains/")) {
      const domainId = decodeURIComponent(url.pathname.replace("/api/domains/", ""));
      const body = await readJson(request);
      const timestamp = now();

      if (!get(`SELECT id FROM domains WHERE id = ?`, domainId)) {
        send(response, 404, { error: "Domain not found." });
        return;
      }

      const label = requiredText(body.label, "Domain name is required.");
      const slug = uniqueDomainSlug(nullableText(body.slug) ?? label, domainId);
      const current = get(`SELECT description, metadata_json FROM domains WHERE id = ?`, domainId);
      const description = Object.hasOwn(body, "description") ? textValue(body.description) : current?.description ?? "";
      const metadata = parseJsonObject(current?.metadata_json);

      if (Object.hasOwn(body, "domain_context_profile")) {
        metadata.domain_context_profile = textValue(body.domain_context_profile);
      }

      run(
        `UPDATE domains SET label = ?, slug = ?, description = ?, metadata_json = ?, updated = ? WHERE id = ?`,
        label,
        slug,
        description,
        JSON.stringify(metadata),
        timestamp,
        domainId
      );
      send(response, 200, graphSnapshot(null, domainId));
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/domains/")) {
      const domainId = decodeURIComponent(url.pathname.replace("/api/domains/", ""));

      if (!get(`SELECT id FROM domains WHERE id = ?`, domainId)) {
        send(response, 404, { error: "Domain not found." });
        return;
      }

      if ((get(`SELECT COUNT(*) AS count FROM domains`)?.count ?? 0) <= 1) {
        send(response, 400, { error: "The last domain cannot be deleted." });
        return;
      }

      const memberCount = get(`SELECT COUNT(*) AS count FROM subject_memberships WHERE domain_id = ?`, domainId)?.count ?? 0;
      const documentCount = get(`SELECT COUNT(*) AS count FROM documents WHERE domain_id = ?`, domainId)?.count ?? 0;

      if (memberCount + documentCount > 0) {
        send(response, 400, { error: "Domains with records cannot be deleted." });
        return;
      }

      run(`DELETE FROM views WHERE domain_id = ?`, domainId);
      run(`DELETE FROM domains WHERE id = ?`, domainId);
      send(response, 200, graphSnapshot());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/views") {
      const body = await readJson(request);
      const timestamp = now();
      const domainId = optionalDomainId(body.domain_id);
      const label = requiredText(body.label, "View name is required.");
      const viewId = id("view");

      db.exec("BEGIN");
      try {
        run(
          `
            INSERT INTO views (id, domain_id, slug, label, description, created, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          viewId,
          domainId,
          uniqueViewSlug(label),
          label,
          nullableText(body.description) ?? "",
          timestamp,
          timestamp
        );

        if (nullableText(body.copy_from_view_id)) {
          copyViewContents(body.copy_from_view_id, viewId, timestamp, Array.isArray(body.position_updates) ? body.position_updates : []);
        } else {
          insertViewContents(
            viewId,
            timestamp,
            Array.isArray(body.placement_items) ? body.placement_items : [],
            Array.isArray(body.placement_edges) ? body.placement_edges : []
          );
        }

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      send(response, 201, graphSnapshot(viewId, nullableText(body.domain_filter_id) ?? domainId));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/views/workbench/reset") {
      resetWorkbenchViews(url.searchParams.get("domainId"));
      send(response, 200, graphSnapshot(null, url.searchParams.get("domainId")));
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/views/")) {
      const viewId = decodeURIComponent(url.pathname.replace("/api/views/", ""));
      const body = await readJson(request);
      const timestamp = now();
      const view = get(`SELECT id, domain_id FROM views WHERE id = ?`, viewId);

      if (!view) {
        send(response, 404, { error: "View not found." });
        return;
      }

      const label = requiredText(body.label, "View name is required.");
      run(
        `UPDATE views SET label = ?, slug = ?, description = ?, updated = ? WHERE id = ?`,
        label,
        uniqueViewSlug(label, viewId),
        nullableText(body.description) ?? "",
        timestamp,
        viewId
      );
      send(response, 200, graphSnapshot(viewId, view.domain_id));
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/views/")) {
      const viewId = decodeURIComponent(url.pathname.replace("/api/views/", ""));
      const view = get(`SELECT id, domain_id FROM views WHERE id = ?`, viewId);

      if (!view) {
        send(response, 404, { error: "View not found." });
        return;
      }

      const viewCount = view.domain_id
        ? get(`SELECT COUNT(*) AS count FROM views WHERE domain_id = ?`, view.domain_id)?.count ?? 0
        : get(`SELECT COUNT(*) AS count FROM views WHERE domain_id IS NULL`)?.count ?? 0;

      if (viewCount <= 1) {
        send(response, 400, { error: "The last view cannot be deleted." });
        return;
      }

      run(`DELETE FROM views WHERE id = ?`, viewId);
      send(response, 200, graphSnapshot(null, view.domain_id ?? NO_DOMAIN_ID));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/items") {
      const body = await readJson(request);
      const itemTable = requiredText(body.item_table, "Item class is required.");

      if (itemTable === "claims") {
        send(response, 201, createClaim(body));
        return;
      }

      if (itemTable === "documents") {
        send(response, 201, createManualDocument(body));
        return;
      }

      send(response, 201, createSubject(body));
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/items/")) {
      const itemId = decodeURIComponent(url.pathname.replace("/api/items/", ""));
      const body = await readJson(request);

      if (get(`SELECT id FROM claims WHERE id = ?`, itemId)) {
        send(response, 200, updateClaim(itemId, body));
        return;
      }

      if (get(`SELECT id FROM documents WHERE id = ?`, itemId)) {
        send(response, 200, updateDocument(itemId, body));
        return;
      }

      if (get(`SELECT id FROM subjects WHERE id = ?`, itemId)) {
        send(response, 200, updateSubject(itemId, body));
        return;
      }

      send(response, 404, { error: "Item not found." });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/items/")) {
      deleteGraphItem(decodeURIComponent(url.pathname.replace("/api/items/", "")));
      send(response, 200, graphSnapshot(url.searchParams.get("viewId"), url.searchParams.get("domainId")));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/subjects/merge") {
      send(response, 200, mergeSubjects(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/view-items") {
      const body = await readJson(request);
      const timestamp = now();
      const viewId = requiredText(body.view_id, "View id is required.");
      const itemId = requiredText(body.item_id, "Item id is required.");

      if (!get(`SELECT id FROM subjects WHERE id = ?`, itemId)) {
        send(response, 400, { error: "Only subjects can be placed on graph views." });
        return;
      }

      run(
        `
          INSERT INTO view_subjects (id, view_id, subject_id, position_json, created, updated)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(view_id, subject_id)
          DO UPDATE SET position_json = excluded.position_json, visibility = 'visible', updated = excluded.updated
        `,
        id("view_subject"),
        viewId,
        itemId,
        JSON.stringify({ x: numberValue(body.x, 0), y: numberValue(body.y, 0) }),
        timestamp,
        timestamp
      );
      send(response, 201, graphSnapshot(viewId, nullableText(body.domain_filter_id)));
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/api/view-items") {
      const body = await readJson(request);
      const timestamp = now();

      db.exec("BEGIN");
      try {
        for (const item of Array.isArray(body.updates) ? body.updates : []) {
          run(
            `UPDATE view_subjects SET position_json = ?, updated = ? WHERE id = ?`,
            JSON.stringify({ x: numberValue(item.x, 0), y: numberValue(item.y, 0) }),
            timestamp,
            requiredText(item.id, "View item id is required.")
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      send(response, 200, graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id)));
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/view-items/")) {
      const viewSubjectId = decodeURIComponent(url.pathname.replace("/api/view-items/", ""));
      const viewSubject = get(`SELECT * FROM view_subjects WHERE id = ?`, viewSubjectId);

      if (!viewSubject) {
        send(response, 404, { error: "View item not found." });
        return;
      }

      run(
        `
          DELETE FROM view_relationships
          WHERE view_id = ?
            AND relationship_id IN (
              SELECT id FROM relationships WHERE source_subject_id = ? OR target_subject_id = ?
            )
        `,
        viewSubject.view_id,
        viewSubject.subject_id,
        viewSubject.subject_id
      );
      run(`DELETE FROM view_subjects WHERE id = ?`, viewSubjectId);
      send(response, 200, graphSnapshot(viewSubject.view_id));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/edges") {
      send(response, 201, createRelationship(await readJson(request)));
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/edges/")) {
      const relationshipId = decodeURIComponent(url.pathname.replace("/api/edges/", ""));
      send(response, 200, updateRelationship(relationshipId, await readJson(request)));
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/edges/")) {
      deleteGraphEdge(decodeURIComponent(url.pathname.replace("/api/edges/", "")));
      send(response, 200, graphSnapshot(url.searchParams.get("viewId"), url.searchParams.get("domainId")));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/view-edges") {
      const body = await readJson(request);
      const timestamp = now();
      const viewId = requiredText(body.view_id, "View id is required.");
      const relationshipId = requiredText(body.edge_id, "Edge id is required.");

      run(
        `
          INSERT INTO view_relationships (id, view_id, relationship_id, created, updated)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(view_id, relationship_id)
          DO UPDATE SET visibility = 'visible', updated = excluded.updated
        `,
        id("view_relationship"),
        viewId,
        relationshipId,
        timestamp,
        timestamp
      );
      send(response, 201, graphSnapshot(viewId, nullableText(body.domain_filter_id)));
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/view-edges/")) {
      const viewRelationshipId = decodeURIComponent(url.pathname.replace("/api/view-edges/", ""));
      const viewRelationship = get(`SELECT * FROM view_relationships WHERE id = ?`, viewRelationshipId);

      if (!viewRelationship) {
        send(response, 404, { error: "View edge not found." });
        return;
      }

      run(`DELETE FROM view_relationships WHERE id = ?`, viewRelationshipId);
      send(response, 200, graphSnapshot(viewRelationship.view_id));
      return;
    }

    send(response, 404, { error: "Not found" });
  } catch (error) {
    send(response, errorStatus(error), {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
});

const subjectRoles = new Set(["", "Anchor"]);

server.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://127.0.0.1:5173"
  });
  response.end(JSON.stringify(payload));
}

function errorStatus(error) {
  if (error instanceof Error && error.message === "Relationship already exists.") {
    return 409;
  }

  return 500;
}

async function streamAssistantTurnResponse(response, body) {
  response.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "access-control-allow-origin": "http://127.0.0.1:5173",
    "cache-control": "no-cache",
    "x-accel-buffering": "no"
  });

  const writeEvent = (event) => response.write(`${JSON.stringify(event)}\n`);

  try {
    await streamAssistantTurn(
      {
        input: body.input,
        model: body.model ?? null,
        threadId: body.thread_id ?? body.threadId ?? null
      },
      writeEvent
    );
  } catch (error) {
    writeEvent({
      created: now(),
      id: id("assistant_event"),
      payload: {
        message: error instanceof Error ? error.message : "Assistant turn failed."
      },
      type: "turn.failed"
    });
  } finally {
    response.end();
  }
}

function createSubject(body) {
  const timestamp = now();
  const domainId = optionalDomainId(body.domain_id);
  const subjectId = id("subject");
  const label = requiredText(body.label, "Label is required.");
  const subjectTypeId = ensureTypeCard({ appliesTo: "subject", label: requiredText(body.type, "Type is required.") });
  const metadata = inspectorMetadata(body);

  db.exec("BEGIN");
  try {
    run(
      `
        INSERT INTO subjects (
          id,
          canonical_label,
          subject_type_id,
          role,
          role_type_id,
          description,
          source,
          created,
          updated
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      subjectId,
      label,
      subjectTypeId,
      metadata.role,
      null,
      metadata.description,
      nullableText(body.source),
      timestamp,
      timestamp
    );

    if (domainId) {
      upsertSubjectMembership(subjectId, domainId, timestamp);
    }

    recordLexicalizations({
      domainId,
      targetId: subjectId,
      targetKind: "subject",
      values: parseJsonArray(metadata.aliases)
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? domainId);
}

function updateSubject(subjectId, body) {
  const timestamp = now();
  const subject = get(`SELECT * FROM subjects WHERE id = ?`, subjectId);

  if (!subject) {
    throw new Error("Subject not found.");
  }

  const domainId = Object.hasOwn(body, "domain_id") ? optionalDomainId(body.domain_id) : subjectPrimaryDomain(subjectId);
  const typeLabel = requiredText(body.type, "Type is required.");
  const metadata = inspectorMetadata(body, {
    aliases: aliasesFor("subject", subjectId),
    description: subject.description,
    role: subject.role ?? ""
  });

  db.exec("BEGIN");
  try {
    run(
      `
        UPDATE subjects
        SET canonical_label = ?,
            subject_type_id = ?,
            role = ?,
            role_type_id = NULL,
            description = ?,
            source = ?,
            updated = ?
        WHERE id = ?
      `,
      requiredText(body.label, "Label is required."),
      ensureTypeCard({ appliesTo: "subject", label: typeLabel }),
      metadata.role,
      metadata.description,
      Object.hasOwn(body, "source") ? nullableText(body.source) : subject.source,
      timestamp,
      subjectId
    );

    run(`DELETE FROM subject_memberships WHERE subject_id = ?`, subjectId);

    if (domainId) {
      upsertSubjectMembership(subjectId, domainId, timestamp);
    }

    recordLexicalizations({
      domainId,
      targetId: subjectId,
      targetKind: "subject",
      values: parseJsonArray(metadata.aliases)
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? domainId);
}

function createClaim(body) {
  const timestamp = now();
  const claimId = id("claim");
  const targetId = requiredText(body.target_id, "Claim target is required.");
  const targetKind = get(`SELECT id FROM documents WHERE id = ?`, targetId) ? "document" : "subject";
  const claimTypeId = ensureTypeCard({ appliesTo: "claim", label: requiredText(body.type, "Type is required.") });

  db.exec("BEGIN");
  try {
    run(
      `
        INSERT INTO claims (
          id,
          claim_text,
          claim_type_id,
          assertion_state,
          source,
          created,
          updated
        )
        VALUES (?, ?, ?, 'accepted', ?, ?, ?)
      `,
      claimId,
      requiredText(body.claim_text, "Claim text is required."),
      claimTypeId,
      nullableText(body.source),
      timestamp,
      timestamp
    );
    run(
      `
        INSERT INTO claim_targets (id, claim_id, target_kind, target_id, created, updated)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      id("claim_target"),
      claimId,
      targetKind,
      targetId,
      timestamp,
      timestamp
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? subjectPrimaryDomain(targetId));
}

function updateClaim(claimId, body) {
  const timestamp = now();
  const claim = get(`SELECT * FROM claims WHERE id = ?`, claimId);

  if (!claim) {
    throw new Error("Claim not found.");
  }

  const targetId = nullableText(body.target_id) ?? primaryClaimTarget(claimId)?.target_id;
  const targetKind = get(`SELECT id FROM documents WHERE id = ?`, targetId) ? "document" : "subject";

  db.exec("BEGIN");
  try {
    run(
      `
        UPDATE claims
        SET claim_text = ?,
            claim_type_id = ?,
            source = ?,
            updated = ?
        WHERE id = ?
      `,
      nullableText(body.claim_text) ?? claim.claim_text,
      ensureTypeCard({ appliesTo: "claim", label: requiredText(body.type, "Type is required.") }),
      Object.hasOwn(body, "source") ? nullableText(body.source) : claim.source,
      timestamp,
      claimId
    );

    if (targetId) {
      run(`DELETE FROM claim_targets WHERE claim_id = ? AND target_role = 'about'`, claimId);
      run(
        `
          INSERT INTO claim_targets (id, claim_id, target_kind, target_id, created, updated)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        id("claim_target"),
        claimId,
        targetKind,
        targetId,
        timestamp,
        timestamp
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? subjectPrimaryDomain(targetId));
}

function createManualDocument(body) {
  const timestamp = now();
  const documentId = id("document");
  const domainId = optionalDomainId(body.domain_id);
  const documentTypeId = ensureTypeCard({ appliesTo: "document", label: "Source", slug: "source" });

  run(
    `
      INSERT INTO documents (
        id,
        domain_id,
        label,
        document_type_id,
        description,
        source,
        created,
        updated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    documentId,
      domainId,
      requiredText(body.label, "Label is required."),
      documentTypeId,
    textValue(body.description),
    nullableText(body.source),
    timestamp,
    timestamp
  );

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? domainId);
}

function updateDocument(documentId, body) {
  const timestamp = now();
  const document = get(`SELECT * FROM documents WHERE id = ?`, documentId);

  if (!document) {
    throw new Error("Document not found.");
  }

  const domainId = Object.hasOwn(body, "domain_id") ? optionalDomainId(body.domain_id) : document.domain_id;
  const metadata = inspectorMetadata(body, {
    aliases: aliasesFor("document", documentId),
    description: document.description,
    extraction_stage: document.extraction_stage,
    intake_profile: document.intake_profile
  });

  db.exec("BEGIN");
  try {
    run(
      `
        UPDATE documents
        SET domain_id = ?,
            label = ?,
            document_type_id = ?,
            description = ?,
            intake_profile = ?,
            extraction_stage = ?,
            source_filename = ?,
            source_url = ?,
            mime_type = ?,
            source = ?,
            updated = ?
        WHERE id = ?
      `,
      domainId,
      requiredText(body.label, "Label is required."),
      ensureTypeCard({ appliesTo: "document", label: "Source", slug: "source" }),
      metadata.description,
      metadata.intakeProfile,
      metadata.extractionStage,
      Object.hasOwn(body, "source_filename") ? nullableText(body.source_filename) : document.source_filename,
      Object.hasOwn(body, "source_url") ? nullableText(body.source_url) : document.source_url,
      Object.hasOwn(body, "mime_type") ? nullableText(body.mime_type) : document.mime_type,
      Object.hasOwn(body, "source") ? nullableText(body.source) : document.source,
      timestamp,
      documentId
    );
    recordLexicalizations({
      domainId,
      targetId: documentId,
      targetKind: "document",
      values: parseJsonArray(metadata.aliases)
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? domainId);
}

function createRelationship(body) {
  const timestamp = now();
  const sourceId = requiredText(body.source_id, "Source subject id is required.");
  const targetId = requiredText(body.target_id, "Target subject id is required.");
  const type = requiredText(body.type, "Edge type is required.");

  if (!get(`SELECT id FROM subjects WHERE id = ?`, sourceId) || !get(`SELECT id FROM subjects WHERE id = ?`, targetId)) {
    throw new Error("Relationship endpoints must be subjects.");
  }

  const requestedDomainId = nullableText(body.domain_id);
  const domainId =
    requestedDomainId && requestedDomainId !== ALL_DOMAINS_ID && requestedDomainId !== NO_DOMAIN_ID
      ? optionalDomainId(requestedDomainId)
      : relationshipDomain(sourceId, targetId);
  const relationshipTypeId = ensureTypeCard({ appliesTo: "relationship", label: type });
  const label = relationshipLabel(sourceId, type, targetId);
  const existingRelationship = get(
    `
      SELECT id
      FROM relationships
      WHERE source_subject_id = ?
        AND target_subject_id = ?
        AND relationship_type_id = ?
        AND COALESCE(domain_id, '') = COALESCE(?, '')
      ORDER BY created ASC
      LIMIT 1
    `,
    sourceId,
    targetId,
    relationshipTypeId,
    domainId
  );

  if (existingRelationship) {
    throw new Error("Relationship already exists.");
  }

  db.exec("BEGIN");
  try {
    const relationshipId = id("relationship");

    run(
      `
        INSERT INTO relationships (
          id,
          domain_id,
          source_subject_id,
          target_subject_id,
          relationship_type_id,
          label,
          source,
          created,
          updated
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      relationshipId,
      domainId,
      sourceId,
      targetId,
      relationshipTypeId,
      label,
      nullableText(body.source),
      timestamp,
      timestamp
    );

    if (nullableText(body.view_id)) {
      const existingViewRelationship = get(
        `SELECT id FROM view_relationships WHERE view_id = ? AND relationship_id = ?`,
        body.view_id,
        relationshipId
      );

      if (!existingViewRelationship) {
        run(
          `
            INSERT INTO view_relationships (id, view_id, relationship_id, created, updated)
            VALUES (?, ?, ?, ?, ?)
          `,
          id("view_relationship"),
          body.view_id,
          relationshipId,
          timestamp,
          timestamp
        );
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? domainId);
}

function updateRelationship(relationshipId, body) {
  const timestamp = now();
  const relationship = get(`SELECT * FROM relationships WHERE id = ?`, relationshipId);

  if (!relationship) {
    throw new Error("Relationship not found.");
  }

  const sourceId = nullableText(body.source_id) ?? relationship.source_subject_id;
  const targetId = nullableText(body.target_id) ?? relationship.target_subject_id;
  const type = requiredText(body.type, "Edge type is required.");
  const domainId = Object.hasOwn(body, "domain_id") ? optionalDomainId(body.domain_id) : relationship.domain_id;
  const relationshipTypeId = ensureTypeCard({ appliesTo: "relationship", label: type });
  const duplicateRelationship = get(
    `
      SELECT id
      FROM relationships
      WHERE id != ?
        AND source_subject_id = ?
        AND target_subject_id = ?
        AND relationship_type_id = ?
        AND COALESCE(domain_id, '') = COALESCE(?, '')
      ORDER BY created ASC
      LIMIT 1
    `,
    relationshipId,
    sourceId,
    targetId,
    relationshipTypeId,
    domainId
  );

  if (duplicateRelationship) {
    throw new Error("Relationship already exists.");
  }

  run(
    `
      UPDATE relationships
      SET domain_id = ?,
          source_subject_id = ?,
          target_subject_id = ?,
          relationship_type_id = ?,
          relationship_kind_id = NULL,
          label = ?,
          source = ?,
          updated = ?
      WHERE id = ?
    `,
    domainId,
    sourceId,
    targetId,
    relationshipTypeId,
    relationshipLabel(sourceId, type, targetId),
    Object.hasOwn(body, "source") ? nullableText(body.source) : relationship.source,
    timestamp,
    relationshipId
  );

  return graphSnapshot(nullableText(body.view_id), nullableText(body.domain_filter_id) ?? domainId);
}

function createTypeCard(body) {
  const appliesTo = requiredTypeCardScope(body.applies_to ?? body.appliesTo);
  const label = requiredText(body.label, "Type label is required.");
  const scopeDomainId = nullableText(body.scope_domain_id ?? body.scopeDomainId);
  const parentTypeId = nullableText(body.parent_type_id ?? body.parentTypeId);
  const description = nullableText(body.description);

  if (scopeDomainId && !get(`SELECT id FROM domains WHERE id = ?`, scopeDomainId)) {
    throw new Error("Scope domain not found.");
  }

  if (parentTypeId && !get(`SELECT id FROM type_cards WHERE id = ?`, parentTypeId)) {
    throw new Error("Parent type not found.");
  }

  const timestamp = now();
  const typeId = ensureTypeCard({
    appliesTo,
    label,
    scopeDomainId,
    slug: nullableText(body.slug)
  });

  if (description || parentTypeId) {
    run(
      `
        UPDATE type_cards
        SET description = COALESCE(?, description),
            parent_type_id = COALESCE(?, parent_type_id),
            updated = ?
        WHERE id = ?
      `,
      description,
      parentTypeId,
      timestamp,
      typeId
    );
  }

  return get(
    `
      SELECT
        id,
        scope_domain_id,
        applies_to,
        slug,
        label,
        parent_type_id,
        description,
        status,
        created,
        updated
      FROM type_cards
      WHERE id = ?
    `,
    typeId
  );
}

function recordAppContext(context) {
  const timestamp = now();
  run(
    `
      INSERT INTO app_context_snapshots (id, context_json, created)
      VALUES (?, ?, ?)
    `,
    id("app_context"),
    JSON.stringify(context ?? {}),
    timestamp
  );
  run(
    `
      DELETE FROM app_context_snapshots
      WHERE id NOT IN (
        SELECT id
        FROM app_context_snapshots
        ORDER BY created DESC
        LIMIT 25
      )
    `
  );

  return { recorded: true, created: timestamp };
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

function requiredTypeCardScope(value) {
  const appliesTo = requiredText(value, "Type scope is required.");
  const allowedScopes = new Set([
    "claim",
    "claim_kind",
    "claim_type",
    "document",
    "document_type",
    "domain_type",
    "evidence_kind",
    "lexicalization_type",
    "relationship",
    "relationship_kind",
    "relationship_type",
    "subject",
    "subject_role",
    "view_kind"
  ]);

  if (!allowedScopes.has(appliesTo)) {
    throw new Error("Unsupported type scope.");
  }

  return appliesTo;
}

function numberValue(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function textValue(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function jsonListValue(value) {
  if (typeof value !== "string") {
    return "[]";
  }

  const text = value.trim();

  if (!text) {
    return "[]";
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()));
    }
  } catch {
    // Fall through to plain text splitting.
  }

  return JSON.stringify(
    text
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function inspectorMetadata(body, current = {}) {
  return {
    aliases: Object.hasOwn(body, "aliases") ? jsonListValue(body.aliases) : current.aliases ?? "[]",
    description: Object.hasOwn(body, "description") ? textValue(body.description) : current.description ?? "",
    intakeProfile: Object.hasOwn(body, "intake_profile") ? textValue(body.intake_profile) : current.intake_profile ?? "",
    extractionStage: Object.hasOwn(body, "extraction_stage") ? textValue(body.extraction_stage) : current.extraction_stage ?? "not_started",
    role: Object.hasOwn(body, "role") ? subjectRoleValue(body.role) : current.role ?? ""
  };
}

function subjectRoleValue(value) {
  const role = textValue(value);

  if (!subjectRoles.has(role)) {
    throw new Error("Subject role must be Anchor or empty.");
  }

  return role;
}

function deleteGraphItem(itemId) {
  if (get(`SELECT id FROM claims WHERE id = ?`, itemId)) {
    run(`DELETE FROM claims WHERE id = ?`, itemId);
    return;
  }

  if (get(`SELECT id FROM documents WHERE id = ?`, itemId)) {
    run(`DELETE FROM documents WHERE id = ?`, itemId);
    return;
  }

  if (!get(`SELECT id FROM subjects WHERE id = ?`, itemId)) {
    throw new Error("Item not found.");
  }

  db.exec("BEGIN");
  try {
    const relatedClaims = all(
      `
        SELECT claim_id
        FROM claim_targets
        WHERE target_kind = 'subject'
          AND target_id = ?
      `,
      itemId
    );

    for (const claim of relatedClaims) {
      run(`DELETE FROM claims WHERE id = ?`, claim.claim_id);
    }

    run(`DELETE FROM relationships WHERE source_subject_id = ? OR target_subject_id = ?`, itemId, itemId);
    run(`DELETE FROM subjects WHERE id = ?`, itemId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function mergeSubjects(body) {
  const sourceId = requiredText(body.source_id ?? body.sourceId, "Source subject id is required.");
  const targetId = requiredText(body.target_id ?? body.targetId, "Target subject id is required.");
  const dryRun = body.dry_run === true || body.dryRun === true;
  const viewId = nullableText(body.view_id ?? body.viewId);
  const domainFilterId = nullableText(body.domain_filter_id ?? body.domainFilterId);
  const timestamp = now();

  if (sourceId === targetId) {
    throw new Error("Source and target subjects must be different.");
  }

  const source = get(`SELECT * FROM subjects WHERE id = ?`, sourceId);
  const target = get(`SELECT * FROM subjects WHERE id = ?`, targetId);

  if (!source) {
    throw new Error("Source subject not found.");
  }

  if (!target) {
    throw new Error("Target subject not found.");
  }

  const summary = subjectMergeSummary(sourceId, targetId);

  if (dryRun) {
    return {
      dry_run: true,
      source: subjectMergeLabel(source),
      summary,
      target: subjectMergeLabel(target)
    };
  }

  db.exec("BEGIN");
  try {
    transferSubjectMemberships(sourceId, targetId, timestamp);
    transferSubjectLexicalizations(source, target, timestamp);
    transferSubjectClaimTargets(sourceId, targetId, timestamp);
    transferSubjectEvidenceLinks(sourceId, targetId, timestamp);
    transferSubjectViewPlacements(sourceId, targetId, timestamp);
    transferSubjectShelfPlacements(sourceId, targetId, timestamp);
    transferSubjectRelationships(sourceId, targetId, timestamp);
    recordSubjectMergeMetadata(source, target, timestamp, body.reason);
    run(`DELETE FROM subjects WHERE id = ?`, sourceId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    dry_run: false,
    graph: graphSnapshot(viewId, domainFilterId ?? subjectPrimaryDomain(targetId)),
    source: subjectMergeLabel(source),
    summary,
    target: subjectMergeLabel(target)
  };
}

function subjectMergeSummary(sourceId, targetId) {
  return {
    claim_targets_to_transfer: get(
      `SELECT COUNT(*) AS count FROM claim_targets WHERE target_kind = 'subject' AND target_id = ?`,
      sourceId
    )?.count ?? 0,
    evidence_links_to_transfer: get(
      `SELECT COUNT(*) AS count FROM evidence_links WHERE target_kind = 'subject' AND target_id = ?`,
      sourceId
    )?.count ?? 0,
    incoming_relationships_to_redirect: get(
      `SELECT COUNT(*) AS count FROM relationships WHERE target_subject_id = ? AND source_subject_id != ?`,
      sourceId,
      targetId
    )?.count ?? 0,
    outgoing_relationships_to_redirect: get(
      `SELECT COUNT(*) AS count FROM relationships WHERE source_subject_id = ? AND target_subject_id != ?`,
      sourceId,
      targetId
    )?.count ?? 0,
    self_loop_relationships_to_remove: get(
      `
        SELECT COUNT(*) AS count
        FROM relationships
        WHERE (source_subject_id = ? AND target_subject_id = ?)
           OR (source_subject_id = ? AND target_subject_id = ?)
      `,
      sourceId,
      targetId,
      targetId,
      sourceId
    )?.count ?? 0,
    source_aliases_to_transfer: get(
      `SELECT COUNT(*) AS count FROM lexicalizations WHERE target_kind = 'subject' AND target_id = ?`,
      sourceId
    )?.count ?? 0,
    source_domain_memberships_to_transfer: get(
      `SELECT COUNT(*) AS count FROM subject_memberships WHERE subject_id = ?`,
      sourceId
    )?.count ?? 0,
    source_view_placements_to_transfer: get(
      `SELECT COUNT(*) AS count FROM view_subjects WHERE subject_id = ?`,
      sourceId
    )?.count ?? 0,
    target_existing_claim_targets: get(
      `SELECT COUNT(*) AS count FROM claim_targets WHERE target_kind = 'subject' AND target_id = ?`,
      targetId
    )?.count ?? 0,
    target_existing_relationships: get(
      `SELECT COUNT(*) AS count FROM relationships WHERE source_subject_id = ? OR target_subject_id = ?`,
      targetId,
      targetId
    )?.count ?? 0
  };
}

function transferSubjectMemberships(sourceId, targetId, timestamp) {
  run(
    `
      INSERT INTO subject_memberships (subject_id, domain_id, membership_status, source, created, updated)
      SELECT ?, domain_id, membership_status, source, created, ?
      FROM subject_memberships
      WHERE subject_id = ?
      ON CONFLICT(subject_id, domain_id)
      DO UPDATE SET membership_status = 'accepted', updated = excluded.updated
    `,
    targetId,
    timestamp,
    sourceId
  );
  run(`DELETE FROM subject_memberships WHERE subject_id = ?`, sourceId);
}

function transferSubjectLexicalizations(source, target, timestamp) {
  const sourceId = source.id;
  const targetId = target.id;
  const sourceLabel = source.canonical_label;
  const normalizedSourceLabel = slugify(sourceLabel);
  const normalizedTargetLabel = slugify(target.canonical_label);

  if (normalizedSourceLabel && normalizedSourceLabel !== normalizedTargetLabel) {
    run(
      `
        INSERT INTO lexicalizations (
          id, target_kind, target_id, lexical_type, value, normalized_value,
          language, domain_id, source_document_id, status, metadata_json, created, updated
        )
        VALUES (?, 'subject', ?, 'former_label', ?, ?, 'en', ?, NULL, 'active', ?, ?, ?)
      `,
      id("lexicalization"),
      targetId,
      sourceLabel,
      normalizedSourceLabel,
      subjectPrimaryDomain(targetId),
      JSON.stringify({ merged_from_subject_id: sourceId }),
      timestamp,
      timestamp
    );
  }

  run(
    `
      UPDATE lexicalizations
      SET target_id = ?, updated = ?
      WHERE target_kind = 'subject'
        AND target_id = ?
    `,
    targetId,
    timestamp,
    sourceId
  );
}

function transferSubjectClaimTargets(sourceId, targetId, timestamp) {
  run(
    `
      DELETE FROM claim_targets
      WHERE target_kind = 'subject'
        AND target_id = ?
        AND EXISTS (
          SELECT 1
          FROM claim_targets AS target_match
          WHERE target_match.claim_id = claim_targets.claim_id
            AND target_match.target_kind = 'subject'
            AND target_match.target_id = ?
            AND target_match.target_role = claim_targets.target_role
        )
    `,
    sourceId,
    targetId
  );
  run(
    `
      UPDATE claim_targets
      SET target_id = ?, updated = ?
      WHERE target_kind = 'subject'
        AND target_id = ?
    `,
    targetId,
    timestamp,
    sourceId
  );
}

function transferSubjectEvidenceLinks(sourceId, targetId, timestamp) {
  run(
    `
      DELETE FROM evidence_links
      WHERE target_kind = 'subject'
        AND target_id = ?
        AND EXISTS (
          SELECT 1
          FROM evidence_links AS target_match
          WHERE target_match.evidence_id = evidence_links.evidence_id
            AND target_match.target_kind = 'subject'
            AND target_match.target_id = ?
            AND target_match.link_role = evidence_links.link_role
        )
    `,
    sourceId,
    targetId
  );
  run(
    `
      UPDATE evidence_links
      SET target_id = ?, updated = ?
      WHERE target_kind = 'subject'
        AND target_id = ?
    `,
    targetId,
    timestamp,
    sourceId
  );
}

function transferSubjectViewPlacements(sourceId, targetId, timestamp) {
  run(
    `
      DELETE FROM view_subjects
      WHERE subject_id = ?
        AND EXISTS (
          SELECT 1
          FROM view_subjects AS target_match
          WHERE target_match.view_id = view_subjects.view_id
            AND target_match.subject_id = ?
        )
    `,
    sourceId,
    targetId
  );
  run(
    `
      UPDATE view_subjects
      SET subject_id = ?, updated = ?
      WHERE subject_id = ?
    `,
    targetId,
    timestamp,
    sourceId
  );
}

function transferSubjectShelfPlacements(sourceId, targetId, timestamp) {
  run(
    `
      DELETE FROM shelf_folder_items
      WHERE item_id = ?
        AND EXISTS (
          SELECT 1
          FROM shelf_folder_items AS target_match
          WHERE target_match.folder_id = shelf_folder_items.folder_id
            AND target_match.item_id = ?
        )
    `,
    sourceId,
    targetId
  );
  run(
    `
      UPDATE shelf_folder_items
      SET item_id = ?, updated = ?
      WHERE item_id = ?
    `,
    targetId,
    timestamp,
    sourceId
  );
}

function transferSubjectRelationships(sourceId, targetId, timestamp) {
  run(
    `
      DELETE FROM relationships
      WHERE (source_subject_id = ? AND target_subject_id = ?)
         OR (source_subject_id = ? AND target_subject_id = ?)
    `,
    sourceId,
    targetId,
    targetId,
    sourceId
  );
  run(
    `
      UPDATE relationships
      SET source_subject_id = ?, updated = ?
      WHERE source_subject_id = ?
    `,
    targetId,
    timestamp,
    sourceId
  );
  run(
    `
      UPDATE relationships
      SET target_subject_id = ?, updated = ?
      WHERE target_subject_id = ?
    `,
    targetId,
    timestamp,
    sourceId
  );
  run(
    `
      DELETE FROM relationships
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY
                COALESCE(domain_id, ''),
                source_subject_id,
                target_subject_id,
                COALESCE(relationship_type_id, ''),
                COALESCE(relationship_kind_id, ''),
                label
              ORDER BY created ASC, id ASC
            ) AS duplicate_rank
          FROM relationships
        )
        WHERE duplicate_rank > 1
      )
    `
  );
}

function recordSubjectMergeMetadata(source, target, timestamp, reason) {
  const metadata = parseJsonObject(target.metadata_json);
  const mergedSubjects = Array.isArray(metadata.merged_subjects) ? metadata.merged_subjects : [];
  mergedSubjects.push({
    id: source.id,
    label: source.canonical_label,
    merged_at: timestamp,
    reason: nullableText(reason)
  });

  run(
    `
      UPDATE subjects
      SET metadata_json = ?, updated = ?
      WHERE id = ?
    `,
    JSON.stringify({ ...metadata, merged_subjects: mergedSubjects }),
    timestamp,
    target.id
  );
}

function subjectMergeLabel(subject) {
  return {
    id: subject.id,
    label: subject.canonical_label
  };
}

function deleteGraphEdge(relationshipId) {
  if (!get(`SELECT id FROM relationships WHERE id = ?`, relationshipId)) {
    throw new Error("Relationship not found.");
  }

  run(`DELETE FROM relationships WHERE id = ?`, relationshipId);
}

async function deleteDocument(documentId) {
  if (!get(`SELECT id FROM documents WHERE id = ?`, documentId)) {
    throw new Error("Document not found.");
  }

  run(`DELETE FROM documents WHERE id = ?`, documentId);
  return documentWorkbenchSnapshot();
}

async function importDocument(body) {
  const result = await importDocumentPayload(body);

  return {
    ...(await documentWorkbenchSnapshot()),
    ...result
  };
}

async function importUploadedDocument(body) {
  if (!isPdfUpload(body)) {
    return importDocument({
      ...body,
      content: decodeBase64Upload(body).toString("utf8")
    });
  }

  const result = await importPdfBufferAsDocument({
    buffer: decodeBase64Upload(body),
    domain_id: body.domain_id,
    label: body.label,
    mime_type: body.mime_type,
    source_filename: body.source_filename
  });

  return {
    ...(await documentWorkbenchSnapshot()),
    ...result
  };
}

async function createShelfFolder(body) {
  const scope = requiredShelfScope(body.scope);
  const label = requiredText(body.label, "Folder name is required.");
  const timestamp = now();
  const nextPosition =
    get(`SELECT COALESCE(MAX(position), -1) + 1 AS position FROM shelf_folders WHERE scope = ?`, scope)?.position ?? 0;

  run(
    `
      INSERT INTO shelf_folders (id, scope, label, position, collapsed, created, updated)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `,
    id("shelf_folder"),
    scope,
    label,
    nextPosition,
    timestamp,
    timestamp
  );

  return documentWorkbenchSnapshot();
}

async function updateShelfFolder(folderId, body) {
  const folder = get(`SELECT id, scope, label, position, collapsed FROM shelf_folders WHERE id = ?`, folderId);

  if (!folder) {
    throw new Error("Folder not found.");
  }

  const scope = requiredShelfScope(body.scope ?? folder.scope);
  const label = nullableText(body.label) ?? folder.label;
  const position = Number.isFinite(Number(body.position)) ? Number(body.position) : folder.position;
  const collapsed = typeof body.collapsed === "boolean" ? (body.collapsed ? 1 : 0) : Number(folder.collapsed) === 1 ? 1 : 0;
  const timestamp = now();

  run(
    `
      UPDATE shelf_folders
      SET scope = ?, label = ?, position = ?, collapsed = ?, updated = ?
      WHERE id = ?
    `,
    scope,
    label,
    position,
    collapsed,
    timestamp,
    folderId
  );

  return documentWorkbenchSnapshot();
}

async function deleteShelfFolder(folderId) {
  const folder = get(`SELECT id FROM shelf_folders WHERE id = ?`, folderId);

  if (!folder) {
    throw new Error("Folder not found.");
  }

  run(`DELETE FROM shelf_folders WHERE id = ?`, folderId);

  return documentWorkbenchSnapshot();
}

async function assignShelfFolderItem(body) {
  const scope = requiredShelfScope(body.scope);
  const folderId = requiredText(body.folder_id, "Folder is required.");
  const itemId = requiredText(body.item_id, "Document is required.");
  const folder = get(`SELECT id FROM shelf_folders WHERE id = ? AND scope = ?`, folderId, scope);
  const document = get(`SELECT id FROM documents WHERE id = ?`, itemId);

  if (!folder) {
    throw new Error("Folder not found.");
  }

  if (!document) {
    throw new Error("Document not found.");
  }

  const timestamp = now();
  const nextPosition = Number.isFinite(Number(body.position))
    ? Number(body.position)
    : get(`SELECT COALESCE(MAX(position), -1) + 1 AS position FROM shelf_folder_items WHERE folder_id = ?`, folderId)?.position ?? 0;

  db.exec("BEGIN");
  try {
    run(`DELETE FROM shelf_folder_items WHERE item_id = ?`, itemId);
    run(
      `
        INSERT INTO shelf_folder_items (folder_id, item_id, position, created, updated)
        VALUES (?, ?, ?, ?, ?)
      `,
      folderId,
      itemId,
      nextPosition,
      timestamp,
      timestamp
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return documentWorkbenchSnapshot();
}

function requiredShelfScope(value) {
  const scope = requiredText(value, "Shelf scope is required.");

  if (scope !== "documents") {
    throw new Error("Unsupported shelf scope.");
  }

  return scope;
}

function createDomainView(domainId, domainSlug, timestamp) {
  run(
    `
      INSERT INTO views (id, domain_id, slug, label, description, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    id("view"),
    domainId,
    uniqueViewSlug(`${domainSlug}-workbench`),
    "Workbench",
    "Default graph editing view.",
    timestamp,
    timestamp
  );
}

function copyViewContents(sourceViewId, targetViewId, timestamp, positionUpdates) {
  if (!get(`SELECT id FROM views WHERE id = ?`, sourceViewId)) {
    throw new Error("Source view not found.");
  }

  const positions = new Map(
    positionUpdates
      .filter((item) => nullableText(item.id))
      .map((item) => [item.id, { x: numberValue(item.x, 0), y: numberValue(item.y, 0) }])
  );
  const sourceItems = all(`SELECT id, subject_id, position_json, visibility FROM view_subjects WHERE view_id = ? ORDER BY created ASC`, sourceViewId);
  const sourceEdges = all(`SELECT relationship_id, visibility FROM view_relationships WHERE view_id = ? ORDER BY created ASC`, sourceViewId);

  for (const item of sourceItems) {
    const savedPosition = parseJsonObject(item.position_json);
    const position = positions.get(item.id) ?? savedPosition;
    run(
      `
        INSERT INTO view_subjects (id, view_id, subject_id, position_json, visibility, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      id("view_subject"),
      targetViewId,
      item.subject_id,
      JSON.stringify({ x: numberValue(position.x, 0), y: numberValue(position.y, 0) }),
      item.visibility,
      timestamp,
      timestamp
    );
  }

  for (const edge of sourceEdges) {
    run(
      `
        INSERT INTO view_relationships (id, view_id, relationship_id, visibility, created, updated)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      id("view_relationship"),
      targetViewId,
      edge.relationship_id,
      edge.visibility,
      timestamp,
      timestamp
    );
  }
}

function insertViewContents(targetViewId, timestamp, placementItems, placementEdges) {
  for (const item of placementItems) {
    const subjectId = requiredText(item.item_id, "Subject is required.");

    if (!get(`SELECT id FROM subjects WHERE id = ?`, subjectId)) {
      continue;
    }

    run(
      `
        INSERT INTO view_subjects (id, view_id, subject_id, position_json, visibility, created, updated)
        VALUES (?, ?, ?, ?, 'visible', ?, ?)
        ON CONFLICT(view_id, subject_id)
        DO UPDATE SET position_json = excluded.position_json, visibility = 'visible', updated = excluded.updated
      `,
      id("view_subject"),
      targetViewId,
      subjectId,
      JSON.stringify({ x: numberValue(item.x, 0), y: numberValue(item.y, 0) }),
      timestamp,
      timestamp
    );
  }

  for (const edge of placementEdges) {
    const relationshipId = requiredText(edge.edge_id, "Relationship is required.");

    if (!get(`SELECT id FROM relationships WHERE id = ?`, relationshipId)) {
      continue;
    }

    run(
      `
        INSERT INTO view_relationships (id, view_id, relationship_id, visibility, created, updated)
        VALUES (?, ?, ?, 'visible', ?, ?)
        ON CONFLICT(view_id, relationship_id)
        DO UPDATE SET visibility = 'visible', updated = excluded.updated
      `,
      id("view_relationship"),
      targetViewId,
      relationshipId,
      timestamp,
      timestamp
    );
  }
}

function optionalDomainId(value) {
  const domainId = nullableText(value);

  if (!domainId || domainId === ALL_DOMAINS_ID || domainId === NO_DOMAIN_ID) {
    return null;
  }

  if (!get(`SELECT id FROM domains WHERE id = ?`, domainId)) {
    throw new Error("Domain not found.");
  }

  return domainId;
}

function resetWorkbenchViews(domainIdValue) {
  const requestedDomainId = nullableText(domainIdValue);
  const workbenchViews =
    requestedDomainId === ALL_DOMAINS_ID
      ? all(`SELECT id FROM views WHERE LOWER(label) = 'workbench'`)
      : requestedDomainId && requestedDomainId !== NO_DOMAIN_ID
      ? all(`SELECT id FROM views WHERE LOWER(label) = 'workbench' AND domain_id = ?`, optionalDomainId(requestedDomainId))
      : all(`SELECT id FROM views WHERE LOWER(label) = 'workbench' AND domain_id IS NULL`);

  db.exec("BEGIN");
  try {
    for (const view of workbenchViews) {
      run(`DELETE FROM view_relationships WHERE view_id = ?`, view.id);
      run(`DELETE FROM view_subjects WHERE view_id = ?`, view.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function uniqueDomainSlug(value, excludingDomainId = null) {
  return uniqueSlug("domains", "id", value, excludingDomainId);
}

function uniqueViewSlug(value, excludingViewId = null) {
  return uniqueSlug("views", "id", value, excludingViewId);
}

function uniqueSlug(tableName, idColumn, value, excludingId = null) {
  const baseSlug = slugify(value);
  let slug = baseSlug;
  let index = 2;

  while (slugExists(tableName, idColumn, slug, excludingId)) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }

  return slug;
}

function slugExists(tableName, idColumn, slug, excludingId) {
  const row = excludingId
    ? get(`SELECT ${idColumn} FROM ${tableName} WHERE slug = ? AND ${idColumn} != ?`, slug, excludingId)
    : get(`SELECT ${idColumn} FROM ${tableName} WHERE slug = ?`, slug);

  return Boolean(row);
}

function upsertSubjectMembership(subjectId, domainId, timestamp) {
  run(
    `
      INSERT INTO subject_memberships (subject_id, domain_id, created, updated)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(subject_id, domain_id)
      DO UPDATE SET membership_status = 'accepted', updated = excluded.updated
    `,
    subjectId,
    domainId,
    timestamp,
    timestamp
  );
}

function subjectPrimaryDomain(subjectId) {
  return get(
    `
      SELECT domain_id
      FROM subject_memberships
      WHERE subject_id = ?
        AND membership_status != 'rejected'
      ORDER BY created ASC
      LIMIT 1
    `,
    subjectId
  )?.domain_id ?? null;
}

function primaryClaimTarget(claimId) {
  return get(
    `
      SELECT target_kind, target_id
      FROM claim_targets
      WHERE claim_id = ?
        AND target_role = 'about'
      ORDER BY position ASC, created ASC
      LIMIT 1
    `,
    claimId
  );
}

function relationshipDomain(sourceId, targetId) {
  const sourceDomain = subjectPrimaryDomain(sourceId);
  const targetDomain = subjectPrimaryDomain(targetId);

  if (sourceDomain && sourceDomain === targetDomain) {
    return sourceDomain;
  }

  return sourceDomain ?? targetDomain ?? null;
}

function relationshipLabel(sourceId, type, targetId) {
  const source = subjectLabel(sourceId);
  const target = subjectLabel(targetId);

  if (!source || !target) {
    throw new Error("Relationship endpoints must exist.");
  }

  return `${source}-${type}-${target}`;
}

async function documentWorkbenchSnapshot() {
  const documents = all(`
    SELECT
      documents.id,
      documents.domain_id,
      documents.label,
      COALESCE(type_cards.label, documents.source_type) AS type,
      documents.source_type,
      documents.status,
      documents.extraction_stage,
      documents.description,
      ${aliasesSubquery("'document'", "documents.id")} AS aliases,
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
    ORDER BY documents.updated DESC, documents.label ASC
  `);
  const shards = all(`
    SELECT
      id,
      document_id,
      position,
      heading_path_json AS heading_path,
      body,
      size_bytes,
      created,
      updated
    FROM source_units
    ORDER BY document_id ASC, position ASC
  `).map((shard) => ({
    ...shard,
    heading_path: parseJsonArray(shard.heading_path)
  }));
  const shardsByDocumentId = Object.fromEntries(documents.map((document) => [document.id, []]));

  for (const shard of shards) {
    if (!shardsByDocumentId[shard.document_id]) {
      shardsByDocumentId[shard.document_id] = [];
    }

    shardsByDocumentId[shard.document_id].push(shard);
  }

  return {
    containsEdgeCount: get(
      `
        SELECT COUNT(*) AS count
        FROM relationships
        JOIN type_cards ON type_cards.id = relationships.relationship_type_id
        WHERE type_cards.slug = 'contains'
      `
    )?.count ?? 0,
    discoveryReport: await readDiscoveryReport(),
    documents,
    folderCount: get(
      `
        SELECT COUNT(*) AS count
        FROM subjects
        JOIN type_cards ON type_cards.id = subjects.subject_type_id
        WHERE type_cards.slug = 'folder'
      `
    )?.count ?? 0,
    shelfFolderItems: all(`
      SELECT folder_id, item_id, position, created, updated
      FROM shelf_folder_items
      ORDER BY folder_id ASC, position ASC, created ASC
    `),
    shelfFolders: all(`
      SELECT id, scope, label, position, collapsed, created, updated
      FROM shelf_folders
      WHERE scope = 'documents'
      ORDER BY position ASC, created ASC
    `).map((folder) => ({
      ...folder,
      collapsed: Number(folder.collapsed) === 1
    })),
    shardsByDocumentId
  };
}

function aliasesSubquery(targetKindSql, targetIdExpression) {
  return `COALESCE((
    SELECT json_group_array(value)
    FROM lexicalizations
    WHERE lexicalizations.target_kind = ${targetKindSql}
      AND lexicalizations.target_id = ${targetIdExpression}
      AND lexicalizations.lexical_type IN ('alias', 'acronym', 'source_label', 'search_hint')
      AND lexicalizations.status = 'active'
  ), '[]')`;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readDiscoveryReport() {
  try {
    return JSON.parse(await readFile(discoveryReportPath, "utf8"));
  } catch {
    return null;
  }
}
