import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { boundedLimit, compactRows, labelFor, referenceLookups } from "../lib/atlas-read-model";

export default defineTool({
  description: "Search Atlas claims in a domain by text and optionally constrain them to a target entity.",
  inputSchema: z.object({
    domainId: z.string().min(1),
    limit: z.number().int().positive().optional(),
    query: z.string().optional(),
    targetEntityId: z.string().optional(),
  }),
  async execute({ domainId, limit, query, targetEntityId }) {
    const rowLimit = boundedLimit(limit);
    const refs = await referenceLookups(domainId);
    let request = createSupabaseClient()
      .from("claims")
      .select("id,type_id,kind_id,status_id,label,claim_text,target_entity_ids,source_document_id,created_at,updated_at")
      .eq("domain_id", domainId)
      .order("updated_at", { ascending: false })
      .limit(rowLimit);

    if (query?.trim()) {
      request = request.ilike("claim_text", `%${query.trim()}%`);
    }

    if (targetEntityId?.trim()) {
      request = request.contains("target_entity_ids", [targetEntityId.trim()]);
    }

    const { data, error } = await request;

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as unknown as TableRow[];

    return {
      claims: compactRows(rows, ["id", "claim_text", "target_entity_ids", "source_document_id"]).map((row, index) => ({
        ...row,
        kind: labelFor(refs.kindLabels, rows[index]?.kind_id),
        status: labelFor(refs.statusLabels, rows[index]?.status_id),
        type: labelFor(refs.typeLabels, rows[index]?.type_id),
      })),
    };
  },
});
