import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { boundedLimit, labelFor, referenceLookups, rowString, rowTitle } from "../lib/atlas-read-model";

function rowNumber(row: TableRow | null | undefined, key: string) {
  const value = row?.[key];

  return typeof value === "number" ? value : null;
}

function queryPattern(query: string) {
  return `%${query.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export default defineTool({
  description: "List Atlas documents in a domain by title, label, or source filename.",
  inputSchema: z.object({
    domainId: z.string().min(1),
    limit: z.number().int().positive().optional(),
    query: z.string().optional(),
  }),
  async execute({ domainId, limit, query }) {
    const rowLimit = boundedLimit(limit);
    const refs = await referenceLookups(domainId);
    let request = createSupabaseClient()
      .from("documents")
      .select(
        "id,domain_id,type_id,kind_id,label,title,source_type,status,source_filename,source_url,mime_type,size_bytes,shard_count,error_message,created_at,updated_at",
        { count: "exact" },
      )
      .eq("domain_id", domainId)
      .order("updated_at", { ascending: false })
      .limit(rowLimit);

    if (query?.trim()) {
      const pattern = queryPattern(query);
      request = request.or(`label.ilike.${pattern},title.ilike.${pattern},source_filename.ilike.${pattern}`);
    }

    const { count, data, error } = await request;

    if (error) {
      throw new Error(error.message);
    }

    return {
      count: count ?? null,
      documents: ((data ?? []) as unknown as TableRow[]).map((row) => ({
        errorMessage: rowString(row, "error_message"),
        id: rowString(row, "id"),
        kind: labelFor(refs.kindLabels, row.kind_id),
        label: rowTitle(row),
        mimeType: rowString(row, "mime_type"),
        shardCount: rowNumber(row, "shard_count"),
        sizeBytes: rowNumber(row, "size_bytes"),
        sourceFilename: rowString(row, "source_filename"),
        sourceType: rowString(row, "source_type"),
        sourceUrl: rowString(row, "source_url"),
        status: rowString(row, "status"),
        title: rowString(row, "title"),
        type: labelFor(refs.typeLabels, row.type_id),
        updatedAt: rowString(row, "updated_at"),
      })),
      returnedRowLimit: rowLimit,
    };
  },
});
