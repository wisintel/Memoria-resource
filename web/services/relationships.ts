import { eq, sql } from "drizzle-orm";
import { db } from "@/data/client";
import { relationships } from "@/data/schema";
import {
  createCanonicalObject,
  domainMemberExistsFilter,
  getDomainMemberObject,
} from "@/data/queries/canonical-objects";
import {
  getClassByKey,
  getDefaultStatusForClass,
} from "@/data/queries/registry";
import {
  createRelationshipInput,
  updateRelationshipInput,
  type CreateRelationshipInput,
  type RelationshipDetail,
  type RelationshipFormOptions,
  type UpdateRelationshipInput,
} from "@/domain/relationships";
import { getDomainBySlug } from "@/services/domains";
import { err, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";

type RelationshipDetailRow = {
  assertionState: string;
  displayTitle: string;
  id: string;
  relationshipTypeId: string | null;
  relationshipTypeLabel: string | null;
  sourceId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
};

type RelationshipTypeRow = {
  id: string;
};

function validationError(details: unknown) {
  return err("invalid_input", "Relationship input is invalid", details);
}

async function getRelationshipClass() {
  return getClassByKey("relationship");
}

async function getRelationshipType(relationshipTypeId: string | undefined) {
  if (!relationshipTypeId) {
    return null;
  }

  const relationshipClass = await getRelationshipClass();

  if (!relationshipClass) {
    return null;
  }

  const [relationshipType] = (await db.execute(sql`
    select id
    from types
    where id = ${relationshipTypeId}
      and class_id = ${relationshipClass.id}
    limit 1
  `)) as unknown as RelationshipTypeRow[];

  return relationshipType ?? null;
}

async function getRelationshipSubject(domainSlug: string, subjectId: string) {
  return getDomainMemberObject({
    classKey: "subject",
    domainSlug,
    objectId: subjectId,
  });
}

export async function createRelationship(
  domainSlug: string,
  input: CreateRelationshipInput
): Promise<CommandResult<RelationshipDetail>> {
  const parsed = createRelationshipInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const [
    domain,
    relationshipClass,
    relationshipType,
    sourceSubject,
    targetSubject,
  ] = await Promise.all([
    getDomainBySlug(domainSlug),
    getRelationshipClass(),
    getRelationshipType(parsed.data.relationshipTypeId),
    getRelationshipSubject(domainSlug, parsed.data.sourceSubjectId),
    getRelationshipSubject(domainSlug, parsed.data.targetSubjectId),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!relationshipClass) {
    return err(
      "registry_missing",
      "Relationship class is missing from the registry"
    );
  }

  if (!relationshipType) {
    return err("invalid_input", "Relationship type is invalid", {
      relationshipTypeId: parsed.data.relationshipTypeId,
    });
  }

  if (!sourceSubject) {
    return err("invalid_input", "Relationship source is invalid", {
      sourceSubjectId: parsed.data.sourceSubjectId,
    });
  }

  if (!targetSubject) {
    return err("invalid_input", "Relationship target is invalid", {
      targetSubjectId: parsed.data.targetSubjectId,
    });
  }

  const defaultStatus = await getDefaultStatusForClass(relationshipClass.id);
  const { id: relationshipId } = await createCanonicalObject({
    classId: relationshipClass.id,
    domainId: domain.id,
    insertRecord: async (tx, objectId) => {
      await tx.insert(relationships).values({
        id: objectId,
        relationshipTypeId: relationshipType.id,
        sourceObjectId: sourceSubject.id,
        statusId: defaultStatus?.id ?? null,
        targetObjectId: targetSubject.id,
      });
    },
  });

  const detail = await getRelationshipDetail(relationshipId, domainSlug);

  if (!detail) {
    return err("not_found", "Relationship was not found", {
      id: relationshipId,
    });
  }

  return ok(detail);
}

export async function updateRelationship(
  id: string,
  domainSlug: string,
  input: UpdateRelationshipInput
): Promise<CommandResult<RelationshipDetail>> {
  const parsed = updateRelationshipInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const updates: Partial<typeof relationships.$inferInsert> = {};

  if (parsed.data.relationshipTypeId !== undefined) {
    const relationshipType = await getRelationshipType(
      parsed.data.relationshipTypeId
    );

    if (!relationshipType) {
      return err("invalid_input", "Relationship type is invalid", {
        relationshipTypeId: parsed.data.relationshipTypeId,
      });
    }

    updates.relationshipTypeId = relationshipType.id;
  }

  if (parsed.data.sourceSubjectId !== undefined) {
    const sourceSubject = await getRelationshipSubject(
      domainSlug,
      parsed.data.sourceSubjectId
    );

    if (!sourceSubject) {
      return err("invalid_input", "Relationship source is invalid", {
        sourceSubjectId: parsed.data.sourceSubjectId,
      });
    }

    updates.sourceObjectId = sourceSubject.id;
  }

  if (parsed.data.targetSubjectId !== undefined) {
    const targetSubject = await getRelationshipSubject(
      domainSlug,
      parsed.data.targetSubjectId
    );

    if (!targetSubject) {
      return err("invalid_input", "Relationship target is invalid", {
        targetSubjectId: parsed.data.targetSubjectId,
      });
    }

    updates.targetObjectId = targetSubject.id;
  }

  const detailBeforeUpdate = await getRelationshipDetail(id, domainSlug);

  if (!detailBeforeUpdate) {
    return err("not_found", "Relationship was not found", { id });
  }

  if (Object.keys(updates).length > 0) {
    await db.update(relationships).set(updates).where(eq(relationships.id, id));
  }

  const detail = await getRelationshipDetail(id, domainSlug);

  if (!detail) {
    return err("not_found", "Relationship was not found", { id });
  }

  return ok(detail);
}

export async function getRelationshipDetail(
  id: string,
  domainSlug?: string
): Promise<RelationshipDetail | null> {
  const domain = domainSlug ? await getDomainBySlug(domainSlug) : null;

  if (domainSlug && !domain) {
    return null;
  }

  const domainFilter = domain
    ? domainMemberExistsFilter(sql`relationships.id`, domain.id)
    : sql``;

  const [row] = (await db.execute(sql`
    select
      relationships.id,
      relationships.source_object_id as "sourceId",
      coalesce(source_subjects.canonical_label, relationships.source_object_id::text) as "sourceLabel",
      relationships.target_object_id as "targetId",
      coalesce(target_subjects.canonical_label, relationships.target_object_id::text) as "targetLabel",
      relationships.relationship_type_id as "relationshipTypeId",
      relationship_types.label as "relationshipTypeLabel",
      relationships.assertion_state as "assertionState",
      concat_ws(
        ' - ',
        coalesce(source_subjects.canonical_label, relationships.source_object_id::text),
        coalesce(relationship_types.label, 'Relationship'),
        coalesce(target_subjects.canonical_label, relationships.target_object_id::text)
      ) as "displayTitle"
    from relationships
    left join types relationship_types
      on relationship_types.id = relationships.relationship_type_id
    left join subjects source_subjects
      on source_subjects.id = relationships.source_object_id
    left join subjects target_subjects
      on target_subjects.id = relationships.target_object_id
    where relationships.id = ${id}
      ${domainFilter}
    limit 1
  `)) as unknown as RelationshipDetailRow[];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    assertionState: row.assertionState,
    displayTitle: row.displayTitle,
    relationshipType:
      row.relationshipTypeId && row.relationshipTypeLabel
        ? {
            id: row.relationshipTypeId,
            label: row.relationshipTypeLabel,
          }
        : null,
    relationshipTypeId: row.relationshipTypeId,
    source: {
      id: row.sourceId,
      label: row.sourceLabel,
    },
    target: {
      id: row.targetId,
      label: row.targetLabel,
    },
  };
}

export async function getRelationshipFormOptions(
  domainSlug: string
): Promise<RelationshipFormOptions> {
  const [domain, relationshipClass] = await Promise.all([
    getDomainBySlug(domainSlug),
    getRelationshipClass(),
  ]);

  if (!relationshipClass) {
    return {
      subjects: [],
      types: [],
    };
  }

  const domainId = domain?.id ?? null;
  const types = (await db.execute(sql`
    select types.id, types.label
    from types
    where types.class_id = ${relationshipClass.id}
      and (${domainId}::uuid is null or types.domain_id is null or types.domain_id = ${domainId})
    order by lower(types.label), types.id
  `)) as unknown as RelationshipFormOptions["types"];

  const subjects = (await db.execute(sql`
    select subjects.id, subjects.canonical_label as label
    from subjects
    join object_domain_memberships memberships
      on memberships.object_id = subjects.id
    join domains on domains.id = memberships.domain_id
    where domains.slug = ${domainSlug}
      and memberships.membership_state = 'member'
    order by lower(subjects.canonical_label), subjects.id
  `)) as unknown as RelationshipFormOptions["subjects"];

  return {
    subjects,
    types,
  };
}
