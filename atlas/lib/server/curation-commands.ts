import {
  createSupabaseClient,
  type ClaimInsert,
  type DomainInsert,
  type EntityInsert,
  type EntityAliasInsert,
  type RelationshipInsert,
  type StatusInsert,
} from "../supabase/client";

export type CurationCommandResult = {
  error: string | null;
  id?: string | null;
  ok: boolean;
};

export type CreateEntityCommandInput = {
  description?: string | null;
  domainId: string;
  kindId?: string | null;
  label: string;
  now?: number;
  statusId?: string | null;
  typeId: string;
};

export type UpdateEntityCommandInput = CreateEntityCommandInput & {
  id: string;
};

export type CreateClaimCommandInput = {
  claimText: string;
  domainId: string;
  kindId?: string | null;
  now?: number;
  sourceDocumentId?: string | null;
  statusId?: string | null;
  targetEntityIds: string[];
  typeId: string;
};

export type UpdateClaimCommandInput = CreateClaimCommandInput & {
  id: string;
};

export type CreateRelationshipCommandInput = {
  domainId: string;
  kindId?: string | null;
  now?: number;
  sourceClassId: string;
  sourceRecordId: string;
  statusId?: string | null;
  targetClassId: string;
  targetRecordId: string;
  typeId: string;
};

export type UpdateRelationshipCommandInput = CreateRelationshipCommandInput & {
  id: string;
};

export type CreateSimpleCurationRecordCommandInput =
  | {
      coreEntityId?: string | null;
      domainTypeId?: string | null;
      label: string;
      now?: number;
      statusId?: string | null;
      tableName: "domains";
    }
  | {
      classId: string;
      label: string;
      now?: number;
      tableName: "statuses";
    }
  | {
      alias: string;
      domainId: string;
      entityId: string;
      now?: number;
      sourceDocumentId?: string | null;
      statusId?: string | null;
      tableName: "entity_aliases";
    };

export type UpdateSimpleCurationRecordCommandInput =
  CreateSimpleCurationRecordCommandInput & {
    id: string;
  };

