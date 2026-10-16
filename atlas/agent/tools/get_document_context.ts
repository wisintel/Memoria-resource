import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { boundedLimit, compactRows, labelFor, referenceLookups, rowString, rowStringArray, rowTitle } from "../lib/atlas-read-model";

function rowNumber(row: TableRow | null | undefined, key: string) {
  const value = row?.[key];

  return typeof value === "number" ? value : null;
}

function excerpt(value: string, maxLength = 1200) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

export default defineTool({
  description: "Read one Atlas document with document metadata, text shards, and claims linked to the document.",
  inputSchema: z.object({
    documentId: z.string().min(1),
    includeClaims: z.boolean().optional(),
    shardLimit: z.number().int().positive().optional(),
  }),
  async execute({ documentId, includeClaims = true, shardLimit }) {
    const rowLimit = boundedLimit(shardLimit);
    const supabase = createSupabaseClient();
    const documentResult = await supabase
      .from("documents")
      .select(
        "id,domain_id,type_id,kind_id,label,title,source_type,status,source_filename,source_url,mime_type,size_bytes,shard_count,error_message,created_at,updated_at",
      )
      .eq("id", documentId)
      .maybeSingle();

    if (documentResult.error) {
      throw new Error(documentResult.error.message);
    }

    if (!documentResult.data) {
      return { document: null };
    }

    const document = documentResult.data as unknown as TableRow;
    const domainId = rowString(document, "domain_id");
    const refs = await referenceLookups(domainId);
    const shardsResult = await supabase
      .from("document_shards")
      .select("id,document_id,position,heading_path,body,size_bytes,created_at,updated_at")
      .eq("document_id", documentId)
      .order("position", { ascending: true })
      .limit(rowLimit);

    if (shardsResult.error) {
      throw new Error(shardsResult.error.message);
    }

    const claimsResult = includeClaims
      ? await supabase
          .from("claims")
          .select("id,type_id,kind_id,status_id,label,claim_text,target_entity_ids,source_document_id,updated_at")
          .eq("source_document_id", documentId)
          .order("updated_at", { ascending: false })
          .limit(rowLimit)
      : null;

    if (claimsResult?.error) {
      throw new Error(claimsResult.error.message);
    }

    const claimRows = (claimsResult?.data ?? []) as unknown as TableRow[];
    const claims = compactRows(claimRows, ["id", "claim_text", "target_entity_ids", "source_document_id"]).map((row, index) => ({
      ...row,
      kind: labelFor(refs.kindLabels, claimRows[index]?.kind_id),
      status: labelFor(refs.statusLabels, claimRows[index]?.status_id),
      type: labelFor(refs.typeLabels, claimRows[index]?.type_id),
    }));

    return {
      claims,
      document: {
        errorMessage: rowString(document, "error_message"),
        id: rowString(document, "id"),
        kind: labelFor(refs.kindLabels, document.kind_id),
        label: rowTitle(document),
        mimeType: rowString(document, "mime_type"),
        shardCount: rowNumber(document, "shard_count"),
        sizeBytes: rowNumber(document, "size_bytes"),
        sourceFilename: rowString(document, "source_filename"),
        sourceType: rowString(document, "source_type"),
        sourceUrl: rowString(document, "source_url"),
        status: rowString(document, "status"),
        title: rowString(document, "title"),
        type: labelFor(refs.typeLabels, document.type_id),
        updatedAt: rowString(document, "updated_at"),
      },
      returnedShardLimit: rowLimit,
      shards: ((shardsResult.data ?? []) as unknown as TableRow[]).map((row) => ({
        bodyExcerpt: excerpt(rowString(row, "body")),
        headingPath: rowStringArray(row, "heading_path"),
        id: rowString(row, "id"),
        position: rowNumber(row, "position"),
        sizeBytes: rowNumber(row, "size_bytes"),
      })),
    };
  },
});
