import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/data/client";
import {
  statuses,
  subjects,
  types,
} from "@/data/schema";
import {
  createCanonicalObject,
  domainMemberExistsFilter,
} from "@/data/queries/canonical-objects";
import {
  getClassByKey,
  getDefaultStatusForClass,
} from "@/data/queries/registry";
import {
  createSubjectInput,
  updateSubjectInput,
  type SubjectAliasRelatedItem,
  type SubjectClaimRelatedItem,
  type CreateSubjectInput,
  type SubjectDetail,
  type SubjectFormOptions,
  type SubjectRelated,
  type SubjectRelationshipRelatedItem,
  type UpdateSubjectInput,
} from "@/domain/subjects";
import { getDomainBySlug } from "@/services/domains";
import { err, inputValidationError, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";
import { containsPattern } from "@/services/search-patterns";

type SubjectDetailRow = {
  canonicalLabel: string;
  description: string | null;
  id: string;
  source: string | null;
  statusId: string | null;
  statusKey: string | null;
  statusLabel: string | null;
  subjectTypeId: string | null;
  subjectTypeLabel: string | null;
};

type SubjectAliasRelatedRow = SubjectAliasRelatedItem;

type SubjectClaimRelatedRow = SubjectClaimRelatedItem;

type SubjectRelationshipRelatedRow = Omit<
  SubjectRelationshipRelatedItem,
  "direction"
> & {
  direction: string;
};

export type SubjectSearchItem = {
  description: string | null;
  id: string;
  label: string;
  statusLabel: string | null;
  typeLabel: string | null;
  updatedAt: Date;
};

async function getSubjectClass() {
  return getClassByKey("subject");
}

async function getSubjectStatus(statusId: string | undefined) {
  if (!statusId) {
    return null;
  }

  const subjectClass = await getSubjectClass();

  if (!subjectClass) {
    return null;
  }

  const [status] = await db
    .select()
    .from(statuses)
    .where(
      and(eq(statuses.id, statusId), eq(statuses.classId, subjectClass.id))
    )
    .limit(1);

  return status ?? null;
}

async function getSubjectType(subjectTypeId: string | undefined) {
  if (!subjectTypeId) {
    return null;
  }

  const subjectClass = await getSubjectClass();

  if (!subjectClass) {
    return null;
  }

  const [type] = await db
    .select()
    .from(types)
    .where(and(eq(types.id, subjectTypeId), eq(types.classId, subjectClass.id)))
    .limit(1);

  return type ?? null;
}

export async function createSubject(
  domainSlug: string,
  input: CreateSubjectInput
): Promise<CommandResult<SubjectDetail>> {
  const parsed = createSubjectInput.safeParse(input);

  if (!parsed.success) {
    return inputValidationError("Subject", parsed.error.flatten());
  }

  const [domain, subjectClass, subjectType] = await Promise.all([
    getDomainBySlug(domainSlug),
    getSubjectClass(),
    getSubjectType(parsed.data.subjectTypeId),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!subjectClass) {
    return err("registry_missing", "Subject class is missing from the registry");
  }

  if (!subjectType) {
    return err("invalid_input", "Subject type is invalid", {
      subjectTypeId: parsed.data.subjectTypeId,
    });
  }

  const requestedStatus = await getSubjectStatus(parsed.data.statusId);
  const defaultStatus = await getDefaultStatusForClass(subjectClass.id);
  const statusId = requestedStatus?.id ?? defaultStatus?.id ?? null;

  const { id: subjectId } = await createCanonicalObject({
    classId: subjectClass.id,
    domainId: domain.id,
    insertRecord: async (tx, objectId) => {
      await tx.insert(subjects).values({
        id: objectId,
        canonicalLabel: parsed.data.canonicalLabel,
        description: parsed.data.description ?? "",
        statusId,
        subjectTypeId: subjectType.id,
      });
    },
  });

  const detail = await getSubjectDetail(subjectId, domainSlug);

  if (!detail) {
    return err("not_found", "Subject was not found", { id: subjectId });
  }

  return ok(detail);
}

export async function updateSubject(
  id: string,
  input: UpdateSubjectInput
): Promise<CommandResult<SubjectDetail>> {
  const parsed = updateSubjectInput.safeParse(input);

  if (!parsed.success) {
    return inputValidationError("Subject", parsed.error.flatten());
  }

  const updates: Partial<typeof subjects.$inferInsert> = {};

  if (parsed.data.canonicalLabel !== undefined) {
    updates.canonicalLabel = parsed.data.canonicalLabel;
  }

  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }

  if (parsed.data.statusId !== undefined) {
    const status = await getSubjectStatus(parsed.data.statusId);

    if (!status) {
      return err("invalid_input", "Subject status is invalid", {
        statusId: parsed.data.statusId,
      });
    }

    updates.statusId = status.id;
  }

  if (parsed.data.subjectTypeId !== undefined) {
    const subjectType = await getSubjectType(parsed.data.subjectTypeId);

    if (!subjectType) {
      return err("invalid_input", "Subject type is invalid", {
        subjectTypeId: parsed.data.subjectTypeId,
      });
    }

    updates.subjectTypeId = subjectType.id;
  }

  if (Object.keys(updates).length > 0) {
    const [subject] = await db
      .update(subjects)
      .set(updates)
      .where(eq(subjects.id, id))
      .returning({ id: subjects.id });

    if (!subject) {
      return err("not_found", "Subject was not found", { id });
    }
  }

  const detail = await getSubjectDetail(id);

  if (!detail) {
    return err("not_found", "Subject was not found", { id });
  }

  return ok(detail);
}

export async function getSubjectDetail(
  id: string,
  domainSlug?: string
): Promise<SubjectDetail | null> {
  const domain = domainSlug ? await getDomainBySlug(domainSlug) : null;

  if (domainSlug && !domain) {
    return null;
  }

  const domainFilter = domain
    ? domainMemberExistsFilter(sql`subjects.id`, domain.id)
    : sql``;
  const [rows, related] = await Promise.all([
    db.execute(sql`
      select
        subjects.id,
        subjects.canonical_label as "canonicalLabel",
        subjects.description,
        subjects.source,
        subjects.subject_type_id as "subjectTypeId",
        subject_types.label as "subjectTypeLabel",
        subjects.status_id as "statusId",
        subject_statuses.key as "statusKey",
        subject_statuses.label as "statusLabel"
      from subjects
      left join types subject_types on subject_types.id = subjects.subject_type_id
      left join statuses subject_statuses on subject_statuses.id = subjects.status_id
      where subjects.id = ${id}
        ${domainFilter}
      limit 1
    `) as unknown as Promise<SubjectDetailRow[]>,
    getSubjectRelated(id, domain?.id),
  ]);
  const [row] = rows;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    canonicalLabel: row.canonicalLabel,
    description: row.description ?? "",
    related,
    source: row.source,
    status:
      row.statusId && row.statusKey && row.statusLabel
        ? {
            id: row.statusId,
            key: row.statusKey,
            label: row.statusLabel,
          }
        : null,
    statusId: row.statusId,
    subjectType:
      row.subjectTypeId && row.subjectTypeLabel
        ? {
            id: row.subjectTypeId,
            label: row.subjectTypeLabel,
          }
        : null,
    subjectTypeId: row.subjectTypeId,
  };
}