export async function createEntityCommand(input: CreateEntityCommandInput): Promise<CurationCommandResult> {
  try {
    const now = input.now ?? Date.now();
    const insertPayload: EntityInsert = {
      created_at: now,
      description: cleanNullableText(input.description),
      domain_id: input.domainId,
      kind_id: cleanNullableId(input.kindId),
      label: input.label,
      slug: slugify(input.label),
      status_id: cleanNullableId(input.statusId),
      type_id: input.typeId,
      updated_at: now,
    };
    const { data, error } = await createSupabaseClient()
      .from("entities")
      .insert(insertPayload)
      .select("id")
      .single();

    return commandResult(error?.message ?? null, data?.id ?? null);
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function updateEntityCommand(input: UpdateEntityCommandInput): Promise<CurationCommandResult> {
  try {
    const { error } = await createSupabaseClient()
      .from("entities")
      .update({
        domain_id: input.domainId,
        description: cleanNullableText(input.description),
        kind_id: cleanNullableId(input.kindId),
        label: input.label,
        slug: slugify(input.label),
        status_id: cleanNullableId(input.statusId),
        type_id: input.typeId,
        updated_at: input.now ?? Date.now(),
      })
      .eq("id", input.id);

    return commandResult(error?.message ?? null);
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function createClaimCommand(input: CreateClaimCommandInput): Promise<CurationCommandResult> {
  try {
    const now = input.now ?? Date.now();
    const insertPayload: ClaimInsert = {
      claim_text: input.claimText,
      created_at: now,
      domain_id: input.domainId,
      kind_id: cleanNullableId(input.kindId),
      source_document_id: cleanNullableId(input.sourceDocumentId),
      status_id: cleanNullableId(input.statusId),
      target_entity_ids: cleanStringArray(input.targetEntityIds),
      type_id: input.typeId,
      updated_at: now,
    };
    const { data, error } = await createSupabaseClient()
      .from("claims")
      .insert(insertPayload)
      .select("id")
      .single();

    return commandResult(error?.message ?? null, data?.id ?? null);
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function updateClaimCommand(input: UpdateClaimCommandInput): Promise<CurationCommandResult> {
  try {
    const { error } = await createSupabaseClient()
      .from("claims")
      .update({
        claim_text: input.claimText,
        domain_id: input.domainId,
        kind_id: cleanNullableId(input.kindId),
        source_document_id: cleanNullableId(input.sourceDocumentId),
        status_id: cleanNullableId(input.statusId),
        target_entity_ids: cleanStringArray(input.targetEntityIds),
        type_id: input.typeId,
        updated_at: input.now ?? Date.now(),
      })
      .eq("id", input.id);

    return commandResult(error?.message ?? null);
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function createRelationshipCommand(
  input: CreateRelationshipCommandInput,
): Promise<CurationCommandResult> {
  try {
    const now = input.now ?? Date.now();
    const insertPayload: RelationshipInsert = {
      created_at: now,
      domain_id: input.domainId,
      kind_id: cleanNullableId(input.kindId),
      source_class_id: input.sourceClassId,
      source_record_id: input.sourceRecordId,
      status_id: cleanNullableId(input.statusId),
      target_class_id: input.targetClassId,
      target_record_id: input.targetRecordId,
      type_id: input.typeId,
      updated_at: now,
    };
    const { data, error } = await createSupabaseClient()
      .from("relationships")
      .insert(insertPayload)
      .select("id")
      .single();

    return commandResult(error?.message ?? null, data?.id ?? null);
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function updateRelationshipCommand(
  input: UpdateRelationshipCommandInput,
): Promise<CurationCommandResult> {
  try {
    const { error } = await createSupabaseClient()
      .from("relationships")
      .update({
        domain_id: input.domainId,
        kind_id: cleanNullableId(input.kindId),
        source_class_id: input.sourceClassId,
        source_record_id: input.sourceRecordId,
        status_id: cleanNullableId(input.statusId),
        target_class_id: input.targetClassId,
        target_record_id: input.targetRecordId,
        type_id: input.typeId,
        updated_at: input.now ?? Date.now(),
      })
      .eq("id", input.id);

    return commandResult(error?.message ?? null);
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function createSimpleCurationRecordCommand(
  input: CreateSimpleCurationRecordCommandInput,
): Promise<CurationCommandResult> {
  try {
    const now = input.now ?? Date.now();
    const supabase = createSupabaseClient();

    switch (input.tableName) {
      case "domains": {
        const statusId =
          cleanNullableId(input.statusId) ??
          (await statusIdForClassSlug(supabase, "domains", "active"));
        const insertPayload: DomainInsert = {
          core_entity_id: cleanNullableId(input.coreEntityId),
          created_at: now,
          domain_type_id: cleanNullableId(input.domainTypeId),
          label: input.label,
          slug: slugify(input.label),
          status_id: statusId,
          updated_at: now,
        };
        const { error } = await supabase.from("domains").insert(insertPayload);

        return commandResult(error?.message ?? null);
      }
      case "statuses": {
        const insertPayload: StatusInsert = {
          class_id: input.classId,
          created_at: now,
          label: input.label,
          slug: slugify(input.label),
          updated_at: now,
        };
        const { error } = await supabase.from("statuses").insert(insertPayload);

        return commandResult(error?.message ?? null);
      }
      case "entity_aliases": {
        const insertPayload: EntityAliasInsert = {
          alias: input.alias,
          created_at: now,
          domain_id: input.domainId,
          entity_id: input.entityId,
          source_document_id: cleanNullableId(input.sourceDocumentId),
          status_id: cleanNullableId(input.statusId),
          updated_at: now,
        };
        const { error } = await supabase.from("entity_aliases").insert(insertPayload);

        return commandResult(error?.message ?? null);
      }
    }
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function updateSimpleCurationRecordCommand(
  input: UpdateSimpleCurationRecordCommandInput,
): Promise<CurationCommandResult> {
  try {
    const now = input.now ?? Date.now();
    const supabase = createSupabaseClient();

    switch (input.tableName) {
      case "domains": {
        const statusId =
          cleanNullableId(input.statusId) ??
          (await statusIdForClassSlug(supabase, "domains", "active"));
        const { error } = await supabase
          .from("domains")
          .update({
            core_entity_id: cleanNullableId(input.coreEntityId),
            domain_type_id: cleanNullableId(input.domainTypeId),
            label: input.label,
            slug: slugify(input.label),
            status_id: statusId,
            updated_at: now,
          })
          .eq("id", input.id);

        return commandResult(error?.message ?? null);
      }
      case "statuses": {
        const { error } = await supabase
          .from("statuses")
          .update({
            class_id: input.classId,
            label: input.label,
            slug: slugify(input.label),
            updated_at: now,
          })
          .eq("id", input.id);

        return commandResult(error?.message ?? null);
      }
      case "entity_aliases": {
        const { error } = await supabase
          .from("entity_aliases")
          .update({
            alias: input.alias,
            domain_id: input.domainId,
            entity_id: input.entityId,
            source_document_id: cleanNullableId(input.sourceDocumentId),
            status_id: cleanNullableId(input.statusId),
            updated_at: now,
          })
          .eq("id", input.id);

        return commandResult(error?.message ?? null);
      }
    }
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

export async function deleteCurationRecordCommand(
  tableName: "claims" | "entities" | "relationships",
  id: string,
): Promise<CurationCommandResult> {
  try {
    const { error } = await createSupabaseClient().from(tableName).delete().eq("id", id);

    return commandResult(error?.message ?? null);
  } catch (error) {
    return commandResult(error instanceof Error ? error.message : String(error));
  }
}

function commandResult(error: string | null, id: string | null = null): CurationCommandResult {
  return {
    error,
    id,
    ok: error === null,
  };
}

async function statusIdForClassSlug(
  supabase: ReturnType<typeof createSupabaseClient>,
  tableName: string,
  slug: string,
) {
  const { data: classRecord } = await supabase
    .from("classes")
    .select("id")
    .eq("table_name", tableName)
    .maybeSingle();

  const classId = classRecord?.id;

  if (!classId) {
    return null;
  }

  const { data: statusRecord } = await supabase
    .from("statuses")
    .select("id")
    .eq("class_id", classId)
    .eq("slug", slug)
    .maybeSingle();

  return statusRecord?.id ?? null;
}

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

function cleanNullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function cleanStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
