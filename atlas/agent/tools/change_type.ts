import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient } from "../lib/supabase-client";

const supportedTables = ["claims", "entities", "relationships"] as const;

const changeTypeSchema = z.object({
  recordId: z.string().min(1),
  tableName: z.enum(supportedTables),
  typeId: z.string().min(1),
});

export default defineTool({
  description:
    "Assign an existing Atlas type to an existing entity, claim, or relationship. Use only after resolving a type that belongs to the same class as the target record.",
  inputSchema: changeTypeSchema,
  outputSchema: z.object({
    error: z.string().nullable(),
    ok: z.boolean(),
    recordId: z.string(),
    tableName: z.enum(supportedTables),
    typeId: z.string(),
  }),
  async execute({ recordId, tableName, typeId }) {
    const cleanRecordId = recordId.trim();
    const cleanTypeId = typeId.trim();
    const supabase = createSupabaseClient();

    try {
      const { data: classRecord, error: classError } = await supabase
        .from("classes")
        .select("id")
        .eq("table_name", tableName)
        .maybeSingle();

      if (classError || !classRecord?.id) {
        return {
          error: classError?.message ?? `Class ${tableName} was not found.`,
          ok: false,
          recordId: cleanRecordId,
          tableName,
          typeId: cleanTypeId,
        };
      }

      const { data: typeRecord, error: typeError } = await supabase
        .from("types")
        .select("id,class_id")
        .eq("id", cleanTypeId)
        .maybeSingle();

      if (typeError || !typeRecord?.id) {
        return {
          error: typeError?.message ?? "Type was not found.",
          ok: false,
          recordId: cleanRecordId,
          tableName,
          typeId: cleanTypeId,
        };
      }

      if (typeRecord.class_id !== classRecord.id) {
        return {
          error: `Type does not belong to ${tableName}.`,
          ok: false,
          recordId: cleanRecordId,
          tableName,
          typeId: cleanTypeId,
        };
      }

      const { error } = await supabase
        .from(tableName)
        .update({
          type_id: cleanTypeId,
          updated_at: Date.now(),
        })
        .eq("id", cleanRecordId);

      return {
        error: error?.message ?? null,
        ok: !error,
        recordId: cleanRecordId,
        tableName,
        typeId: cleanTypeId,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        recordId: cleanRecordId,
        tableName,
        typeId: cleanTypeId,
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
