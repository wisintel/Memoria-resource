import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  createClaimCommand,
  createEntityCommand,
  createRelationshipCommand,
} from "../../lib/server/curation-commands";
import { createSupabaseClient } from "../../lib/supabase/client";

const defaultSessionId = "local-browser";
const curationClassLabels = ["Entity", "Claim", "Relationship"];

type ToolPayload = Record<string, unknown> | unknown[];

loadLocalEnv();

const server = new McpServer({
  name: "atlas-local",
  version: "0.1.0",
});

server.registerTool(
  "get_current_context",
  {
    description: "Get the current Atlas app screen context for the open local browser session.",
    inputSchema: {
      sessionId: z.string().optional(),
    },
    title: "Get current context",
  },
  async ({ sessionId }) => {
    const context = await getCurrentContext(sessionId);
    return jsonResult(context);
  },
);

server.registerTool(
  "list_curation_options",
  {
    description: "List curation classes, types, kinds, and statuses for the current or provided domain.",
    inputSchema: {
      domainId: z.string().optional(),
      sessionId: z.string().optional(),
    },
    title: "List curation options",
  },
  async ({ domainId, sessionId }) => {
    const context = await getCurrentContext(sessionId);
    return jsonResult(await getCurationOptions(domainId ?? context.domain_id));
  },
);

server.registerTool(
  "get_active_chunk",
  {
    description: "Get the active document shard for the open Atlas screen context.",
    inputSchema: {
      sessionId: z.string().optional(),
      shardId: z.string().optional(),
    },
    title: "Get active chunk",
  },
  async ({ sessionId, shardId }) => {
    const context = await getCurrentContext(sessionId);
    const resolvedShardId = shardId ?? context.active_document_shard_id;

    if (!resolvedShardId) {
      return toolError("No active document shard was found. Open a document or scroll the reader in Atlas.");
    }

    const { data, error } = await createSupabaseClient()
      .from("document_shards")
      .select("id,document_id,position,heading_path,body,size_bytes,created_at,updated_at")
      .eq("id", resolvedShardId)
      .maybeSingle();

    if (error) return toolError(error.message);
    if (!data) return toolError("The active document shard no longer exists.");

    return jsonResult({
      context,
      shard: data,
    });
  },
);

server.registerTool(
  "list_entities",
  {
    description: "List entities for the current or provided domain.",
    inputSchema: {
      domainId: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
      sessionId: z.string().optional(),
    },
    title: "List entities",
  },
  async ({ domainId, limit, sessionId }) => {
    const context = await getCurrentContext(sessionId);
    const resolvedDomainId = requireDomainId(domainId ?? context.domain_id);
    const { data, error } = await createSupabaseClient()
      .from("entities")
      .select("id,domain_id,type_id,kind_id,status_id,slug,label,created_at,updated_at")
      .eq("domain_id", resolvedDomainId)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 50);

    if (error) return toolError(error.message);
    return jsonResult(data ?? []);
  },
);

server.registerTool(
  "list_claims",
  {
    description: "List claims for the current or provided domain.",
    inputSchema: {
      domainId: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
      sessionId: z.string().optional(),
    },
    title: "List claims",
  },
  async ({ domainId, limit, sessionId }) => {
    const context = await getCurrentContext(sessionId);
    const resolvedDomainId = requireDomainId(domainId ?? context.domain_id);
    const { data, error } = await createSupabaseClient()
      .from("claims")
      .select(
        "id,domain_id,type_id,kind_id,status_id,source_document_id,target_entity_ids,slug,label,claim_text,created_at,updated_at",
      )
      .eq("domain_id", resolvedDomainId)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 50);

    if (error) return toolError(error.message);
    return jsonResult(data ?? []);
  },
);

server.registerTool(
  "list_relationships",
  {
    description: "List relationships for the current or provided domain.",
    inputSchema: {
      domainId: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
      sessionId: z.string().optional(),
    },
    title: "List relationships",
  },
  async ({ domainId, limit, sessionId }) => {
    const context = await getCurrentContext(sessionId);
    const resolvedDomainId = requireDomainId(domainId ?? context.domain_id);
    const { data, error } = await createSupabaseClient()
      .from("relationships")
      .select(
        "id,domain_id,type_id,kind_id,status_id,source_class_id,source_record_id,target_class_id,target_record_id,label,created_at,updated_at",
      )
      .eq("domain_id", resolvedDomainId)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 50);

    if (error) return toolError(error.message);
    return jsonResult(data ?? []);
  },
);

server.registerTool(
  "create_entity",
  {
    description: "Create an entity through the shared Atlas curation command layer.",
    inputSchema: {
      domainId: z.string().optional(),
      kindId: z.string(),
      label: z.string(),
      sessionId: z.string().optional(),
      statusId: z.string().nullable().optional(),
      typeId: z.string(),
    },
    title: "Create entity",
  },
  async ({ domainId, kindId, label, sessionId, statusId, typeId }) => {
    const context = await getCurrentContext(sessionId);
    const result = await createEntityCommand({
      domainId: requireDomainId(domainId ?? context.domain_id),
      kindId,
      label,
      statusId,
      typeId,
    });

    if (!result.ok) return toolError(result.error ?? "Entity creation failed.");
    return jsonResult({ ok: true });
  },
);

