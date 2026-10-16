import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient } from "../lib/supabase-client";

const createEntitySchema = z.object({
  domainId: z.string().min(1),
  kindId: z.string().optional(),
  label: z.string().min(1),
  statusId: z.string().optional(),
  typeId: z.string().min(1),
});

export default defineTool({
  description:
    "Create a real Atlas entity in a domain. Use only after the user clearly asks to create/add/save the entity, and search existing entities first when the label might already exist.",
  inputSchema: createEntitySchema,
  outputSchema: z.object({
    entityId: z.string().nullable(),
    error: z.string().nullable(),
    label: z.string(),
    ok: z.boolean(),
  }),
  async execute(input) {
    const label = input.label.trim();
    const now = Date.now();

    try {
      const { data, error } = await createSupabaseClient()
        .from("entities")
        .insert({
          created_at: now,
          domain_id: input.domainId.trim(),
          kind_id: cleanNullableId(input.kindId),
          label,
          slug: slugify(label),
          status_id: cleanNullableId(input.statusId),
          type_id: input.typeId.trim(),
          updated_at: now,
        })
        .select("id")
        .single();

      return {
        entityId: data?.id ?? null,
        error: error?.message ?? null,
        label,
        ok: !error,
      };
    } catch (error) {
      return {
        entityId: null,
        error: error instanceof Error ? error.message : String(error),
        label,
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanNullableId(value: string | null | undefined) {
  return value?.trim() || null;
}