export async function searchSubjects({
  domainId,
  limit,
  query,
}: {
  domainId: string;
  limit: number;
  query?: string | null;
}): Promise<SubjectSearchItem[]> {
  const pattern = containsPattern(query);
  const exactQuery = query?.trim() ?? "";

  return db.execute<SubjectSearchItem>(sql`
    select
      subjects.id,
      subjects.canonical_label as label,
      subjects.description,
      subject_types.label as "typeLabel",
      statuses.label as "statusLabel",
      subjects.updated_at as "updatedAt"
    from subjects
    join object_domain_memberships memberships
      on memberships.object_id = subjects.id
    left join types subject_types on subject_types.id = subjects.subject_type_id
    left join statuses on statuses.id = subjects.status_id
    where memberships.domain_id = ${domainId}
      and memberships.membership_state = 'member'
      and (
        ${!query?.trim()}
        or subjects.canonical_label ilike ${pattern}
        or subjects.description ilike ${pattern}
      )
    order by
      case
        when ${exactQuery !== ""} and lower(subjects.canonical_label) = lower(${exactQuery}) then 0
        else 1
      end,
      subjects.updated_at desc,
      subjects.id
    limit ${limit}
  `);
}

async function getSubjectRelated(
  id: string,
  domainId?: string
): Promise<SubjectRelated> {
  const aliasDomainFilter = domainId
    ? sql`and (lexicalizations.domain_id is null or lexicalizations.domain_id = ${domainId})`
    : sql``;
  const relatedObjectDomainFilter = domainId
    ? domainMemberExistsFilter(sql`related_object_id`, domainId)
    : sql``;

  const [aliases, claims, relationships] = await Promise.all([
    db.execute(sql`
      select
        lexicalizations.id,
        lexicalizations.lexical_type as "lexicalType",
        lexicalizations.value,
        lexicalizations.language
      from lexicalizations
      where lexicalizations.object_id = ${id}
        ${aliasDomainFilter}
      order by lower(lexicalizations.lexical_type), lower(lexicalizations.value), lexicalizations.id
    `) as unknown as Promise<SubjectAliasRelatedRow[]>,
    db.execute(sql`
      with related_claims as (
        select
          claims.id as related_object_id,
          claims.review_number as "reviewNumber",
          concat('CL-', lpad(claims.review_number::text, 5, '0')) as "reviewId",
          claims.claim_text as "claimText",
          claims.assertion_state as "assertionState",
          claim_targets.target_role as "targetRole",
          claim_types.label as "claimTypeLabel",
          claim_targets.position
        from claim_targets
        join claims on claims.id = claim_targets.claim_id
        left join types claim_types on claim_types.id = claims.claim_type_id
        left join statuses claim_statuses on claim_statuses.id = claims.status_id
        where claim_targets.target_object_id = ${id}
          and coalesce(claim_statuses.key, '') <> 'archived'
      )
      select
        related_object_id as id,
        "claimText",
        "assertionState",
        "targetRole",
        "claimTypeLabel",
        "reviewId",
        "reviewNumber"
      from related_claims
      where true
        ${relatedObjectDomainFilter}
      order by position, lower("claimText"), related_object_id
    `) as unknown as Promise<SubjectClaimRelatedRow[]>,
    db.execute(sql`
      with related_relationships as (
        select
          relationships.id as related_object_id,
          coalesce(nullif(relationships.label, ''), relationship_types.label, 'Relationship') as label,
          relationships.assertion_state as "assertionState",
          relationship_types.label as "relationshipTypeLabel",
          case
            when relationships.source_object_id = ${id} then 'outgoing'
            else 'incoming'
          end as direction,
          case
            when relationships.source_object_id = ${id} then relationships.target_object_id
            else relationships.source_object_id
          end as "otherSubjectId",
          other_subjects.canonical_label as "otherSubjectLabel"
        from relationships
        left join types relationship_types
          on relationship_types.id = relationships.relationship_type_id
        left join subjects other_subjects
          on other_subjects.id = case
            when relationships.source_object_id = ${id} then relationships.target_object_id
            else relationships.source_object_id
          end
        left join statuses relationship_statuses
          on relationship_statuses.id = relationships.status_id
        where (
            relationships.source_object_id = ${id}
            or relationships.target_object_id = ${id}
          )
          and coalesce(relationship_statuses.key, '') <> 'archived'
      )
      select
        related_object_id as id,
        label,
        "assertionState",
        "relationshipTypeLabel",
        direction,
        "otherSubjectId",
        "otherSubjectLabel"
      from related_relationships
      where true
        ${relatedObjectDomainFilter}
      order by lower(label), lower(coalesce("otherSubjectLabel", '')), related_object_id
    `) as unknown as Promise<SubjectRelationshipRelatedRow[]>,
  ]);

  return {
    aliases,
    claims,
    relationships: relationships.map((relationship) => ({
      ...relationship,
      direction:
        relationship.direction === "incoming" ? "incoming" : "outgoing",
    })),
  };
}

export async function getSubjectFormOptions(
  domainSlug: string
): Promise<SubjectFormOptions> {
  const [domain, subjectClass] = await Promise.all([
    getDomainBySlug(domainSlug),
    getSubjectClass(),
  ]);

  if (!subjectClass) {
    return {
      statuses: [],
      types: [],
    };
  }

  const statusRows = await db
    .select({
      id: statuses.id,
      isDefault: statuses.isDefault,
      key: statuses.key,
      label: statuses.label,
    })
    .from(statuses)
    .where(eq(statuses.classId, subjectClass.id))
    .orderBy(statuses.position, statuses.label);

  const typeConditions = [isNull(types.domainId)];

  if (domain) {
    typeConditions.push(eq(types.domainId, domain.id));
  }

  const typeRows = await db
    .select({
      id: types.id,
      label: types.label,
    })
    .from(types)
    .where(and(eq(types.classId, subjectClass.id), or(...typeConditions)))
    .orderBy(types.label);

  return {
    statuses: statusRows,
    types: typeRows,
  };
}
