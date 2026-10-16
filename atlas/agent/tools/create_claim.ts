import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient } from "../lib/supabase-client";

const createClaimSchema = z.object({
  claimText: z.string().min(1),
  domainId: z.string().min(1),
  kindId: z.string().optional(),
  sourceDocumentId: z.string().optional(),
  statusId: z.string().optional(),
  targetEntityIds: z.array(z.string().min(1)).min(1),
  typeId: z.string().min(1),
});

export default defineTool({
  description:
    "Create a real Atlas claim in a domain. Use only after the user clearly asks to create/add/save the claim, and resolve target entities, claim type, and optional source document first.",
  inputSchema: createClaimSchema,
  outputSchema: z.object({
    claimId: z.string().nullable(),
    error: z.string().nullable(),
    ok: z.boolean(),
  }),
  async execute(input) {
    const claimText = input.claimText.trim();
    const now = Date.now();

    try {
      const { data, error } = await createSupabaseClient()
        .from("claims")
        .insert({
          claim_text: claimText,
          created_at: now,
          domain_id: input.domainId.trim(),
          kind_id: cleanNullableId(input.kindId),
          source_document_id: cleanNullableId(input.sourceDocumentId),
          status_id: cleanNullableId(input.statusId),
          target_entity_ids: cleanStringArray(input.targetEntityIds),
          type_id: input.typeId.trim(),
          updated_at: now,
        })
        .select("id")
        .single();

      return {
        claimId: data?.id ?? null,
        error: error?.message ?? null,
        ok: !error,
      };
    } catch (error) {
      return {
        claimId: null,
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      };
    }
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: output,
    };
  },
});

function cleanNullableId(value: string | null | undefined) {
  return value?.trim() || null;
}

function cleanStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
