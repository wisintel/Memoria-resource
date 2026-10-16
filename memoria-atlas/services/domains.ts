import { and, eq, sql } from "drizzle-orm";
import { createDomainInput, updateDomainInput } from "@/domain/domains";
import type {
  CreateDomainInput,
  Domain,
  DomainInventoryItem,
  DomainInventoryKey,
  DomainOverview,
  UpdateDomainInput,
} from "@/domain/domains";
import { db } from "@/data/client";
import { domains, objects, statuses } from "@/data/schema";
import {
  getClassByKey,
  getDefaultStatusForClass,
} from "@/data/queries/registry";
import { slugify } from "@/lib/slug";
import {
  getDefaultWorkspaceMapRegistry,
  insertDefaultWorkspaceMap,
} from "@/services/default-workspace-map";
import { err, inputValidationError, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";

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

const domainInventoryItems = [
  { key: "domain_map", label: "Views" },
  { key: "subject", label: "Entities" },
  { key: "claim", label: "Claims" },
  { key: "relationship", label: "Relationships" },
  { key: "document", label: "Documents" },
  { key: "type", label: "Types" },
] satisfies Array<{ key: DomainInventoryKey; label: string }>;

type DomainInventoryCountRow = {
  key: DomainInventoryKey;
  count: number | string | bigint;
};

export type DomainActivityDocument = {
  id: string;
  label: string;
  preparationState: string;
  shardCount: number | null;
  sourceFilename: string | null;
  sourceType: string;
  updatedAt: Date;
};

export type DomainActivitySubject = {
  id: string;
  label: string;
  statusLabel: string | null;
  typeLabel: string | null;
  updatedAt: Date;
};

export type DomainActivityClaim = {
  assertionState: string;
  claimText: string;
  id: string;
  reviewId: string;
  reviewNumber: number;
  targetLabel: string | null;
  typeLabel: string | null;
  updatedAt: Date;
};

export type DomainActivityRelationship = {
  id: string;
  label: string;
  sourceLabel: string | null;
  targetLabel: string | null;
  typeLabel: string | null;
  updatedAt: Date;
};

export type DomainActivityDomainMap = {
  description: string | null;
  id: string;
  label: string;
  mapKindLabel: string | null;
  slug: string;
  statusLabel: string | null;
  updatedAt: Date;
};

async function getDomainClass() {
  return getClassByKey("domain");
}

async function getStatusForDomainClass(statusKey: "active" | "archived") {
  const domainClass = await getDomainClass();

  if (!domainClass) {
    return null;
  }

  const [statusRow] = await db
    .select()
    .from(statuses)
    .where(
      and(eq(statuses.classId, domainClass.id), eq(statuses.key, statusKey))
    )
    .limit(1);

  return statusRow ?? null;
}

export async function createDomain(
  input: CreateDomainInput
): Promise<CommandResult<Domain>> {
  const parsed = createDomainInput.safeParse(input);

  if (!parsed.success) {
    return inputValidationError("Domain", parsed.error.flatten());
  }

  const domainClass = await getDomainClass();

  if (!domainClass) {
    return err("registry_missing", "Domain class is missing from the registry");
  }

  const defaultStatus = await getDefaultStatusForClass(domainClass.id);
  const defaultWorkspaceRegistry = await getDefaultWorkspaceMapRegistry();
  const slug = parsed.data.slug ?? slugify(parsed.data.label);

  if (!slug) {
    return err("invalid_input", "Domain slug could not be derived");
  }

  try {
    const domain = await db.transaction(async (tx) => {
      const [objectRow] = await tx
        .insert(objects)
        .values({
          classId: domainClass.id,
        })
        .returning({ id: objects.id });

      if (!objectRow) {
        throw new Error("Domain object insert failed");
      }

      const [domainRow] = await tx
        .insert(domains)
        .values({
          id: objectRow.id,
          slug,
          label: parsed.data.label,
          description: parsed.data.description,
          statusId: defaultStatus?.id,
        })
        .returning();

      if (!domainRow) {
        throw new Error("Domain insert failed");
      }

      await insertDefaultWorkspaceMap({
        domainId: domainRow.id,
        domainSlug: domainRow.slug,
        registry: defaultWorkspaceRegistry,
        tx,
      });

      return domainRow;
    });

    return ok(domain);
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return err("slug_taken", "A domain with this slug already exists", {
        slug,
      });
    }

    throw error;
  }
}

