import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/data/client";
import { getDomainMemberObject } from "@/data/queries/canonical-objects";
import {
  getClassByKey,
  getDefaultStatusForClass,
} from "@/data/queries/registry";
import { lexicalizations, statuses } from "@/data/schema";
import {
  createLexicalizationInput,
  type CreateLexicalizationInput,
  type LexicalizationDetail,
  updateLexicalizationInput,
  type UpdateLexicalizationInput,
} from "@/domain/lexicalizations";
import { slugify } from "@/lib/slug";
import { getDomainBySlug } from "@/services/domains";
import { err, ok, type CommandResult } from "@/services/result";

type LexicalizationRow = {
  createdAt: Date;
  domainId: string | null;
  id: string;
  language: string;
  lexicalType: string;
  metadata: unknown;
  normalizedValue: string;
  objectId: string;
  statusId: string | null;
  statusKey: string | null;
  statusLabel: string | null;
  updatedAt: Date;
  value: string;
};

function validationError(details: unknown) {
  return err("invalid_input", "Lexicalization input is invalid", details);
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeLexicalValue(value: string) {
  return slugify(value);
}

function normalizeLanguage(value: string) {
  return value.trim().toLowerCase();
}

function timestampIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toLexicalizationDetail(row: LexicalizationRow): LexicalizationDetail {
  return {
    createdAt: timestampIso(row.createdAt),
    domainId: row.domainId,
    id: row.id,
    language: row.language,
    lexicalType: row.lexicalType,
    metadata: cleanMetadata(row.metadata),
    normalizedValue: row.normalizedValue,
    objectId: row.objectId,
    status:
      row.statusId && row.statusKey && row.statusLabel
        ? {
            id: row.statusId,
            key: row.statusKey,
            label: row.statusLabel,
          }
        : null,
    statusId: row.statusId,
    updatedAt: timestampIso(row.updatedAt),
    value: row.value,
  };
}

async function getLexicalizationClass() {
  return getClassByKey("lexicalization");
}

async function getLexicalizationStatus(statusId: string | undefined) {
  if (!statusId) {
    return null;
  }

  const lexicalizationClass = await getLexicalizationClass();

  if (!lexicalizationClass) {
    return null;
  }

  const [status] = await db
    .select()
    .from(statuses)
    .where(
      and(
        eq(statuses.id, statusId),
        eq(statuses.classId, lexicalizationClass.id)
      )
    )
    .limit(1);

  return status ?? null;
}

async function getScopedDomainMember(domainSlug: string, objectId: string) {
  return getDomainMemberObject({ domainSlug, objectId });
}

async function getScopedLexicalization(
  id: string,
  domainSlug: string
): Promise<LexicalizationDetail | null> {
  const domain = await getDomainBySlug(domainSlug);

  if (!domain) {
    return null;
  }

  const [row] = (await db.execute(sql`
    select
      lexicalizations.id,
      lexicalizations.object_id as "objectId",
      lexicalizations.lexical_type as "lexicalType",
      lexicalizations.value,
      lexicalizations.normalized_value as "normalizedValue",
      lexicalizations.language,
      lexicalizations.domain_id as "domainId",
      lexicalizations.status_id as "statusId",
      lexicalization_statuses.key as "statusKey",
      lexicalization_statuses.label as "statusLabel",
      lexicalizations.metadata,
      lexicalizations.created_at as "createdAt",
      lexicalizations.updated_at as "updatedAt"
    from lexicalizations
    join object_domain_memberships memberships
      on memberships.object_id = lexicalizations.object_id
    left join statuses lexicalization_statuses
      on lexicalization_statuses.id = lexicalizations.status_id
    where lexicalizations.id = ${id}
      and memberships.domain_id = ${domain.id}
      and memberships.membership_state = 'member'
      and (
        lexicalizations.domain_id is null
        or lexicalizations.domain_id = ${domain.id}
      )
    limit 1
  `)) as unknown as LexicalizationRow[];

  return row ? toLexicalizationDetail(row) : null;
}

async function findDuplicateLexicalization({
  domainId,
  excludeId,
  language,
  lexicalType,
  normalizedValue,
  objectId,
}: {
  domainId: string;
  excludeId?: string;
  language: string;
  lexicalType: string;
  normalizedValue: string;
  objectId: string;
}) {
  const [duplicate] = await db
    .select({ id: lexicalizations.id })
    .from(lexicalizations)
    .where(
      and(
        eq(lexicalizations.objectId, objectId),
        eq(lexicalizations.domainId, domainId),
        eq(lexicalizations.lexicalType, lexicalType),
        eq(lexicalizations.normalizedValue, normalizedValue),
        eq(lexicalizations.language, language),
        excludeId ? ne(lexicalizations.id, excludeId) : undefined
      )
    )
    .limit(1);

  return duplicate ?? null;
}

export async function listObjectLexicalizations(
  domainSlug: string,
  objectId: string
): Promise<CommandResult<LexicalizationDetail[]>> {
  const [domain, object] = await Promise.all([
    getDomainBySlug(domainSlug),
    getScopedDomainMember(domainSlug, objectId),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!object) {
    return err("not_found", "Object was not found in this domain", {
      objectId,
    });
  }

  const rows = (await db.execute(sql`
    select
      lexicalizations.id,
      lexicalizations.object_id as "objectId",
      lexicalizations.lexical_type as "lexicalType",
      lexicalizations.value,
      lexicalizations.normalized_value as "normalizedValue",
      lexicalizations.language,
      lexicalizations.domain_id as "domainId",
      lexicalizations.status_id as "statusId",
      lexicalization_statuses.key as "statusKey",
      lexicalization_statuses.label as "statusLabel",
      lexicalizations.metadata,
      lexicalizations.created_at as "createdAt",
      lexicalizations.updated_at as "updatedAt"
    from lexicalizations
    left join statuses lexicalization_statuses
      on lexicalization_statuses.id = lexicalizations.status_id
    where lexicalizations.object_id = ${objectId}
      and (
        lexicalizations.domain_id is null
        or lexicalizations.domain_id = ${domain.id}
      )
    order by lower(lexicalizations.lexical_type), lower(lexicalizations.value), lexicalizations.id
  `)) as unknown as LexicalizationRow[];

  return ok(rows.map(toLexicalizationDetail));
}

export async function createLexicalization(
  domainSlug: string,
  input: CreateLexicalizationInput
): Promise<CommandResult<LexicalizationDetail>> {
  const parsed = createLexicalizationInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const normalizedValue = normalizeLexicalValue(parsed.data.value);

  if (!normalizedValue) {
    return err("invalid_input", "Lexicalization value cannot be normalized");
  }

  const [domain, lexicalizationClass, object] = await Promise.all([
    getDomainBySlug(domainSlug),
    getLexicalizationClass(),
    getScopedDomainMember(domainSlug, parsed.data.objectId),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!lexicalizationClass) {
    return err(
      "registry_missing",
      "Lexicalization class is missing from the registry"
    );
  }

  if (!object) {
    return err("invalid_input", "Object was not found in this domain", {
      objectId: parsed.data.objectId,
    });
  }

  const requestedStatus = await getLexicalizationStatus(parsed.data.statusId);

  if (parsed.data.statusId && !requestedStatus) {
    return err("invalid_input", "Lexicalization status is invalid", {
      statusId: parsed.data.statusId,
    });
  }

  const defaultStatus = await getDefaultStatusForClass(lexicalizationClass.id);
  const statusId = requestedStatus?.id ?? defaultStatus?.id ?? null;
  const language = normalizeLanguage(parsed.data.language);
  const duplicate = await findDuplicateLexicalization({
    domainId: domain.id,
    language,
    lexicalType: parsed.data.lexicalType,
    normalizedValue,
    objectId: parsed.data.objectId,
  });

  if (duplicate) {
    return err("conflict", "Lexicalization already exists", {
      id: duplicate.id,
    });
  }

  const [row] = await db
    .insert(lexicalizations)
    .values({
      domainId: domain.id,
      language,
      lexicalType: parsed.data.lexicalType,
      metadata: parsed.data.metadata ?? {},
      normalizedValue,
      objectId: parsed.data.objectId,
      statusId,
      value: parsed.data.value,
    })
    .returning({ id: lexicalizations.id });

  if (!row) {
    return err("write_failed", "Lexicalization was not created");
  }

  const detail = await getScopedLexicalization(row.id, domainSlug);

  if (!detail) {
    return err("not_found", "Lexicalization was not found", { id: row.id });
  }

  return ok(detail);
}

export async function updateLexicalization(
  id: string,
  domainSlug: string,
  input: UpdateLexicalizationInput
): Promise<CommandResult<LexicalizationDetail>> {
  const parsed = updateLexicalizationInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const current = await getScopedLexicalization(id, domainSlug);

  if (!current) {
    return err("not_found", "Lexicalization was not found", { id });
  }

  const domain = await getDomainBySlug(domainSlug);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  const updates: Partial<typeof lexicalizations.$inferInsert> = {};
  const nextValue = parsed.data.value ?? current.value;
  const nextNormalizedValue = normalizeLexicalValue(nextValue);
  const nextLanguage = parsed.data.language
    ? normalizeLanguage(parsed.data.language)
    : current.language;
  const nextLexicalType = parsed.data.lexicalType ?? current.lexicalType;

  if (!nextNormalizedValue) {
    return err("invalid_input", "Lexicalization value cannot be normalized");
  }

  const duplicate = await findDuplicateLexicalization({
    domainId: domain.id,
    excludeId: id,
    language: nextLanguage,
    lexicalType: nextLexicalType,
    normalizedValue: nextNormalizedValue,
    objectId: current.objectId,
  });

  if (duplicate) {
    return err("conflict", "Lexicalization already exists", {
      id: duplicate.id,
    });
  }

  if (parsed.data.value !== undefined) {
    updates.value = parsed.data.value;
    updates.normalizedValue = nextNormalizedValue;
  }

  if (parsed.data.language !== undefined) {
    updates.language = nextLanguage;
  }

  if (parsed.data.lexicalType !== undefined) {
    updates.lexicalType = nextLexicalType;
  }

  if (parsed.data.metadata !== undefined) {
    updates.metadata = parsed.data.metadata;
  }

  if (parsed.data.statusId !== undefined) {
    const status = await getLexicalizationStatus(parsed.data.statusId);

    if (!status) {
      return err("invalid_input", "Lexicalization status is invalid", {
        statusId: parsed.data.statusId,
      });
    }

    updates.statusId = status.id;
  }

  if (Object.keys(updates).length > 0) {
    const [row] = await db
      .update(lexicalizations)
      .set(updates)
      .where(eq(lexicalizations.id, id))
      .returning({ id: lexicalizations.id });

    if (!row) {
      return err("not_found", "Lexicalization was not found", { id });
    }
  }

  const detail = await getScopedLexicalization(id, domainSlug);

  if (!detail) {
    return err("not_found", "Lexicalization was not found", { id });
  }

  return ok(detail);
}

export async function deleteLexicalization(
  id: string,
  domainSlug: string
): Promise<CommandResult<{ id: string }>> {
  const current = await getScopedLexicalization(id, domainSlug);

  if (!current) {
    return err("not_found", "Lexicalization was not found", { id });
  }

  const [row] = await db
    .delete(lexicalizations)
    .where(eq(lexicalizations.id, id))
    .returning({ id: lexicalizations.id });

  if (!row) {
    return err("not_found", "Lexicalization was not found", { id });
  }

  return ok({ id: row.id });
}
