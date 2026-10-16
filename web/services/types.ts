import { and, eq, sql } from "drizzle-orm";
import { db } from "@/data/client";
import { classes, domains, types } from "@/data/schema";
import { getClassByKey } from "@/data/queries/registry";
import {
  createTypeInput,
  editableTypeClassValues,
  parseTypeMetadata,
  updateTypeInput,
  type CreateTypeInput,
  type EditableTypeClassKey,
  type TypeDetail,
  type TypeFormOptions,
  type UpdateTypeInput,
} from "@/domain/types";
import { slugify } from "@/lib/slug";
import { getDomainBySlug } from "@/services/domains";
import { err, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";

type TypeDetailRow = {
  classKey: string;
  classLabel: string;
  description: string | null;
  domainSlug: string;
  id: string;
  label: string;
  metadata: unknown;
  slug: string;
};

function validationError(details: unknown) {
  return err("invalid_input", "Type input is invalid", details);
}

function pgErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  if ("code" in error) {
    return String(error.code);
  }

  if ("cause" in error) {
    return pgErrorCode(error.cause);
  }

  return null;
}

function isEditableTypeClassKey(value: string): value is EditableTypeClassKey {
  return editableTypeClassValues.includes(value as EditableTypeClassKey);
}

async function getEditableTypeClass(classKey: EditableTypeClassKey) {
  return getClassByKey(classKey);
}

function metadataWithCaptureGuidance(
  existing: unknown,
  captureGuidance: string | undefined
) {
  const base =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const cleanGuidance = captureGuidance?.trim();

  if (cleanGuidance) {
    return {
      ...base,
      captureGuidance: cleanGuidance,
    };
  }

  delete (base as { captureGuidance?: unknown }).captureGuidance;

  return base;
}

function toTypeDetail(row: TypeDetailRow): TypeDetail | null {
  if (!isEditableTypeClassKey(row.classKey)) {
    return null;
  }

  const metadata = parseTypeMetadata(row.metadata);

  return {
    captureGuidance: metadata.captureGuidance ?? "",
    classKey: row.classKey,
    classLabel: row.classLabel,
    description: row.description ?? "",
    id: row.id,
    label: row.label,
    slug: row.slug,
  };
}

export async function getTypeFormOptions(): Promise<TypeFormOptions> {
  const rows = await db
    .select({
      id: classes.key,
      label: classes.label,
    })
    .from(classes)
    .where(sql`${classes.key} in ('subject', 'claim', 'relationship')`)
    .orderBy(sql`
      case ${classes.key}
        when 'subject' then 1
        when 'claim' then 2
        when 'relationship' then 3
        else 100
      end
    `);

  return {
    classes: rows.flatMap((row) =>
      isEditableTypeClassKey(row.id)
        ? [{ id: row.id, label: row.label }]
        : []
    ),
  };
}

export async function getTypeDetail(
  id: string,
  domainSlug: string
): Promise<TypeDetail | null> {
  const [row] = (await db.execute(sql`
    select
      types.id,
      types.slug,
      types.label,
      types.description,
      types.metadata,
      classes.key as "classKey",
      classes.label as "classLabel",
      domains.slug as "domainSlug"
    from types
    join classes on classes.id = types.class_id
    join domains on domains.id = types.domain_id
    where types.id = ${id}
      and domains.slug = ${domainSlug}
      and classes.key in ('subject', 'claim', 'relationship')
    limit 1
  `)) as unknown as TypeDetailRow[];

  return row ? toTypeDetail(row) : null;
}

export async function createType(
  domainSlug: string,
  input: CreateTypeInput
): Promise<CommandResult<TypeDetail>> {
  const parsed = createTypeInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const [domain, typeClass] = await Promise.all([
    getDomainBySlug(domainSlug),
    getEditableTypeClass(parsed.data.classKey),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!typeClass) {
    return err("registry_missing", "Type class is missing from the registry", {
      classKey: parsed.data.classKey,
    });
  }

  const slug = parsed.data.slug?.trim() || slugify(parsed.data.label);

  if (!slug) {
    return err("invalid_input", "Type slug could not be derived");
  }

  try {
    const [created] = await db
      .insert(types)
      .values({
        classId: typeClass.id,
        description: parsed.data.description ?? null,
        domainId: domain.id,
        label: parsed.data.label,
        metadata: metadataWithCaptureGuidance(
          {},
          parsed.data.captureGuidance
        ),
        slug,
      })
      .returning({ id: types.id });

    if (!created) {
      return err("type_create_failed", "Type could not be created");
    }

    const detail = await getTypeDetail(created.id, domainSlug);

    if (!detail) {
      return err("not_found", "Type was not found", { id: created.id });
    }

    return ok(detail);
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return err("slug_taken", "A type with this slug already exists", {
        slug,
      });
    }

    throw error;
  }
}

export async function updateType(
  id: string,
  domainSlug: string,
  input: UpdateTypeInput
): Promise<CommandResult<TypeDetail>> {
  const parsed = updateTypeInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const current = await getTypeDetail(id, domainSlug);

  if (!current) {
    return err("not_found", "Type was not found", { id });
  }

  const updates: Partial<typeof types.$inferInsert> = {};

  if (parsed.data.label !== undefined) {
    updates.label = parsed.data.label;
  }

  if (parsed.data.slug !== undefined) {
    updates.slug = parsed.data.slug;
  }

  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description || null;
  }

  if (parsed.data.captureGuidance !== undefined) {
    const [row] = await db
      .select({ metadata: types.metadata })
      .from(types)
      .where(eq(types.id, id))
      .limit(1);

    updates.metadata = metadataWithCaptureGuidance(
      row?.metadata,
      parsed.data.captureGuidance
    );
  }

  if (Object.keys(updates).length === 0) {
    return ok(current);
  }

  try {
    await db.update(types).set(updates).where(eq(types.id, id));
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return err("slug_taken", "A type with this slug already exists", {
        slug: updates.slug,
      });
    }

    throw error;
  }

  const detail = await getTypeDetail(id, domainSlug);

  if (!detail) {
    return err("not_found", "Type was not found", { id });
  }

  return ok(detail);
}

export async function isDomainScopedType(id: string, domainSlug: string) {
  const [row] = await db
    .select({ id: types.id })
    .from(types)
    .innerJoin(domains, eq(domains.id, types.domainId))
    .where(and(eq(types.id, id), eq(domains.slug, domainSlug)))
    .limit(1);

  return Boolean(row);
}
