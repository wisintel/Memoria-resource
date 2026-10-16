#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const serverDir = dirname(fileURLToPath(import.meta.url));
const vaultRoot = resolve(serverDir, "../..");
const dbPath = join(vaultRoot, "app", "data", "memoria.sqlite");
const discoveryTool = join(vaultRoot, "tools", "discovery", "discover-library.mjs");
const discoveryReportPath = join(vaultRoot, "tools", "discovery", "discovery-report.json");
const appApiBaseUrl = process.env.MEMORIA_APP_API_URL ?? "http://127.0.0.1:4174";

const cardTables = [
  { itemTable: "nodes", tableName: "nodes", label: "Nodes" },
  { itemTable: "concepts", tableName: "concepts", label: "Concepts" },
  { itemTable: "entities", tableName: "entities", label: "Entities" },
  { itemTable: "clusters", tableName: "clusters", label: "Clusters" },
  { itemTable: "domains", tableName: "domains", label: "Domains" },
  { itemTable: "references", tableName: "reference_cards", label: "References" },
  { itemTable: "claims", tableName: "claims", label: "Claims" },
  { itemTable: "documents", tableName: "documents", label: "Documents" },
];

const cardTableByItemTable = new Map(cardTables.map((table) => [table.itemTable, table]));

const tools = [
  {
    name: "app_summary",
    description: "Return Memoria app counts, current domain rows, views, card families, and database health.",
    inputSchema: objectSchema({}),
  },
  {
    name: "list_domains",
    description: "List promoted domain cards used as app filters.",
    inputSchema: objectSchema({}),
  },
  {
    name: "list_card_families",
    description: "List shelf-visible card families and row counts.",
    inputSchema: objectSchema({}),
  },
  {
    name: "search_cards",
    description: "Search current Memoria cards across nodes, concepts, entities, clusters, domains, references, claims, and documents.",
    inputSchema: objectSchema({
      query: { type: "string" },
      item_table: {
        type: "string",
        enum: ["all", "nodes", "concepts", "entities", "clusters", "domains", "references", "claims", "documents"],
        default: "all",
      },
      limit: { type: "number", default: 25 },
    }),
  },
  {
    name: "read_card",
    description: "Read a card by id or exact label, including direct relationships and source note path.",
    inputSchema: objectSchema({
      id_or_label: { type: "string" },
    }, ["id_or_label"]),
  },
  {
    name: "graph_view",
    description: "Return a graph view with placed items and visible edges.",
    inputSchema: objectSchema({
      view_id: { type: "string" },
    }),
  },
  {
    name: "current_app_context",
    description: "Return the latest app context packet when the app context endpoint/table exists; otherwise return an explicit not-configured status.",
    inputSchema: objectSchema({}),
  },
  {
    name: "get_domain_context",
    description: "Atlas-compatible: read one Memoria domain with compact documents, entities, concepts, nodes, claims, relationships, views, counts, and ontology types.",
    inputSchema: objectSchema({
      domainId: { type: ["string", "null"] },
      limit: { type: "number", default: 25 },
    }),
  },
  {
    name: "get_graph_view",
    description: "Atlas-compatible: read a Memoria graph view with placed items and visible relationships.",
    inputSchema: objectSchema({
      viewId: { type: "string" },
    }, ["viewId"]),
  },
  {
    name: "search_entities",
    description: "Atlas-compatible: search Memoria entities in a domain by label or return recent entities.",
    inputSchema: objectSchema({
      domainId: { type: ["string", "null"] },
      limit: { type: "number", default: 25 },
      query: { type: "string" },
    }),
  },
  {
    name: "search_claims",
    description: "Atlas-compatible: search Memoria claims in a domain by text and optionally constrain them to a target item.",
    inputSchema: objectSchema({
      domainId: { type: ["string", "null"] },
      limit: { type: "number", default: 25 },
      query: { type: "string" },
      targetEntityId: { type: "string" },
    }),
  },
  {
    name: "get_entity_context",
    description: "Atlas-compatible: read one Memoria entity with claims and incoming/outgoing relationships.",
    inputSchema: objectSchema({
      entityId: { type: "string" },
    }, ["entityId"]),
  },
  {
    name: "list_documents",
    description: "Atlas-compatible: list Memoria documents in a domain by label or source filename.",
    inputSchema: objectSchema({
      domainId: { type: ["string", "null"] },
      limit: { type: "number", default: 25 },
      query: { type: "string" },
    }),
  },
  {
    name: "get_document_context",
    description: "Atlas-compatible: read one Memoria document with metadata and shards.",
    inputSchema: objectSchema({
      documentId: { type: "string" },
      limit: { type: "number", default: 25 },
    }, ["documentId"]),
  },
  {
    name: "propose_entity",
    description: "Atlas-compatible: create a typed, non-mutating Memoria entity proposal for user review.",
    inputSchema: objectSchema({
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      domainId: { type: ["string", "null"] },
      evidence: { type: "array", default: [] },
      label: { type: "string" },
      questions: { type: "array", default: [] },
      rationale: { type: "string" },
      statusId: { type: "string" },
      statusLabel: { type: "string" },
      typeId: { type: "string" },
      typeLabel: { type: "string" },
    }, ["confidence", "label", "rationale"]),
  },
  {
    name: "list_notes",
    description: "List Markdown notes from library and sources.",
    inputSchema: objectSchema({
      kind: { type: "string", enum: ["all", "library", "sources"], default: "all" },
    }),
  },
  {
    name: "search_notes",
    description: "Search note titles, paths, frontmatter, and bodies.",
    inputSchema: objectSchema({
      query: { type: "string" },
    }, ["query"]),
  },
  {
    name: "read_note",
    description: "Read a Markdown note by title or vault-relative path.",
    inputSchema: objectSchema({
      title_or_path: { type: "string" },
    }, ["title_or_path"]),
  },
  {
    name: "write_source_note",
    description: "Write a source note under sources/. This does not write SQLite; call refresh_discovery to update generated database rows.",
    inputSchema: objectSchema({
      filename: { type: "string" },
      content: { type: "string" },
      overwrite: { type: "boolean", default: false },
    }, ["filename", "content"]),
  },
  {
    name: "write_library_note",
    description: "Write a library note under library/. This does not write SQLite; call refresh_discovery to update generated database rows.",
    inputSchema: objectSchema({
      filename: { type: "string" },
      content: { type: "string" },
      overwrite: { type: "boolean", default: false },
    }, ["filename", "content"]),
  },
  {
    name: "read_only_sql",
    description: "Run one read-only SELECT or PRAGMA query against the Memoria database.",
    inputSchema: objectSchema({
      sql: { type: "string" },
    }, ["sql"]),
  },
  {
    name: "refresh_discovery",
    description: "Run tools/discovery/discover-library.mjs --write to rebuild generated database rows from Markdown notes.",
    inputSchema: objectSchema({}),
  },
  {
    name: "convert_pdf_to_document",
    description: "Convert a local PDF to Markdown with Marker and import the converted Markdown into Memoria as a document.",
    inputSchema: objectSchema({
      pdf_path: { type: "string" },
      domain_id: { type: ["string", "null"] },
      label: { type: "string" },
      mime_type: { type: ["string", "null"] },
      source_filename: { type: "string" },
    }, ["pdf_path"]),
  },
  {
    name: "create_item",
    description: "Create a Memoria item through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      domain_id: { type: ["string", "null"] },
      item_table: { type: "string", enum: ["concepts", "entities", "clusters", "domains", "references", "claims", "documents", "nodes"] },
      label: { type: "string" },
      type: { type: "string" },
      source: { type: ["string", "null"] },
      target_id: { type: ["string", "null"] },
      claim_text: { type: ["string", "null"] },
      domain_filter_id: { type: ["string", "null"] },
      view_id: { type: ["string", "null"] },
    }, ["item_table", "label", "type"]),
  },
  {
    name: "create_entity",
    description: "Atlas-compatible: create a real Memoria entity through the app API after duplicate search.",
    inputSchema: objectSchema({
      domainId: { type: ["string", "null"] },
      kindId: { type: "string" },
      label: { type: "string" },
      statusId: { type: "string" },
      typeId: { type: "string" },
      typeLabel: { type: "string" },
      viewId: { type: ["string", "null"] },
    }, ["label"]),
  },
  {
    name: "create_claim",
    description: "Atlas-compatible: create a real Memoria claim through the app API after resolving a target item.",
    inputSchema: objectSchema({
      claimText: { type: "string" },
      domainId: { type: ["string", "null"] },
      sourceDocumentId: { type: "string" },
      targetEntityIds: { type: "array" },
      targetEntityId: { type: "string" },
      typeId: { type: "string" },
      typeLabel: { type: "string" },
      viewId: { type: ["string", "null"] },
    }, ["claimText"]),
  },
  {
    name: "create_relationship",
    description: "Atlas-compatible: create a real Memoria relationship/edge through the app API after resolving source, target, and type.",
    inputSchema: objectSchema({
      domainId: { type: ["string", "null"] },
      label: { type: ["string", "null"] },
      sourceClassId: { type: "string" },
      sourceRecordId: { type: "string" },
      targetClassId: { type: "string" },
      targetRecordId: { type: "string" },
      typeId: { type: "string" },
      typeLabel: { type: "string" },
      viewId: { type: ["string", "null"] },
    }, ["sourceRecordId", "targetRecordId"]),
  },
  {
    name: "merge_entity",
    description: "Atlas-compatible: merge one Memoria subject/entity into another, transferring claims, relationships, aliases, evidence links, memberships, and placements.",
    inputSchema: objectSchema({
      dryRun: { type: "boolean", default: true },
      domainId: { type: ["string", "null"] },
      reason: { type: "string" },
      sourceEntityId: { type: "string" },
      targetEntityId: { type: "string" },
      viewId: { type: ["string", "null"] },
    }, ["sourceEntityId", "targetEntityId"]),
  },
  {
    name: "create_type",
    description: "Atlas-compatible: create or reuse a Memoria ontology type for an item class.",
    inputSchema: objectSchema({
      classTableName: { type: "string", enum: ["entities", "claims", "relationships", "edges", "concepts", "nodes", "documents"] },
      domainId: { type: ["string", "null"] },
      label: { type: "string" },
    }, ["classTableName", "label"]),
  },
  {
    name: "change_type",
    description: "Atlas-compatible: update a Memoria entity, claim, or relationship type through the app API.",
    inputSchema: objectSchema({
      recordId: { type: "string" },
      tableName: { type: "string", enum: ["claims", "entities", "relationships", "edges", "concepts", "nodes", "documents"] },
      typeId: { type: "string" },
      typeLabel: { type: "string" },
      viewId: { type: ["string", "null"] },
    }, ["recordId", "tableName"]),
  },
  {
    name: "delete_relationship",
    description: "Atlas-compatible: delete a Memoria relationship/edge through the app API.",
    inputSchema: objectSchema({
      recordId: { type: "string" },
      relationshipId: { type: "string" },
      viewId: { type: ["string", "null"] },
      domainId: { type: ["string", "null"] },
    }),
  },
  {
    name: "add_record_to_view",
    description: "Atlas-compatible: add an existing Memoria record to a graph view when the record is an item.",
    inputSchema: objectSchema({
      recordId: { type: "string" },
      tableName: { type: "string" },
      viewId: { type: "string" },
      visibility: { type: "string", enum: ["visible", "hidden", "collapsed", "metadata_only"], default: "visible" },
      x: { type: "number", default: 0 },
      y: { type: "number", default: 0 },
    }, ["recordId", "tableName", "viewId"]),
  },
  {
    name: "update_item",
    description: "Update a Memoria item through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
      aliases: { type: "string" },
      claim_text: { type: ["string", "null"] },
      description: { type: "string" },
      domain_filter_id: { type: ["string", "null"] },
      domain_id: { type: ["string", "null"] },
      extraction_stage: { type: "string" },
      intake_profile: { type: "string" },
      label: { type: "string" },
      last_updated: { type: "string" },
      mime_type: { type: ["string", "null"] },
      role: { type: "string" },
      source: { type: ["string", "null"] },
      source_filename: { type: ["string", "null"] },
      source_url: { type: ["string", "null"] },
      target_id: { type: ["string", "null"] },
      type: { type: "string" },
      view_id: { type: ["string", "null"] },
    }, ["id", "label", "type"]),
  },
  {
    name: "delete_item",
    description: "Delete a Memoria item through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
      domain_filter_id: { type: ["string", "null"] },
      view_id: { type: ["string", "null"] },
    }, ["id"]),
  },
  {
    name: "create_edge",
    description: "Create a Memoria edge through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      domain_filter_id: { type: ["string", "null"] },
      domain_id: { type: ["string", "null"] },
      label: { type: ["string", "null"] },
      source: { type: ["string", "null"] },
      source_id: { type: "string" },
      target_id: { type: "string" },
      type: { type: "string" },
      view_id: { type: ["string", "null"] },
    }, ["source_id", "target_id", "type"]),
  },
  {
    name: "update_edge",
    description: "Update a Memoria edge through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
      domain_filter_id: { type: ["string", "null"] },
      domain_id: { type: ["string", "null"] },
      label: { type: ["string", "null"] },
      source: { type: ["string", "null"] },
      source_id: { type: ["string", "null"] },
      target_id: { type: ["string", "null"] },
      type: { type: "string" },
      view_id: { type: ["string", "null"] },
    }, ["id", "type"]),
  },
  {
    name: "delete_edge",
    description: "Delete a Memoria edge through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
      domain_filter_id: { type: ["string", "null"] },
      view_id: { type: ["string", "null"] },
    }, ["id"]),
  },
  {
    name: "create_domain",
    description: "Create a Memoria domain through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      label: { type: "string" },
      slug: { type: ["string", "null"] },
    }, ["label"]),
  },
  {
    name: "update_domain",
    description: "Update a Memoria domain through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
      label: { type: "string" },
      slug: { type: ["string", "null"] },
    }, ["id", "label"]),
  },
  {
    name: "delete_domain",
    description: "Delete an empty Memoria domain through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
    }, ["id"]),
  },
  {
    name: "create_view",
    description: "Create a Memoria view through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      copy_from_view_id: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      domain_filter_id: { type: ["string", "null"] },
      domain_id: { type: ["string", "null"] },
      label: { type: "string" },
      position_updates: { type: "array" },
    }, ["label"]),
  },
  {
    name: "update_view",
    description: "Update a Memoria view through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
      description: { type: ["string", "null"] },
      label: { type: "string" },
    }, ["id", "label"]),
  },
  {
    name: "delete_view",
    description: "Delete a Memoria view through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
    }, ["id"]),
  },
  {
    name: "place_item",
    description: "Place an item in a Memoria view through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      domain_filter_id: { type: ["string", "null"] },
      item_id: { type: "string" },
      view_id: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
    }, ["item_id", "view_id", "x", "y"]),
  },
  {
    name: "import_document",
    description: "Import Markdown or HTML into Memoria as a document through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      content: { type: "string" },
      domain_id: { type: ["string", "null"] },
      label: { type: "string" },
      mime_type: { type: ["string", "null"] },
      source_filename: { type: ["string", "null"] },
      source_type: { type: "string", enum: ["html", "markdown"] },
    }, ["content", "label", "source_type"]),
  },
  {
    name: "import_document_file",
    description: "Import a base64 encoded Markdown, HTML, or PDF file through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      data_base64: { type: "string" },
      domain_id: { type: ["string", "null"] },
      label: { type: "string" },
      mime_type: { type: ["string", "null"] },
      source_filename: { type: ["string", "null"] },
      source_type: { type: "string", enum: ["html", "markdown"] },
    }, ["data_base64", "label"]),
  },
  {
    name: "reset_workbench",
    description: "Reset Memoria workbench views through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      domain_id: { type: ["string", "null"] },
    }),
  },
  {
    name: "save_item_positions",
    description: "Update placed item positions through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      domain_filter_id: { type: ["string", "null"] },
      view_id: { type: "string" },
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["id", "x", "y"],
          additionalProperties: false,
        },
      },
    }, ["view_id", "updates"]),
  },
  {
    name: "remove_view_item",
    description: "Remove an item from a view through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      view_item_id: { type: "string" },
    }, ["view_item_id"]),
  },
  {
    name: "remove_view_edge",
    description: "Remove an edge from a view through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      view_edge_id: { type: "string" },
    }, ["view_edge_id"]),
  },
  {
    name: "delete_document",
    description: "Delete a Memoria document through the same app API endpoint used by the UI.",
    inputSchema: objectSchema({
      id: { type: "string" },
    }, ["id"]),
  },
];

