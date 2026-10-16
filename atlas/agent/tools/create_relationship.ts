import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient } from "../lib/supabase-client";

const createRelationshipSchema = z.object({
  domainId: z.string().min(1),
  kindId: z.string().optional(),
  sourceClassId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  statusId: z.string().optional(),
  targetClassId: z.string().min(1),
  targetRecordId: z.string().min(1),
  typeId: z.string().min(1),
});

export default defineTool({
  description:
    "Create a real Atlas relationship between two existing records. Use only after the user clearly asks to create/add/save the relationship, and resolve source, target, relationship type, and optional status first.",
  inputSchema: createRelationshipSchema,
  outputSchema: z.object({
    error: z.string().nullable(),
    ok: z.boolean(),
    relationshipId: z.string().nullable(),
  }),
  async execute(input) {
    const now = Date.now();

    try {
      const { data, error } = await createSupabaseClient()
        .from("relationships")
        .insert({
          created_at: now,
          domain_id: input.domainId.trim(),
          kind_id: cleanNullableId(input.kindId),
          source_class_id: input.sourceClassId.trim(),
          source_record_id: input.sourceRecordId.trim(),
          status_id: cleanNullableId(input.statusId),
          target_class_id: input.targetClassId.trim(),
          target_record_id: input.targetRecordId.trim(),
          type_id: input.typeId.trim(),
          updated_at: now,
        })
        .select("id")
        .single();

      return {
        error: error?.message ?? null,
        ok: !error,
        relationshipId: data?.id ?? null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        relationshipId: null,
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
