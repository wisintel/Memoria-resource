import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { boundedLimit, compactRows, labelFor, referenceLookups, rowString, rowTitle } from "../lib/atlas-read-model";

export default defineTool({
  description: "Read a compact overview of one Atlas domain: domain metadata, counts, documents, entities, relationships, claims, and ontology references.",
  inputSchema: z.object({
    domainId: z.string().min(1),
    limit: z.number().int().positive().optional(),
  }),
  async execute({ domainId, limit }) {
    const rowLimit = boundedLimit(limit);
    const supabase = createSupabaseClient();
    const refs = await referenceLookups(domainId);
    const [domainResult, documentsResult, entitiesResult, relationshipsResult, claimsResult, viewsResult] = await Promise.all([
      supabase
        .from("domains")
        .select("id,slug,label,domain_type_id,status_id,created_at,updated_at")
        .eq("id", domainId)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id,label,title,status,source_type,source_filename,shard_count,updated_at", { count: "exact" })
        .eq("domain_id", domainId)
        .order("updated_at", { ascending: false })
        .limit(rowLimit),
      supabase
        .from("entities")
        .select("id,label,slug,type_id,kind_id,status_id,updated_at", { count: "exact" })
        .eq("domain_id", domainId)
        .order("updated_at", { ascending: false })
        .limit(rowLimit),
      supabase
        .from("relationships")
        .select("id,type_id,kind_id,status_id,source_class_id,source_record_id,target_class_id,target_record_id,label,updated_at", { count: "exact" })
        .eq("domain_id", domainId)
        .order("updated_at", { ascending: false })
        .limit(rowLimit),
      supabase
        .from("claims")
        .select("id,type_id,kind_id,status_id,label,claim_text,target_entity_ids,source_document_id,updated_at", { count: "exact" })
        .eq("domain_id", domainId)
        .order("updated_at", { ascending: false })
        .limit(rowLimit),
      supabase
        .from("views")
        .select("id,slug,label,view_kind,status_id,updated_at", { count: "exact" })
        .eq("domain_id", domainId)
        .order("updated_at", { ascending: false })
        .limit(rowLimit),
    ]);
    const error =
      domainResult.error?.message ??
      documentsResult.error?.message ??
      entitiesResult.error?.message ??
      relationshipsResult.error?.message ??
      claimsResult.error?.message ??
      viewsResult.error?.message ??
      null;

    if (error) {
      throw new Error(error);
    }

    const entities = (entitiesResult.data ?? []) as unknown as TableRow[];
    const relationships = (relationshipsResult.data ?? []) as unknown as TableRow[];
    const claims = (claimsResult.data ?? []) as unknown as TableRow[];

    return {
      claims: compactRows(claims, ["id", "type_id", "kind_id", "status_id", "claim_text", "target_entity_ids", "source_document_id"]),
      counts: {
        claims: claimsResult.count ?? null,
        documents: documentsResult.count ?? null,
        entities: entitiesResult.count ?? null,
        relationships: relationshipsResult.count ?? null,
        views: viewsResult.count ?? null,
      },
      documents: documentsResult.data ?? [],
      domain: domainResult.data,
      entities: entities.map((row) => ({
        id: rowString(row, "id"),
        kind: labelFor(refs.kindLabels, row.kind_id),
        label: rowTitle(row),
        status: labelFor(refs.statusLabels, row.status_id),
        type: labelFor(refs.typeLabels, row.type_id),
      })),
      ontology: {
        classes: refs.classes,
        kinds: refs.kinds,
        statuses: refs.statuses,
        types: refs.types,
      },
      returnedRowLimit: rowLimit,
      relationships: relationships.map((row) => ({
        id: rowString(row, "id"),
        label: rowString(row, "label"),
        sourceClass: labelFor(refs.classLabels, row.source_class_id),
        sourceRecordId: rowString(row, "source_record_id"),
        targetClass: labelFor(refs.classLabels, row.target_class_id),
        targetRecordId: rowString(row, "target_record_id"),
        type: labelFor(refs.typeLabels, row.type_id),
      })),
      views: (viewsResult.data ?? []).map((row) => ({
        id: rowString(row as TableRow, "id"),
        kind: rowString(row as TableRow, "view_kind"),
        label: rowTitle(row as TableRow),
        status: labelFor(refs.statusLabels, (row as TableRow).status_id),
      })),
    };
  },
});