let input = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  processMessages();
});

function processMessages() {
  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");

    if (headerEnd === -1) {
      return;
    }

    const header = input.slice(0, headerEnd).toString("utf8");
    const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);

    if (!lengthMatch) {
      throw new Error("Missing Content-Length header");
    }

    const length = Number(lengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;

    if (input.length < bodyEnd) {
      return;
    }

    const raw = input.slice(bodyStart, bodyEnd).toString("utf8");
    input = input.slice(bodyEnd);
    void handleMessage(JSON.parse(raw));
  }
}

async function handleMessage(message) {
  if (!("id" in message)) {
    return;
  }

  try {
    if (message.method === "initialize") {
      send({
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "memoria-app", version: "0.2.0" },
        },
      });
      return;
    }

    if (message.method === "tools/list") {
      send({ id: message.id, result: { tools } });
      return;
    }

    if (message.method === "tools/call") {
      const { name, arguments: args = {} } = message.params ?? {};
      const result = await callTool(name, args);
      send({
        id: message.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
      });
      return;
    }

    sendError(message.id, -32601, `Unsupported method: ${message.method}`);
  } catch (error) {
    sendError(message.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(name, args) {
  switch (name) {
    case "app_summary":
      return appSummary();
    case "list_domains":
      return listDomains();
    case "list_card_families":
      return listCardFamilies();
    case "search_cards":
      return searchCards(args);
    case "read_card":
      return readCard(args.id_or_label);
    case "graph_view":
      return graphView(args.view_id);
    case "current_app_context":
      return currentAppContext();
    case "get_domain_context":
      return getDomainContext(args);
    case "get_graph_view":
      return graphView(args.viewId);
    case "search_entities":
      return searchEntities(args);
    case "search_claims":
      return searchClaims(args);
    case "get_entity_context":
      return getEntityContext(args.entityId);
    case "list_documents":
      return listDocumentsTool(args);
    case "get_document_context":
      return getDocumentContext(args);
    case "propose_entity":
      return proposeEntity(args);
    case "list_notes":
      return listNotes(args.kind ?? "all");
    case "search_notes":
      return searchNotes(args.query);
    case "read_note":
      return readNote(args.title_or_path);
    case "write_source_note":
      return writeNote("sources", args.filename, args.content, args.overwrite === true);
    case "write_library_note":
      return writeNote("library", args.filename, args.content, args.overwrite === true);
    case "read_only_sql":
      return readOnlySql(args.sql);
    case "refresh_discovery":
      return refreshDiscovery();
    case "convert_pdf_to_document":
      return convertPdfToDocument(args);
    case "create_item":
      return createItem(args);
    case "create_entity":
      return createEntity(args);
    case "create_claim":
      return createClaim(args);
    case "create_relationship":
      return createRelationship(args);
    case "merge_entity":
      return mergeEntity(args);
    case "create_type":
      return createType(args);
    case "change_type":
      return changeType(args);
    case "delete_relationship":
      return deleteRelationship(args);
    case "add_record_to_view":
      return addRecordToView(args);
    case "update_item":
      return updateItem(args);
    case "delete_item":
      return deleteItem(args);
    case "create_edge":
      return createEdge(args);
    case "update_edge":
      return updateEdge(args);
    case "delete_edge":
      return deleteEdge(args);
    case "create_domain":
      return createDomain(args);
    case "update_domain":
      return updateDomain(args);
    case "delete_domain":
      return deleteDomain(args);
    case "create_view":
      return createView(args);
    case "update_view":
      return updateView(args);
    case "delete_view":
      return deleteView(args);
    case "place_item":
      return placeItem(args);
    case "save_item_positions":
      return saveItemPositions(args);
    case "remove_view_item":
      return removeViewItem(args);
    case "remove_view_edge":
      return removeViewEdge(args);
    case "reset_workbench":
      return resetWorkbench(args);
    case "import_document":
      return importDocument(args);
    case "import_document_file":
      return importDocumentFile(args);
    case "delete_document":
      return deleteDocument(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function appSummary() {
  const snapshot = await callAppApi("/api/graph");
  const edgeTypes = new Map();

  for (const edge of snapshot.edges ?? []) {
    edgeTypes.set(edge.type, (edgeTypes.get(edge.type) ?? 0) + 1);
  }

  return {
    database_path: relative(vaultRoot, dbPath),
    domains: snapshot.domains ?? [],
    views: snapshot.views ?? [],
    card_families: listCardFamiliesFromSnapshot(snapshot),
    edge_types: [...edgeTypes.entries()].map(([type, count]) => ({ type, count })),
    semantic_core: true,
  };
}

async function listDomains() {
  const snapshot = await callAppApi("/api/graph");
  return snapshot.domains ?? [];
}

async function listCardFamilies() {
  return listCardFamiliesFromSnapshot(await callAppApi("/api/graph"));
}

async function searchCards({ query = "", item_table: itemTable = "all", limit = 25 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const snapshot = await callAppApi("/api/graph");
  const normalizedQuery = query.trim().toLowerCase();

  return (snapshot.items ?? [])
    .filter((item) => itemTable === "all" || item.item_table === normalizeToolItemTable(itemTable))
    .filter((item) => {
      if (!normalizedQuery) {
        return true;
      }

      return [item.label, item.type, item.role, item.description, item.aliases, item.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(0, normalizedLimit);
}

async function readCard(idOrLabel) {
  const snapshot = await callAppApi("/api/graph");
  const card = findCardInSnapshot(snapshot, idOrLabel);

  if (!card) {
    throw new Error(`No card found for ${idOrLabel}`);
  }

  return {
    ...card,
    outgoing_edges: (snapshot.edges ?? []).filter((edge) => edge.source_id === card.id),
    incoming_edges: (snapshot.edges ?? []).filter((edge) => edge.target_id === card.id),
    claims: (snapshot.items ?? []).filter((item) => item.item_table === "claims" && item.target_id === card.id),
  };
}

async function graphView(viewId) {
  const snapshot = await callAppApi(`/api/graph${graphQuery(viewId)}`);
  const view = snapshot.activeView ?? snapshot.views?.[0] ?? null;

  if (!view) {
    throw new Error("No graph view found");
  }

  return {
    view,
    placed_items: snapshot.viewItems ?? [],
    visible_edges: snapshot.viewEdges ?? [],
  };
}

function currentAppContext() {
  const db = openDb();

  try {
    if (!hasTable(db, "app_context_snapshots")) {
      return {
        configured: false,
        message: "No app_context_snapshots table exists yet. Add the frontend context packet endpoint before using this tool.",
      };
    }

    const snapshot = db
      .prepare("SELECT id, context_json, created FROM app_context_snapshots ORDER BY created DESC LIMIT 1")
      .get();

    if (!snapshot) {
      return { configured: true, context: null };
    }

    return {
      configured: true,
      created: snapshot.created,
      id: snapshot.id,
      context: parseJson(snapshot.context_json),
    };
  } finally {
    db.close();
  }
}

async function getDomainContext({ domainId = null, limit = 25 } = {}) {
  const rowLimit = boundedLimit(limit);
  const cleanDomainId = cleanNullableId(domainId);
  const snapshot = await callAppApi(`/api/graph${graphQuery(null, cleanDomainId)}`);

  return {
    claims: (snapshot.items ?? []).filter((item) => item.item_table === "claims").slice(0, rowLimit),
    concepts: [],
    counts: countsFromSnapshot(snapshot),
    documents: (snapshot.items ?? []).filter((item) => item.item_table === "documents").slice(0, rowLimit),
    domain: snapshot.activeDomain,
    entities: (snapshot.items ?? []).filter((item) => item.item_table === "nodes").slice(0, rowLimit),
    nodes: (snapshot.items ?? []).filter((item) => item.item_table === "nodes").slice(0, rowLimit),
    ontology: {
      types: snapshot.types ?? [],
    },
    relationships: (snapshot.edges ?? []).slice(0, rowLimit),
    returnedRowLimit: rowLimit,
    views: (snapshot.views ?? []).slice(0, rowLimit),
  };
}

async function searchEntities({ domainId = null, limit = 25, query = "" } = {}) {
  const rowLimit = boundedLimit(limit);
  const snapshot = await callAppApi(`/api/graph${graphQuery(null, cleanNullableId(domainId))}`);
  const needle = query.trim().toLowerCase();

  return {
    entities: (snapshot.items ?? [])
      .filter((item) => item.item_table === "nodes")
      .filter((item) => !needle || [item.label, item.type, item.description, item.aliases].some((value) => String(value ?? "").toLowerCase().includes(needle)))
      .slice(0, rowLimit),
  };
}

async function searchClaims({ domainId = null, limit = 25, query = "", targetEntityId = "" } = {}) {
  const rowLimit = boundedLimit(limit);
  const cleanTargetId = cleanNullableId(targetEntityId);
  const snapshot = await callAppApi(`/api/graph${graphQuery(null, cleanNullableId(domainId))}`);
  const needle = query.trim().toLowerCase();

  return {
    claims: (snapshot.items ?? [])
      .filter((item) => item.item_table === "claims")
      .filter((item) => !cleanTargetId || item.target_id === cleanTargetId)
      .filter((item) => !needle || [item.label, item.type, item.claim_text, item.source].some((value) => String(value ?? "").toLowerCase().includes(needle)))
      .slice(0, rowLimit),
  };
}

async function getEntityContext(entityId) {
  const snapshot = await callAppApi("/api/graph");
  const entity = findCardInSnapshot(snapshot, entityId);

  if (!entity) {
    return { aliases: [], claims: [], entity: null, relationships: [] };
  }

  const relationships = (snapshot.edges ?? []).filter((relationship) => relationship.source_id === entity.id || relationship.target_id === entity.id);

  return {
    aliases: parseJson(entity.aliases) ?? [],
    claims: (snapshot.items ?? []).filter((item) => item.item_table === "claims" && item.target_id === entity.id),
    entity,
    relationships: relationships.map((relationship) => ({
      ...relationship,
      direction: relationship.source_id === entity.id ? "outgoing" : "incoming",
    })),
  };
}

async function listDocumentsTool({ domainId = null, limit = 25, query = "" } = {}) {
  const snapshot = await callAppApi("/api/documents/workbench");
  const needle = query.trim().toLowerCase();

  return {
    documents: (snapshot.documents ?? [])
      .filter((document) => !cleanNullableId(domainId) || document.domain_id === cleanNullableId(domainId))
      .filter((document) => !needle || [document.label, document.source_filename, document.description, document.source].some((value) => String(value ?? "").toLowerCase().includes(needle)))
      .slice(0, boundedLimit(limit)),
  };
}

async function getDocumentContext({ documentId, limit = 25 } = {}) {
  const snapshot = await callAppApi("/api/documents/workbench");
  const document = (snapshot.documents ?? []).find((candidate) => candidate.id === documentId) ?? null;

  if (!document) {
    return { document: null, shards: [] };
  }

  return {
    document,
    shards: (snapshot.shardsByDocumentId?.[document.id] ?? []).slice(0, boundedLimit(limit)),
  };
}

function proposeEntity(input) {
  return {
    confidence: input.confidence,
    domainId: cleanNullableId(input.domainId),
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    label: textOr(input.label, "").trim(),
    proposalKind: "entity",
    questions: Array.isArray(input.questions) ? input.questions.map((question) => String(question).trim()).filter(Boolean) : [],
    rationale: textOr(input.rationale, "").trim(),
    statusId: cleanNullableId(input.statusId),
    statusLabel: cleanNullableId(input.statusLabel),
    typeId: cleanNullableId(input.typeId),
    typeLabel: cleanNullableId(input.typeLabel),
  };
}

async function createEntity(args) {
  const label = requiredArg(args.label, "label");
  const result = await createItem({
    domain_id: cleanNullableId(args.domainId),
    item_table: "nodes",
    label,
    source: null,
    type: typeNameForWrite(args.typeLabel, args.typeId, "Entity"),
    view_id: cleanNullableId(args.viewId),
  });

  return {
    entityId: result.created_item?.id ?? null,
    error: null,
    label,
    ok: true,
    result,
  };
}

async function createClaim(args) {
  const targetIds = Array.isArray(args.targetEntityIds) ? args.targetEntityIds.map((value) => String(value).trim()).filter(Boolean) : [];
  const targetId = cleanNullableId(args.targetEntityId) ?? targetIds[0];

  if (!targetId) {
    throw new Error("targetEntityId or targetEntityIds[0] is required.");
  }

  const result = await createItem({
    claim_text: requiredArg(args.claimText, "claimText"),
    domain_id: cleanNullableId(args.domainId),
    item_table: "claims",
    label: "Claim",
    source: cleanNullableId(args.sourceDocumentId),
    target_id: targetId,
    type: typeNameForWrite(args.typeLabel, args.typeId, "Claim"),
    view_id: cleanNullableId(args.viewId),
  });

  return {
    claimId: result.created_item?.id ?? null,
    error: null,
    ignoredTargetEntityIds: targetIds.slice(1),
    ok: true,
    result,
  };
}

async function createRelationship(args) {
  const result = await createEdge({
    domain_id: cleanNullableId(args.domainId),
    label: cleanNullableId(args.label),
    source: null,
    source_id: requiredArg(args.sourceRecordId, "sourceRecordId"),
    target_id: requiredArg(args.targetRecordId, "targetRecordId"),
    type: typeNameForWrite(args.typeLabel, args.typeId, "related_to"),
    view_id: cleanNullableId(args.viewId),
  });

  return {
    error: null,
    ok: true,
    relationshipId: result.created_edge?.id ?? null,
    result,
  };
}

async function mergeEntity(args) {
  const sourceEntityId = requiredArg(args.sourceEntityId, "sourceEntityId");
  const targetEntityId = requiredArg(args.targetEntityId, "targetEntityId");
  const result = await callAppApi("/api/subjects/merge", {
    body: {
      domain_filter_id: cleanNullableId(args.domainId),
      dry_run: args.dryRun !== false,
      reason: textOr(args.reason, "").trim(),
      source_id: sourceEntityId,
      target_id: targetEntityId,
      view_id: cleanNullableId(args.viewId),
    },
    method: "POST",
  });

  return {
    dryRun: result.dry_run === true,
    error: null,
    ok: true,
    result,
    sourceEntityId,
    targetEntityId,
  };
}

async function createType(args) {
  const db = openDb();
  const itemTable = args.classTableName === "relationships" ? "edges" : requiredArg(args.classTableName, "classTableName");
  const label = requiredArg(args.label, "label");
  const domainId = cleanNullableId(args.domainId);
  const slug = slugify(label);
  const timestamp = new Date().toISOString();

  try {
    const existing = domainId
      ? db.prepare("SELECT id, domain_id, item_table, slug, label FROM types WHERE domain_id = ? AND item_table = ? AND slug = ?").get(domainId, itemTable, slug)
      : db.prepare("SELECT id, domain_id, item_table, slug, label FROM types WHERE domain_id IS NULL AND item_table = ? AND slug = ?").get(itemTable, slug);

    if (existing) {
      return { classTableName: itemTable, error: null, label, ok: true, typeId: existing.id };
    }

    const typeId = `type_${slug}_${Math.random().toString(16).slice(2, 10)}`;
    db.prepare("INSERT INTO types (id, domain_id, item_table, slug, label, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      typeId,
      domainId,
      itemTable,
      slug,
      label,
      timestamp,
      timestamp
    );

    return { classTableName: itemTable, error: null, label, ok: true, typeId };
  } finally {
    db.close();
  }
}

async function changeType(args) {
  const tableName = args.tableName === "relationships" ? "edges" : requiredArg(args.tableName, "tableName");
  const type = typeNameForWrite(args.typeLabel, args.typeId, null);

  if (!type) {
    throw new Error("typeLabel or typeId is required.");
  }

  if (tableName === "edges") {
    return updateEdge({
      id: requiredArg(args.recordId, "recordId"),
      type,
      view_id: cleanNullableId(args.viewId),
    });
  }

  const current = readCard(args.recordId);
  return updateItem({
    ...current,
    id: current.id,
    label: current.label,
    type,
    view_id: cleanNullableId(args.viewId),
  });
}

async function deleteRelationship(args) {
  const id = cleanNullableId(args.relationshipId) ?? cleanNullableId(args.recordId);

  if (!id) {
    throw new Error("relationshipId or recordId is required.");
  }

  return deleteEdge({
    domain_filter_id: cleanNullableId(args.domainId),
    id,
    view_id: cleanNullableId(args.viewId),
  });
}

async function addRecordToView(args) {
  const tableName = requiredArg(args.tableName, "tableName");

  if (tableName === "relationships" || tableName === "edges") {
    return {
      error: "Memoria does not yet expose an add relationship-to-view endpoint. Add the edge through the graph UI or implement a view_edges creation endpoint first.",
      ok: false,
      recordId: args.recordId,
      tableName,
      viewId: args.viewId,
    };
  }

  return placeItem({
    item_id: requiredArg(args.recordId, "recordId"),
    view_id: requiredArg(args.viewId, "viewId"),
    visibility: args.visibility ?? "visible",
    x: typeof args.x === "number" ? args.x : 0,
    y: typeof args.y === "number" ? args.y : 0,
  });
}

async function listNotes(kind) {
  const roots = kind === "all" ? ["library", "sources"] : [kind];
  const notes = [];

  for (const root of roots) {
    for (const path of await walkMarkdown(join(vaultRoot, root))) {
      const content = await readFile(path, "utf8");
      notes.push({
        path: relative(vaultRoot, path),
        title: titleFromMarkdown(content) ?? basename(path, ".md"),
      });
    }
  }

  return notes.sort((left, right) => left.path.localeCompare(right.path));
}

async function searchNotes(query) {
  const lower = query.toLowerCase();
  const notes = await listNotes("all");
  const matches = [];

  for (const note of notes) {
    const content = await readFile(join(vaultRoot, note.path), "utf8");

    if (`${note.path}\n${note.title}\n${content}`.toLowerCase().includes(lower)) {
      matches.push(note);
    }
  }

  return matches;
}

async function readNote(titleOrPath) {
  const notes = await listNotes("all");
  const note = notes.find((candidate) => candidate.path === titleOrPath || candidate.title === titleOrPath);

  if (!note) {
    throw new Error(`No note found for ${titleOrPath}`);
  }

  return {
    path: note.path,
    title: note.title,
    content: await readFile(join(vaultRoot, note.path), "utf8"),
  };
}

async function writeNote(root, filename, content, overwrite) {
  const safeName = safeMarkdownFilename(filename);
  const path = join(vaultRoot, root, safeName);

  if (existsSync(path) && !overwrite) {
    throw new Error(`${root}/${safeName} already exists; pass overwrite=true to replace it`);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);

  return { path: relative(vaultRoot, path), written: true };
}

function readOnlySql(sql) {
  const trimmed = sql.trim();

  if (!/^(SELECT|PRAGMA)\b/i.test(trimmed) || /;\s*\S/.test(trimmed)) {
    throw new Error("Only one read-only SELECT or PRAGMA statement is allowed");
  }

  const db = openDb();

  try {
    return all(db, trimmed);
  } finally {
    db.close();
  }
}

async function refreshDiscovery() {
  const result = spawnSync("node", [discoveryTool, "--write"], {
    cwd: vaultRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "discovery refresh failed");
  }

  return JSON.parse(await readFile(discoveryReportPath, "utf8"));
}

async function convertPdfToDocument(args) {
  const pdfPath = resolveLocalPath(args.pdf_path);
  const pdfBuffer = await readFile(pdfPath);

  return importDocumentFile({
    data_base64: pdfBuffer.toString("base64"),
    domain_id: args.domain_id ?? null,
    label: args.label,
    mime_type: args.mime_type ?? "application/pdf",
    source_filename: args.source_filename ?? basename(pdfPath),
  });
}

async function createItem(args) {
  const snapshot = await callAppApi("/api/items", { body: args, method: "POST" });
  const createdItem = findLatestSnapshotItem(snapshot, args.label);

  return {
    ok: true,
    created_item: createdItem,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function updateItem(args) {
  const { id: itemId, ...body } = args;
  const snapshot = await callAppApi(`/api/items/${encodeURIComponent(itemId)}`, { body, method: "PATCH" });

  return {
    ok: true,
    item: findSnapshotItemById(snapshot, itemId),
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function deleteItem(args) {
  const query = graphQuery(args.view_id, args.domain_filter_id);
  const snapshot = await callAppApi(`/api/items/${encodeURIComponent(args.id)}${query}`, { method: "DELETE" });

  return {
    ok: true,
    deleted_item_id: args.id,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function createEdge(args) {
  const snapshot = await callAppApi("/api/edges", { body: args, method: "POST" });
  const createdEdge = findLatestSnapshotEdge(snapshot, args.label);

  return {
    ok: true,
    created_edge: createdEdge,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function updateEdge(args) {
  const { id: edgeId, ...body } = args;
  const snapshot = await callAppApi(`/api/edges/${encodeURIComponent(edgeId)}`, { body, method: "PATCH" });

  return {
    ok: true,
    edge: findSnapshotEdgeById(snapshot, edgeId),
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function deleteEdge(args) {
  const query = graphQuery(args.view_id, args.domain_filter_id);
  const snapshot = await callAppApi(`/api/edges/${encodeURIComponent(args.id)}${query}`, { method: "DELETE" });

  return {
    ok: true,
    deleted_edge_id: args.id,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function createDomain(args) {
  const snapshot = await callAppApi("/api/domains", { body: args, method: "POST" });
  const createdDomain = (snapshot.domains ?? []).find((domain) => domain.label === args.label) ?? snapshot.activeDomain ?? null;

  return {
    ok: true,
    created_domain: createdDomain,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function updateDomain(args) {
  const { id: domainId, ...body } = args;
  const snapshot = await callAppApi(`/api/domains/${encodeURIComponent(domainId)}`, { body, method: "PATCH" });

  return {
    ok: true,
    domain: (snapshot.domains ?? []).find((domain) => domain.id === domainId) ?? null,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function deleteDomain(args) {
  const snapshot = await callAppApi(`/api/domains/${encodeURIComponent(args.id)}`, { method: "DELETE" });

  return {
    ok: true,
    deleted_domain_id: args.id,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function createView(args) {
  const snapshot = await callAppApi("/api/views", { body: args, method: "POST" });
  const createdView = (snapshot.views ?? []).find((view) => view.label === args.label) ?? snapshot.activeView ?? null;

  return {
    ok: true,
    created_view: createdView,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function updateView(args) {
  const { id: viewId, ...body } = args;
  const snapshot = await callAppApi(`/api/views/${encodeURIComponent(viewId)}`, { body, method: "PATCH" });

  return {
    ok: true,
    view: (snapshot.views ?? []).find((view) => view.id === viewId) ?? null,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function deleteView(args) {
  const snapshot = await callAppApi(`/api/views/${encodeURIComponent(args.id)}`, { method: "DELETE" });

  return {
    ok: true,
    deleted_view_id: args.id,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function placeItem(args) {
  const snapshot = await callAppApi("/api/view-items", { body: args, method: "POST" });

  return {
    ok: true,
    placed_item_id: args.item_id,
    view_id: args.view_id,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function saveItemPositions(args) {
  const snapshot = await callAppApi("/api/view-items", { body: args, method: "PATCH" });

  return {
    ok: true,
    updated_positions: Array.isArray(args.updates) ? args.updates.length : 0,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function removeViewItem(args) {
  const snapshot = await callAppApi(`/api/view-items/${encodeURIComponent(args.view_item_id)}`, { method: "DELETE" });

  return {
    ok: true,
    removed_view_item_id: args.view_item_id,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function removeViewEdge(args) {
  const snapshot = await callAppApi(`/api/view-edges/${encodeURIComponent(args.view_edge_id)}`, { method: "DELETE" });

  return {
    ok: true,
    removed_view_edge_id: args.view_edge_id,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function resetWorkbench(args) {
  const query = args.domain_id ? `?domainId=${encodeURIComponent(args.domain_id)}` : "";
  const snapshot = await callAppApi(`/api/views/workbench/reset${query}`, { method: "POST" });

  return {
    ok: true,
    snapshot: summarizeGraphSnapshot(snapshot),
  };
}

async function importDocument(args) {
  const result = await callAppApi("/api/documents/import", { body: args, method: "POST" });
  const createdDocument = (result.documents ?? []).find((document) => document.id === result.documentId) ?? null;

  return {
    ok: true,
    document_id: result.documentId,
    deduped: result.deduped,
    document: createdDocument,
    document_count: result.documents?.length,
  };
}

async function importDocumentFile(args) {
  const result = await callAppApi("/api/documents/import-file", { body: args, method: "POST" });
  const createdDocument = (result.documents ?? []).find((document) => document.id === result.documentId) ?? null;

  return {
    ok: true,
    document_id: result.documentId,
    deduped: result.deduped,
    document: createdDocument,
    document_count: result.documents?.length,
  };
}

async function deleteDocument(args) {
  const result = await callAppApi(`/api/documents/${encodeURIComponent(args.id)}`, { method: "DELETE" });

  return {
    ok: true,
    deleted_document_id: args.id,
    document_count: result.documents?.length,
  };
}

async function callAppApi(path, { body, method = "GET" } = {}) {
  const url = new URL(path, appApiBaseUrl);
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    method,
  });
  const text = await response.text();
  const payload = text ? parseApiJson(text, path) : null;

  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload ? payload.error : text;
    throw new Error(`App API ${method} ${path} failed (${response.status}): ${detail || response.statusText}`);
  }

  return payload;
}

function parseApiJson(text, path) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`App API returned non-JSON for ${path}`);
  }
}

function summarizeGraphSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }

  return {
    active_domain: snapshot.activeDomain
      ? { id: snapshot.activeDomain.id, label: snapshot.activeDomain.label }
      : null,
    active_view: snapshot.activeView ? { id: snapshot.activeView.id, label: snapshot.activeView.label } : null,
    domain_count: snapshot.domains?.length ?? 0,
    edge_count: snapshot.edges?.length ?? 0,
    item_count: snapshot.items?.length ?? 0,
    shelf_item_count: snapshot.shelfItems?.length ?? 0,
    view_count: snapshot.views?.length ?? 0,
    view_edge_count: snapshot.viewEdges?.length ?? 0,
    view_item_count: snapshot.viewItems?.length ?? 0,
  };
}

function listCardFamiliesFromSnapshot(snapshot) {
  const counts = new Map();

  for (const item of snapshot.items ?? []) {
    counts.set(item.item_table, (counts.get(item.item_table) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function countsFromSnapshot(snapshot) {
  const counts = {};

  for (const item of snapshot.items ?? []) {
    counts[item.item_table] = (counts[item.item_table] ?? 0) + 1;
  }

  counts.relationships = snapshot.edges?.length ?? 0;
  counts.views = snapshot.views?.length ?? 0;
  return counts;
}

function normalizeToolItemTable(itemTable) {
  if (itemTable === "entities" || itemTable === "concepts") {
    return "nodes";
  }

  if (itemTable === "relationships") {
    return "edges";
  }

  return itemTable;
}

function findCardInSnapshot(snapshot, idOrLabel) {
  return (
    (snapshot.items ?? []).find((item) => item.id === idOrLabel) ??
    (snapshot.items ?? []).find((item) => item.label === idOrLabel) ??
    null
  );
}

function findSnapshotItemById(snapshot, itemId) {
  return (snapshot.items ?? []).find((item) => item.id === itemId) ?? null;
}

function findLatestSnapshotItem(snapshot, label = null) {
  return (
    (label ? (snapshot.items ?? []).find((item) => item.label === label) : null) ??
    [...(snapshot.items ?? [])].sort((left, right) => String(right.created).localeCompare(String(left.created)))[0] ??
    null
  );
}

function findSnapshotEdgeById(snapshot, edgeId) {
  return (snapshot.edges ?? []).find((edge) => edge.id === edgeId) ?? null;
}

function findLatestSnapshotEdge(snapshot, label = null) {
  return (
    (label ? (snapshot.edges ?? []).find((edge) => edge.label === label) : null) ??
    [...(snapshot.edges ?? [])].sort((left, right) => String(right.created).localeCompare(String(left.created)))[0] ??
    null
  );
}

function graphQuery(viewId, domainId) {
  const search = new URLSearchParams();

  if (viewId) {
    search.set("viewId", viewId);
  }

  if (domainId) {
    search.set("domainId", domainId);
  }

  return search.size > 0 ? `?${search.toString()}` : "";
}

function boundedLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 25, 100));
}

function cleanNullableId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contextCards(db, itemTable, domainId, limit) {
  return searchCardsInDb(db, {
    domainId,
    itemTable,
    limit,
    query: "",
  });
}

function contextDocuments(db, domainId, limit, query = "") {
  const params = [];
  const where = [];

  if (domainId) {
    where.push("domain_id = ?");
    params.push(domainId);
  } else {
    where.push("domain_id IS NULL");
  }

  if (query.trim()) {
    where.push("(label LIKE ? OR source_filename LIKE ? OR description LIKE ? OR source LIKE ?)");
    const like = `%${query.trim()}%`;
    params.push(like, like, like, like);
  }

  return all(
    db,
    `
      SELECT uniqueid AS id, domain_id, label, type, source_type, status, extraction_stage,
        description, source_filename, source_url, mime_type, shard_count, error_message,
        source, created, updated
      FROM documents
      WHERE ${where.join(" AND ")}
      ORDER BY updated DESC
      LIMIT ?
    `,
    ...params,
    limit
  );
}

function searchCardsInDb(db, { domainId, itemTable, limit, query }) {
  const params = [itemTable];
  const where = ["item_table = ?"];

  if (domainId) {
    where.push("domain_id = ?");
    params.push(domainId);
  } else {
    where.push("domain_id IS NULL");
  }

  if (query.trim()) {
    where.push("(label LIKE ? OR type LIKE ? OR role LIKE ? OR description LIKE ? OR aliases LIKE ? OR tags LIKE ? OR source LIKE ?)");
    const like = `%${query.trim()}%`;
    params.push(like, like, like, like, like, like, like);
  }

  return db
    .prepare(
      `
        SELECT *
        FROM (${cardSelectSql()})
        WHERE ${where.join(" AND ")}
        ORDER BY updated DESC, label
        LIMIT ?
      `
    )
    .all(...params, limit);
}

function domainCounts(db, domainId) {
  const value = {};

  for (const table of ["nodes", "concepts", "entities", "clusters", "domains", "references", "claims", "documents"]) {
    const row = domainId
      ? db.prepare(`SELECT COUNT(*) AS count FROM (${cardSelectSql()}) WHERE item_table = ? AND domain_id = ?`).get(table, domainId)
      : db.prepare(`SELECT COUNT(*) AS count FROM (${cardSelectSql()}) WHERE item_table = ? AND domain_id IS NULL`).get(table);
    value[table] = row?.count ?? 0;
  }

  value.relationships = domainId
    ? db.prepare("SELECT COUNT(*) AS count FROM edges WHERE domain_id = ?").get(domainId)?.count ?? 0
    : db.prepare("SELECT COUNT(*) AS count FROM edges WHERE domain_id IS NULL").get()?.count ?? 0;

  value.views = domainId
    ? db.prepare("SELECT COUNT(*) AS count FROM views WHERE domain_id = ?").get(domainId)?.count ?? 0
    : db.prepare("SELECT COUNT(*) AS count FROM views WHERE domain_id IS NULL").get()?.count ?? 0;

  return value;
}

function typeNameForWrite(typeLabel, typeId, fallback) {
  return cleanNullableId(typeLabel) ?? cleanNullableId(typeId) ?? fallback;
}

function requiredArg(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function textOr(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findCard(db, idOrLabel) {
  return (
    db
      .prepare(
        `
          SELECT *
          FROM (${cardSelectSql()})
          WHERE id = ? OR label = ?
          ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, label
          LIMIT 1
        `
      )
      .get(idOrLabel, idOrLabel, idOrLabel) ?? null
  );
}

function cardTargets(itemTable) {
  if (!itemTable || itemTable === "all") {
    return cardTables;
  }

  const target = cardTableByItemTable.get(itemTable);

  if (!target) {
    throw new Error(`Unsupported item_table: ${itemTable}`);
  }

  return [target];
}

function cardSelectSql() {
  return `
    SELECT 'nodes' AS item_table, uniqueid AS id, domain_id, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM nodes
    UNION ALL
    SELECT 'concepts' AS item_table, uniqueid AS id, domain_id, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM concepts
    UNION ALL
    SELECT 'entities' AS item_table, uniqueid AS id, domain_id, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM entities
    UNION ALL
    SELECT 'clusters' AS item_table, uniqueid AS id, domain_id, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM clusters
    UNION ALL
    SELECT 'domains' AS item_table, uniqueid AS id, uniqueid AS domain_id, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM domains
    UNION ALL
    SELECT 'references' AS item_table, uniqueid AS id, domain_id, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM reference_cards
    UNION ALL
    SELECT 'claims' AS item_table, uniqueid AS id, domain_id, label, type, '' AS role, claim_text AS description, '[]' AS aliases, '[]' AS tags, '' AS normalized, '' AS last_updated, source, created, updated FROM claims
    UNION ALL
    SELECT 'documents' AS item_table, uniqueid AS id, domain_id, label, type, '' AS role, description, aliases, tags, '' AS normalized, '' AS last_updated, source, created, updated FROM documents
  `;
}

function itemIdSet() {
  const db = openDb();

  try {
    return new Set(all(db, `SELECT id FROM (${cardSelectSql()})`).map((row) => row.id));
  } finally {
    db.close();
  }
}

function edgeIdSet() {
  const db = openDb();

  try {
    return new Set(all(db, "SELECT uniqueid AS id FROM edges").map((row) => row.id));
  } finally {
    db.close();
  }
}

function domainIdSet() {
  const db = openDb();

  try {
    return new Set(all(db, "SELECT uniqueid AS id FROM domains").map((row) => row.id));
  } finally {
    db.close();
  }
}

function viewIdSet() {
  const db = openDb();

  try {
    return new Set(all(db, "SELECT id FROM views").map((row) => row.id));
  } finally {
    db.close();
  }
}

function findCreatedCard(beforeIds) {
  const db = openDb();

  try {
    return (
      all(db, `SELECT * FROM (${cardSelectSql()}) ORDER BY created DESC, label`)
        .find((row) => !beforeIds.has(row.id)) ?? null
    );
  } finally {
    db.close();
  }
}

function findCreatedEdge(beforeIds) {
  const db = openDb();

  try {
    return readEdgeFromDb(db, null, beforeIds);
  } finally {
    db.close();
  }
}

function findCreatedDomain(beforeIds) {
  const db = openDb();

  try {
    return (
      all(db, "SELECT uniqueid AS id, slug, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM domains ORDER BY created DESC, label")
        .find((row) => !beforeIds.has(row.id)) ?? null
    );
  } finally {
    db.close();
  }
}

function findCreatedView(beforeIds) {
  const db = openDb();

  try {
    return all(db, "SELECT id, domain_id, slug, label, description, created, updated FROM views ORDER BY created DESC, label").find(
      (row) => !beforeIds.has(row.id)
    ) ?? null;
  } finally {
    db.close();
  }
}

function readEdge(edgeId) {
  const db = openDb();

  try {
    return readEdgeFromDb(db, edgeId);
  } finally {
    db.close();
  }
}

function readEdgeFromDb(db, edgeId, excludeIds = null) {
  const rows = all(
    db,
    `
      SELECT
        e.uniqueid AS id,
        e.domain_id,
        e.source_id,
        source.label AS source_label,
        source.item_table AS source_table,
        e.target_id,
        target.label AS target_label,
        target.item_table AS target_table,
        e.type,
        e.label,
        e.source,
        e.created,
        e.updated
      FROM edges e
      LEFT JOIN (${cardSelectSql()}) source ON source.id = e.source_id
      LEFT JOIN (${cardSelectSql()}) target ON target.id = e.target_id
      ${edgeId ? "WHERE e.uniqueid = ?" : ""}
      ORDER BY e.created DESC, e.label
    `,
    ...(edgeId ? [edgeId] : [])
  );

  return rows.find((row) => !excludeIds || !excludeIds.has(row.id)) ?? null;
}

function readDomain(domainId) {
  const db = openDb();

  try {
    return (
      db
        .prepare(
          "SELECT uniqueid AS id, slug, label, type, role, description, aliases, tags, normalized, last_updated, source, created, updated FROM domains WHERE uniqueid = ?"
        )
        .get(domainId) ?? null
    );
  } finally {
    db.close();
  }
}

function readView(viewId) {
  const db = openDb();

  try {
    return db.prepare("SELECT id, domain_id, slug, label, description, created, updated FROM views WHERE id = ?").get(viewId) ?? null;
  } finally {
    db.close();
  }
}

async function walkMarkdown(root) {
  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path);
      }
    }
  }

  return files;
}

function openDb() {
  if (!existsSync(dbPath)) {
    throw new Error(`Memoria database does not exist: ${dbPath}`);
  }

  return new DatabaseSync(dbPath, { readOnly: true });
}

function all(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

function hasTable(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function titleFromMarkdown(markdown) {
  const frontmatterTitle = /^---\n[\s\S]*?\ntitle:\s*"?([^"\n]+)"?[\s\S]*?\n---/m.exec(markdown)?.[1]?.trim();

  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeMarkdownFilename(filename) {
  const normalized = filename.endsWith(".md") ? filename : `${filename}.md`;

  if (normalized.includes("/") || normalized.includes("\\") || normalized.includes("..")) {
    throw new Error("filename must be a simple Markdown filename, not a path");
  }

  return normalized;
}

function resolveLocalPath(path) {
  if (typeof path !== "string" || !path.trim()) {
    throw new Error("pdf_path is required");
  }

  const resolved = resolve(vaultRoot, path.trim());

  if (!existsSync(resolved)) {
    throw new Error(`File does not exist: ${resolved}`);
  }

  return resolved;
}

function objectSchema(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function send(payload) {
  const body = JSON.stringify({ jsonrpc: "2.0", ...payload });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function sendError(id, code, message) {
  send({ id, error: { code, message } });
}
