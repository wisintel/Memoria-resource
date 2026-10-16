import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient } from "../lib/supabase-client";

const supportedTables = ["claims", "entities", "relationships"] as const;

const changeStatusSchema = z.object({
  recordId: z.string().min(1),
  statusId: z.string().min(1),
  tableName: z.enum(supportedTables),
});

export default defineTool({
  description:
    "Change the status of an existing Atlas entity, claim, or relationship. Use only after resolving the target record and a status that belongs to that record's class.",
  inputSchema: changeStatusSchema,
  outputSchema: z.object({
    error: z.string().nullable(),
    ok: z.boolean(),
    recordId: z.string(),
    statusId: z.string(),
    tableName: z.enum(supportedTables),
  }),
  async execute({ recordId, statusId, tableName }) {
    const supabase = createSupabaseClient();
    const now = Date.now();
    const { error } = await supabase
      .from(tableName)
      .update({
        status_id: statusId.trim(),
        updated_at: now,
      })
      .eq("id", recordId.trim());

    return {
      error: error?.message ?? null,
      ok: !error,
      recordId: recordId.trim(),
      statusId: statusId.trim(),
      tableName,
    };
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: output,
    };
  },
});