export async function getDomainById(id: string) {
  const [domain] = await db
    .select()
    .from(domains)
    .where(eq(domains.id, id))
    .limit(1);

  return domain ?? null;
}

export async function getDomainBySlug(slug: string) {
  const [domain] = await db
    .select()
    .from(domains)
    .where(eq(domains.slug, slug))
    .limit(1);

  return domain ?? null;
}

export async function getDomainOverviewBySlug(
  slug: string
): Promise<DomainOverview | null> {
  const domain = await getDomainBySlug(slug);

  if (!domain) {
    return null;
  }

  const [status, inventory] = await Promise.all([
    getDomainStatusById(domain.statusId),
    getDomainInventory(domain.id),
  ]);
  const total = inventory.reduce((sum, item) => sum + item.count, 0);

  return {
    domain,
    status,
    inventory,
    total,
  };
}

export async function getDomainInventory(
  domainId: string
): Promise<DomainInventoryItem[]> {
  const rows = (await db.execute(sql`
    select classes.key as key, count(*)::int as count
    from object_domain_memberships memberships
    join objects on objects.id = memberships.object_id
    join classes on classes.id = objects.class_id
    where memberships.domain_id = ${domainId}
      and memberships.membership_state = 'member'
      and classes.key in (
        'domain_map',
        'subject',
        'claim',
        'relationship',
        'document'
      )
    group by classes.key
    union all
    select 'type' as key, count(*)::int as count
    from types
    where types.domain_id = ${domainId}
  `)) as unknown as DomainInventoryCountRow[];
  const counts = new Map<DomainInventoryKey, number>();

  for (const row of rows) {
    counts.set(row.key, Number(row.count));
  }

  return domainInventoryItems.map((item) => ({
    ...item,
    count: counts.get(item.key) ?? 0,
  }));
}