server.registerTool(
  "create_claim",
  {
    description:
      "Create a claim through the shared Atlas curation command layer. Uses the active document as source unless sourceDocumentId is provided.",
    inputSchema: {
      claimText: z.string(),
      domainId: z.string().optional(),
      kindId: z.string(),
      sessionId: z.string().optional(),
      sourceDocumentId: z.string().nullable().optional(),
      statusId: z.string().nullable().optional(),
      targetEntityIds: z.array(z.string()).default([]),
      typeId: z.string(),
    },
    title: "Create claim",
  },
  async ({ claimText, domainId, kindId, sessionId, sourceDocumentId, statusId, targetEntityIds, typeId }) => {
    const context = await getCurrentContext(sessionId);
    const result = await createClaimCommand({
      claimText,
      domainId: requireDomainId(domainId ?? context.domain_id),
      kindId,
      sourceDocumentId: sourceDocumentId === undefined ? context.document_id : sourceDocumentId,
      statusId,
      targetEntityIds,
      typeId,
    });

    if (!result.ok) return toolError(result.error ?? "Claim creation failed.");
    return jsonResult({ ok: true });
  },
);

server.registerTool(
  "create_relationship",
  {
    description: "Create a relationship through the shared Atlas curation command layer.",
    inputSchema: {
      domainId: z.string().optional(),
      kindId: z.string(),
      sessionId: z.string().optional(),
      sourceClassId: z.string(),
      sourceRecordId: z.string(),
      statusId: z.string().nullable().optional(),
      targetClassId: z.string(),
      targetRecordId: z.string(),
      typeId: z.string(),
    },
    title: "Create relationship",
  },
  async ({
    domainId,
    kindId,
    sessionId,
    sourceClassId,
    sourceRecordId,
    statusId,
    targetClassId,
    targetRecordId,
    typeId,
  }) => {
    const context = await getCurrentContext(sessionId);
    const result = await createRelationshipCommand({
      domainId: requireDomainId(domainId ?? context.domain_id),
      kindId,
      sourceClassId,
      sourceRecordId,
      statusId,
      targetClassId,
      targetRecordId,
      typeId,
    });

    if (!result.ok) return toolError(result.error ?? "Relationship creation failed.");
    return jsonResult({ ok: true });
  },
);

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function getCurrentContext(sessionId?: string) {
  const resolvedSessionId = sessionId?.trim() || defaultSessionId;
  const { data, error } = await createSupabaseClient()
    .from("app_context_sessions")
    .select("*")
    .eq("session_id", resolvedSessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (
    data ?? {
      document_id: null,
      active_document_shard_id: null,
      domain_id: null,
      mode: null,
      route: null,
      screen: null,
      selected_record_id: null,
      selected_record_table: null,
      session_id: resolvedSessionId,
      updated_at: null,
    }
  );
}

async function getCurationOptions(domainId: string | null) {
  const supabase = createSupabaseClient();
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id,label,table_name")
    .in("label", curationClassLabels)
    .order("label", { ascending: true });

  if (classesError) {
    throw new Error(classesError.message);
  }

  const classIds = (classes ?? []).map((record) => record.id);
  const [{ data: types, error: typesError }, { data: statuses, error: statusesError }, { data: kinds, error: kindsError }] =
    await Promise.all([
      supabase.from("types").select("id,class_id,slug,label,status_id").in("class_id", classIds).order("label"),
      supabase.from("statuses").select("id,class_id,slug,label").in("class_id", classIds).order("label"),
      supabase
        .from("kinds")
        .select("id,domain_id,class_id,type_id,slug,label,status_id")
        .in("class_id", classIds)
        .or(domainId ? `domain_id.is.null,domain_id.eq.${domainId}` : "domain_id.is.null")
        .order("label"),
    ]);

  if (typesError) throw new Error(typesError.message);
  if (statusesError) throw new Error(statusesError.message);
  if (kindsError) throw new Error(kindsError.message);

  return {
    classes: classes ?? [],
    domain_id: domainId,
    kinds: kinds ?? [],
    statuses: statuses ?? [],
    types: types ?? [],
  };
}

function requireDomainId(domainId: string | null | undefined) {
  if (!domainId) {
    throw new Error("No active domain was found. Open a domain in Atlas or provide domainId.");
  }

  return domainId;
}

function jsonResult(payload: ToolPayload | Record<string, unknown>) {
  return {
    content: [
      {
        text: JSON.stringify(payload, null, 2),
        type: "text" as const,
      },
    ],
  };
}

function toolError(message: string) {
  return {
    content: [
      {
        text: message,
        type: "text" as const,
      },
    ],
    isError: true,
  };
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
