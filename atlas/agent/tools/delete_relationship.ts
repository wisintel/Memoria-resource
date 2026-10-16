import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient } from "../lib/supabase-client";

const deleteRelationshipSchema = z.object({
  relationshipId: z.string().min(1),
});

export default defineTool({
  description:
    "Delete an existing Atlas relationship by ID. Use only when the user clearly asks to remove/delete that relationship and the exact relationship ID has been resolved.",
  inputSchema: deleteRelationshipSchema,
  outputSchema: z.object({
    error: z.string().nullable(),
    ok: z.boolean(),
    relationshipId: z.string(),
  }),
  async execute({ relationshipId }) {
    const cleanRelationshipId = relationshipId.trim();
    const supabase = createSupabaseClient();

    try {
      const { data: relationship, error: lookupError } = await supabase
        .from("relationships")
        .select("id")
        .eq("id", cleanRelationshipId)
        .maybeSingle();

      if (lookupError) {
        return failed(lookupError.message, cleanRelationshipId);
      }

      if (!relationship?.id) {
        return failed("Relationship was not found.", cleanRelationshipId);
      }

      const { error } = await supabase
        .from("relationships")
        .delete()
        .eq("id", cleanRelationshipId);

      return {
        error: error?.message ?? null,
        ok: !error,
        relationshipId: cleanRelationshipId,
      };
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error), cleanRelationshipId);
    }
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: output,
    };
  },
});

function failed(error: string, relationshipId: string) {
  return {
    error,
    ok: false,
    relationshipId,
  };
}
