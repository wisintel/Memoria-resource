import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { compactRows, labelFor, referenceLookups, rowString, rowTitle } from "../lib/atlas-read-model";

export default defineTool({
  description: "Read one Atlas entity with aliases, claims, and incoming/outgoing relationships.",
  inputSchema: z.object({
    entityId: z.string().min(1),
  }),
  async execute({ entityId }) {
    const supabase = createSupabaseClient();
    const entityResult = await supabase
      .from("entities")
      .select("id,domain_id,label,slug,type_id,kind_id,status_id,created_at,updated_at")
      .eq("id", entityId)
      .maybeSingle();

    if (entityResult.error) {
      throw new Error(entityResult.error.message);
    }

    if (!entityResult.data) {
      return { entity: null };
    }

    const domainId = entityResult.data.domain_id;
    const refs = await referenceLookups(domainId);
    const [aliasesResult, claimsResult, relationshipsResult] = await Promise.all([
      supabase
        .from("entity_aliases")
        .select("id,alias,normalized_alias,status_id,source_document_id")
        .eq("entity_id", entityId),
      supabase
        .from("claims")
        .select("id,type_id,kind_id,status_id,claim_text,target_entity_ids,source_document_id")
        .eq("domain_id", domainId)
        .contains("target_entity_ids", [entityId])
        .order("updated_at", { ascending: false }),
      supabase
        .from("relationships")
        .select("id,type_id,kind_id,status_id,source_class_id,source_record_id,target_class_id,target_record_id,label")
        .eq("domain_id", domainId)
        .or(`source_record_id.eq.${entityId},target_record_id.eq.${entityId}`)
        .order("updated_at", { ascending: false }),
    ]);
    const error =
      aliasesResult.error?.message ??
      claimsResult.error?.message ??
      relationshipsResult.error?.message ??
      null;

    if (error) {
      throw new Error(error);
    }

    const entity = entityResult.data as unknown as TableRow;
    const relationships = (relationshipsResult.data ?? []) as unknown as TableRow[];

    return {
      aliases: aliasesResult.data ?? [],
      claims: compactRows((claimsResult.data ?? []) as unknown as TableRow[], [
        "id",
        "claim_text",
        "target_entity_ids",
        "source_document_id",
      ]),
      entity: {
        id: rowString(entity, "id"),
        kind: labelFor(refs.kindLabels, entity.kind_id),
        label: rowTitle(entity),
        slug: rowString(entity, "slug"),
        status: labelFor(refs.statusLabels, entity.status_id),
        type: labelFor(refs.typeLabels, entity.type_id),
      },
      relationships: relationships.map((row) => ({
        direction: rowString(row, "source_record_id") === entityId ? "outgoing" : "incoming",
        id: rowString(row, "id"),
        label: rowString(row, "label"),
        sourceClass: labelFor(refs.classLabels, row.source_class_id),
        sourceRecordId: rowString(row, "source_record_id"),
        targetClass: labelFor(refs.classLabels, row.target_class_id),
        targetRecordId: rowString(row, "target_record_id"),
        type: labelFor(refs.typeLabels, row.type_id),
      })),
    };
  },
});