export async function getDomainActivity(domainId: string, limit: number) {
  const [documents, subjects, claims, relationships, domainMaps] =
    await Promise.all([
      db.execute<DomainActivityDocument>(sql`
        select
          documents.id,
          documents.label,
          documents.source_type as "sourceType",
          documents.preparation_state as "preparationState",
          documents.shard_count as "shardCount",
          documents.source_filename as "sourceFilename",
          documents.updated_at as "updatedAt"
        from documents
        join object_domain_memberships memberships
          on memberships.object_id = documents.id
        where memberships.domain_id = ${domainId}
          and memberships.membership_state = 'member'
        order by documents.updated_at desc, documents.id
        limit ${limit}
      `),
      db.execute<DomainActivitySubject>(sql`
        select
          subjects.id,
          subjects.canonical_label as label,
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
        order by subjects.updated_at desc, subjects.id
        limit ${limit}
      `),
      db.execute<DomainActivityClaim>(sql`
        select
          claims.id,
          claims.review_number as "reviewNumber",
          concat('CL-', lpad(claims.review_number::text, 5, '0')) as "reviewId",
          claims.claim_text as "claimText",
          claim_types.label as "typeLabel",
          claims.assertion_state as "assertionState",
          primary_target.target_label as "targetLabel",
          claims.updated_at as "updatedAt"
        from claims
        join object_domain_memberships memberships
          on memberships.object_id = claims.id
        left join types claim_types on claim_types.id = claims.claim_type_id
        left join lateral (
          select coalesce(subjects.canonical_label, claim_targets.target_object_id::text) as target_label
          from claim_targets
          left join subjects on subjects.id = claim_targets.target_object_id
          where claim_targets.claim_id = claims.id
          order by
            case when claim_targets.target_role = 'about' then 0 else 1 end,
            claim_targets.position,
            claim_targets.id
          limit 1
        ) primary_target on true
        where memberships.domain_id = ${domainId}
          and memberships.membership_state = 'member'
        order by claims.updated_at desc, claims.id
        limit ${limit}
      `),
      db.execute<DomainActivityRelationship>(sql`
        select
          relationships.id,
          coalesce(
            nullif(relationships.label, ''),
            concat_ws(
              ' ',
              coalesce(source_subjects.canonical_label, relationships.source_object_id::text),
              coalesce(relationship_types.label, 'relates to'),
              coalesce(target_subjects.canonical_label, relationships.target_object_id::text)
            )
          ) as label,
          relationship_types.label as "typeLabel",
          source_subjects.canonical_label as "sourceLabel",
          target_subjects.canonical_label as "targetLabel",
          relationships.updated_at as "updatedAt"
        from relationships
        join object_domain_memberships memberships
          on memberships.object_id = relationships.id
        left join types relationship_types
          on relationship_types.id = relationships.relationship_type_id
        left join subjects source_subjects
          on source_subjects.id = relationships.source_object_id
        left join subjects target_subjects
          on target_subjects.id = relationships.target_object_id
        where memberships.domain_id = ${domainId}
          and memberships.membership_state = 'member'
        order by relationships.updated_at desc, relationships.id
        limit ${limit}
      `),
      db.execute<DomainActivityDomainMap>(sql`
        select
          domain_maps.id,
          domain_maps.slug,
          domain_maps.label,
          nullif(domain_maps.description, '') as description,
          map_types.label as "mapKindLabel",
          statuses.label as "statusLabel",
          domain_maps.updated_at as "updatedAt"
        from domain_maps
        join object_domain_memberships memberships
          on memberships.object_id = domain_maps.id
        left join statuses on statuses.id = domain_maps.status_id
        left join types map_types on map_types.id = domain_maps.map_kind_type_id
        where memberships.domain_id = ${domainId}
          and memberships.membership_state = 'member'
          and coalesce(statuses.key, 'active') <> 'archived'
        order by domain_maps.updated_at desc, domain_maps.id
        limit ${limit}
      `),
    ]);

  return {
    claims,
    documents,
    domainMaps,
    relationships,
    subjects,
  };
}

export async function getDomainStatusById(id: string | null) {
  if (!id) {
    return null;
  }

  const [status] = await db
    .select({
      id: statuses.id,
      key: statuses.key,
      label: statuses.label,
    })
    .from(statuses)
    .where(eq(statuses.id, id))
    .limit(1);

  return status ?? null;
}

export async function listDomains(statusKey?: "active" | "archived") {
  if (!statusKey) {
    return db.select().from(domains).orderBy(domains.createdAt);
  }

  const status = await getStatusForDomainClass(statusKey);

  if (!status) {
    return [];
  }

  return db
    .select()
    .from(domains)
    .where(eq(domains.statusId, status.id))
    .orderBy(domains.createdAt);
}

export async function updateDomain(
  id: string,
  input: UpdateDomainInput
): Promise<CommandResult<Domain>> {
  const parsed = updateDomainInput.safeParse(input);

  if (!parsed.success) {
    return inputValidationError("Domain", parsed.error.flatten());
  }

  const updates: Partial<typeof domains.$inferInsert> = {};

  if (parsed.data.label !== undefined) {
    updates.label = parsed.data.label;
  }

  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }

  if (parsed.data.status) {
    const statusRow = await getStatusForDomainClass(parsed.data.status);

    if (!statusRow) {
      return err(
        "registry_missing",
        "Domain status is missing from the registry",
        {
          status: parsed.data.status,
        }
      );
    }

    updates.statusId = statusRow.id;
  }

  if (Object.keys(updates).length === 0) {
    const domain = await getDomainById(id);

    if (!domain) {
      return err("not_found", "Domain was not found", { id });
    }

    return ok(domain);
  }

  const [domain] = await db
    .update(domains)
    .set(updates)
    .where(eq(domains.id, id))
    .returning();

  if (!domain) {
    return err("not_found", "Domain was not found", { id });
  }

  return ok(domain);
}

export async function archiveDomain(id: string) {
  return updateDomain(id, { status: "archived" });
}
