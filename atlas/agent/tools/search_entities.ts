import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { boundedLimit, labelFor, referenceLookups, rowString, rowTitle } from "../lib/atlas-read-model";

export default defineTool({
  description: "Search Atlas entities in a domain by label or return recent entities when no query is provided.",
  inputSchema: z.object({
    domainId: z.string().min(1),
    limit: z.number().int().positive().optional(),
    query: z.string().optional(),
  }),
  async execute({ domainId, limit, query }) {
    const rowLimit = boundedLimit(limit);
    const refs = await referenceLookups(domainId);
    let request = createSupabaseClient()
      .from("entities")
      .select("id,label,slug,type_id,kind_id,status_id,created_at,updated_at")
      .eq("domain_id", domainId)
      .order("updated_at", { ascending: false })
      .limit(rowLimit);

    if (query?.trim()) {
      request = request.ilike("label", `%${query.trim()}%`);
    }

    const { data, error } = await request;

    if (error) {
      throw new Error(error.message);
    }

    return {
      entities: ((data ?? []) as unknown as TableRow[]).map((row) => ({
        id: rowString(row, "id"),
        kind: labelFor(refs.kindLabels, row.kind_id),
        label: rowTitle(row),
        slug: rowString(row, "slug"),
        status: labelFor(refs.statusLabels, row.status_id),
        type: labelFor(refs.typeLabels, row.type_id),
      })),
    };
  },
});
