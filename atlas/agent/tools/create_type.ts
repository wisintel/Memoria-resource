import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient } from "../lib/supabase-client";

const supportedClassTables = ["entities", "claims", "relationships"] as const;

const createTypeSchema = z.object({
  classTableName: z.enum(supportedClassTables),
  domainId: z.string().optional(),
  label: z.string().min(1),
  statusId: z.string().optional(),
});

export default defineTool({
  description:
    "Create a real Atlas ontology type for entities, claims, or relationships. Use only when the user explicitly asks to add/create/save a type.",
  inputSchema: createTypeSchema,
  outputSchema: z.object({
    classTableName: z.enum(supportedClassTables),
    error: z.string().nullable(),
    label: z.string(),
    ok: z.boolean(),
    typeId: z.string().nullable(),
  }),
  async execute(input) {
    const classTableName = input.classTableName;
    const label = input.label.trim();
    const supabase = createSupabaseClient();

    try {
      const { data: classRecord, error: classError } = await supabase
        .from("classes")
        .select("id")
        .eq("table_name", classTableName)
        .maybeSingle();

      if (classError || !classRecord?.id) {
        return {
          classTableName,
          error: classError?.message ?? `Class ${classTableName} was not found.`,
          label,
          ok: false,
          typeId: null,
        };
      }

      const slug = slugify(label);
      const domainId = cleanNullableId(input.domainId);
      const { data: existingTypes, error: existingError } = await supabase
        .from("types")
        .select("id,domain_id")
        .eq("class_id", classRecord.id)
        .eq("slug", slug)
        .limit(50);

      if (existingError) {
        return {
          classTableName,
          error: existingError.message,
          label,
          ok: false,
          typeId: null,
        };
      }

      const existingType = (existingTypes ?? []).find((type) =>
        domainId ? type.domain_id === null || type.domain_id === domainId : type.domain_id === null,
      );

      if (existingType?.id) {
        return {
          classTableName,
          error: null,
          label,
          ok: true,
          typeId: existingType.id,
        };
      }

      const now = Date.now();
      const { data, error } = await supabase
        .from("types")
        .insert({
          class_id: classRecord.id,
          created_at: now,
          domain_id: domainId,
          label,
          slug,
          status_id: cleanNullableId(input.statusId),
          updated_at: now,
        })
        .select("id")
        .single();

      return {
        classTableName,
        error: error?.message ?? null,
        label,
        ok: !error,
        typeId: data?.id ?? null,
      };
    } catch (error) {
      return {
        classTableName,
        error: error instanceof Error ? error.message : String(error),
        label,
        ok: false,
        typeId: null,
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
