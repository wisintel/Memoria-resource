import { eq, sql } from "drizzle-orm";
import { db } from "@/data/client";
import { claimTargets, claims } from "@/data/schema";
import {
  createCanonicalObject,
  domainMemberExistsFilter,
  getDomainMemberObject,
} from "@/data/queries/canonical-objects";
import {
  getClassByKey,
  getDefaultStatusForClass,
  getStatusForClassByKey,
} from "@/data/queries/registry";
import {
  type ClaimAtomicReviewInput,
  createClaimInput,
  updateClaimInput,
  type ClaimDetail,
  type ClaimFormOptions,
  type ClaimTargetDetail,
  type CreateClaimInput,
  type UpdateClaimInput,
} from "@/domain/claims";
import { getDomainBySlug } from "@/services/domains";
import { err, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";
import { containsPattern } from "@/services/search-patterns";

type ClaimDetailRow = {
  assertionState: string;
  claimText: string;
  claimTypeId: string | null;
  claimTypeLabel: string | null;
  confidence: string | null;
  displayTitle: string;
  id: string;
  modality: ClaimDetail["modality"];
  reviewNumber: number;
  source: string | null;
};

type ClaimTargetRow = ClaimTargetDetail;

type ClaimTypeRow = {
  id: string;
};

export type ClaimSearchItem = {
  assertionState: string;
  claimText: string;
  confidence: string | null;
  id: string;
  reviewId: string;
  reviewNumber: number;
  targetLabel: string | null;
  typeLabel: string | null;
  updatedAt: Date;
};

export function claimReviewId(reviewNumber: number) {
  return `CL-${reviewNumber.toString().padStart(5, "0")}`;
}

function validationError(details: unknown) {
  return err("invalid_input", "Claim input is invalid", details);
}

function baseMetadata(existing: unknown) {
  return typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing)
    ? { ...existing }
    : {};
}

function metadataWithAtomicReview(input: {
  claimText: string;
  existing: unknown;
  review: ClaimAtomicReviewInput;
}) {
  return {
    ...baseMetadata(input.existing),
    atomicReview: {
      reviewedAt: new Date().toISOString(),
      reviewedBy: "atlas",
      reviewedText: input.claimText,
      state: input.review.state,
      ...(input.review.rationale ? { rationale: input.review.rationale } : {}),
    },
  };
}

function metadataWithClaimDerivation(sourceClaimId: string) {
  return {
    derivedFromClaimId: sourceClaimId,
    derivedAt: new Date().toISOString(),
    derivationKind: "atomization",
  };
}

async function getClaimClass() {
  return getClassByKey("claim");
}

async function getClaimType(claimTypeId: string | undefined) {
  if (!claimTypeId) {
    return null;
  }

  const claimClass = await getClaimClass();

  if (!claimClass) {
    return null;
  }

  const [claimType] = (await db.execute(sql`
    select id
    from types
    where id = ${claimTypeId}
      and class_id = ${claimClass.id}
    limit 1
  `)) as unknown as ClaimTypeRow[];

  return claimType ?? null;
}

async function getTargetSubject(domainSlug: string, targetSubjectId: string) {
  return getDomainMemberObject({
    classKey: "subject",
    domainSlug,
    objectId: targetSubjectId,
  });
}

function normalizedTargetSubjectIds(input: {
  targetSubjectId?: string;
  targetSubjectIds?: string[];
}) {
  return Array.from(
    new Set([
      ...(input.targetSubjectId ? [input.targetSubjectId] : []),
      ...(input.targetSubjectIds ?? []),
    ])
  );
}

async function getTargetSubjects(domainSlug: string, targetSubjectIds: string[]) {
  const rows = await Promise.all(
    targetSubjectIds.map((targetSubjectId) =>
      getTargetSubject(domainSlug, targetSubjectId)
    )
  );

  return {
    invalidTargetSubjectIds: targetSubjectIds.filter((_, index) => !rows[index]),
    targets: rows.filter((row): row is NonNullable<typeof row> => row !== null),
  };
}

export async function createClaim(
  domainSlug: string,
  input: CreateClaimInput
): Promise<CommandResult<ClaimDetail>> {
  const parsed = createClaimInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const targetSubjectIds = normalizedTargetSubjectIds(parsed.data);
  const [domain, claimClass, claimType, targetSubjects] = await Promise.all([
    getDomainBySlug(domainSlug),
    getClaimClass(),
    getClaimType(parsed.data.claimTypeId),
    getTargetSubjects(domainSlug, targetSubjectIds),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!claimClass) {
    return err("registry_missing", "Claim class is missing from the registry");
  }

  if (!claimType) {
    return err("invalid_input", "Claim type is invalid", {
      claimTypeId: parsed.data.claimTypeId,
    });
  }

  if (targetSubjects.invalidTargetSubjectIds.length > 0) {
    return err("invalid_input", "Claim target is invalid", {
      targetSubjectIds: targetSubjects.invalidTargetSubjectIds,
    });
  }

  const sourceClaim = parsed.data.sourceClaimId
    ? await getClaimDetail(parsed.data.sourceClaimId, domainSlug)
    : null;

  if (parsed.data.sourceClaimId && !sourceClaim) {
    return err("invalid_input", "Source claim is invalid", {
      sourceClaimId: parsed.data.sourceClaimId,
    });
  }

  const defaultStatus = await getDefaultStatusForClass(claimClass.id);
  const { id: claimId } = await createCanonicalObject({
    classId: claimClass.id,
    domainId: domain.id,
    insertRecord: async (tx, objectId) => {
      await tx.insert(claims).values({
        id: objectId,
        claimText: parsed.data.claimText,
        claimTypeId: claimType.id,
        metadata: parsed.data.sourceClaimId
          ? metadataWithClaimDerivation(parsed.data.sourceClaimId)
          : {},
        modality: parsed.data.modality ?? null,
        source: sourceClaim?.source ?? null,
        statusId: defaultStatus?.id ?? null,
      });

      await tx.insert(claimTargets).values(
        targetSubjects.targets.map((target, position) => ({
          claimId: objectId,
          position,
          targetObjectId: target.id,
          targetRole: "about",
        }))
      );
    },
  });

  const detail = await getClaimDetail(claimId, domainSlug);

  if (!detail) {
    return err("not_found", "Claim was not found", { id: claimId });
  }

  return ok(detail);
}

export async function updateClaim(
  id: string,
  domainSlug: string,
  input: UpdateClaimInput
): Promise<CommandResult<ClaimDetail>> {
  const parsed = updateClaimInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const updates: Partial<typeof claims.$inferInsert> = {};

  if (parsed.data.claimText !== undefined) {
    updates.claimText = parsed.data.claimText;
  }

  if (parsed.data.claimTypeId !== undefined) {
    const claimType = await getClaimType(parsed.data.claimTypeId);

    if (!claimType) {
      return err("invalid_input", "Claim type is invalid", {
        claimTypeId: parsed.data.claimTypeId,
      });
    }

    updates.claimTypeId = claimType.id;
  }

  if (parsed.data.modality !== undefined) {
    updates.modality = parsed.data.modality;
  }

  const shouldReplaceTargets =
    parsed.data.targetSubjectId !== undefined ||
    parsed.data.targetSubjectIds !== undefined;
  const targetSubjects = shouldReplaceTargets
    ? await getTargetSubjects(domainSlug, normalizedTargetSubjectIds(parsed.data))
    : null;

  if (
    targetSubjects !== null &&
    targetSubjects.invalidTargetSubjectIds.length > 0
  ) {
    return err("invalid_input", "Claim target is invalid", {
      targetSubjectIds: targetSubjects.invalidTargetSubjectIds,
    });
  }

  const detailBeforeUpdate = await getClaimDetail(id, domainSlug);

  if (!detailBeforeUpdate) {
    return err("not_found", "Claim was not found", { id });
  }

  if (parsed.data.atomicReview !== undefined) {
    const [row] = await db
      .select({ metadata: claims.metadata })
      .from(claims)
      .where(eq(claims.id, id))
      .limit(1);

    updates.metadata = metadataWithAtomicReview({
      claimText: parsed.data.claimText ?? detailBeforeUpdate.claimText,
      existing: row?.metadata,
      review: parsed.data.atomicReview,
    });
  }

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(claims).set(updates).where(eq(claims.id, id));
    }

    if (targetSubjects) {
      await tx
        .delete(claimTargets)
        .where(
          sql`${claimTargets.claimId} = ${id} and ${claimTargets.targetRole} = 'about'`
        );

      await tx.insert(claimTargets).values(
        targetSubjects.targets.map((target, position) => ({
          claimId: id,
          position,
          targetObjectId: target.id,
          targetRole: "about",
        }))
      );
    }
  });

  const detail = await getClaimDetail(id, domainSlug);

  if (!detail) {
    return err("not_found", "Claim was not found", { id });
  }

  return ok(detail);
}

export async function archiveClaim(
  id: string,
  domainSlug: string
): Promise<CommandResult<ClaimDetail>> {
  const detailBeforeArchive = await getClaimDetail(id, domainSlug);

  if (!detailBeforeArchive) {
    return err("not_found", "Claim was not found", { id });
  }

  const claimClass = await getClaimClass();

  if (!claimClass) {
    return err("registry_missing", "Claim class is missing from the registry");
  }

  const archivedStatus = await getStatusForClassByKey(
    claimClass.id,
    "archived"
  );

  if (!archivedStatus) {
    return err(
      "registry_missing",
      "Archived status is not registered for claims"
    );
  }

  await db
    .update(claims)
    .set({ statusId: archivedStatus.id })
    .where(eq(claims.id, id));

  const detail = await getClaimDetail(id, domainSlug);

  if (!detail) {
    return err("not_found", "Claim was not found", { id });
  }

  return ok(detail);
}

export async function getClaimDetail(
  id: string,
  domainSlug?: string
): Promise<ClaimDetail | null> {
  const domain = domainSlug ? await getDomainBySlug(domainSlug) : null;

  if (domainSlug && !domain) {
    return null;
  }

  const domainFilter = domain
    ? domainMemberExistsFilter(sql`claims.id`, domain.id)
    : sql``;

  const [rows, targets] = await Promise.all([
    db.execute(sql`
      select
        claims.id,
        claims.review_number as "reviewNumber",
        claims.claim_text as "claimText",
        claims.claim_type_id as "claimTypeId",
        claim_types.label as "claimTypeLabel",
        claims.modality::text as "modality",
        claims.assertion_state::text as "assertionState",
        claims.confidence,
        claims.source,
        concat_ws(
          ' - ',
          coalesce(claim_types.label, 'Claim'),
          coalesce(primary_target.target_label, 'Untargeted')
        ) as "displayTitle"
      from claims
      left join types claim_types on claim_types.id = claims.claim_type_id
      left join lateral (
        select
          coalesce(
            subjects.canonical_label,
            claim_targets.target_object_id::text
          ) as target_label
        from claim_targets
        left join subjects on subjects.id = claim_targets.target_object_id
        where claim_targets.claim_id = claims.id
        order by
          case when claim_targets.target_role = 'about' then 0 else 1 end,
          claim_targets.position,
          lower(subjects.canonical_label),
          claim_targets.target_object_id
        limit 1
      ) primary_target on true
      where claims.id = ${id}
        ${domainFilter}
      limit 1
    `) as unknown as Promise<ClaimDetailRow[]>,
    getClaimTargets(id),
  ]);
  const [row] = rows;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    assertionState: row.assertionState,
    claimText: row.claimText,
    claimType:
      row.claimTypeId && row.claimTypeLabel
        ? {
            id: row.claimTypeId,
            label: row.claimTypeLabel,
          }
        : null,
    claimTypeId: row.claimTypeId,
    confidence: row.confidence,
    displayTitle: row.displayTitle,
    primaryTarget: targets[0] ?? null,
    modality: row.modality,
    reviewId: claimReviewId(row.reviewNumber),
    reviewNumber: row.reviewNumber,
    source: row.source,
    targets,
  };
}

export async function searchClaims({
  domainId,
  limit,
  query,
  targetObjectId,
}: {
  domainId: string;
  limit: number;
  query?: string | null;
  targetObjectId?: string | null;
}): Promise<ClaimSearchItem[]> {
  const pattern = containsPattern(query);
  const scopedTargetObjectId = targetObjectId?.trim() || null;
  const exactQuery = query?.trim() ?? "";

  return db.execute<ClaimSearchItem>(sql`
    select
      claims.id,
      claims.review_number as "reviewNumber",
      concat('CL-', lpad(claims.review_number::text, 5, '0')) as "reviewId",
      claims.claim_text as "claimText",
      claim_types.label as "typeLabel",
      claims.assertion_state as "assertionState",
      claims.confidence,
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
      and (
        ${!query?.trim()}
        or claims.claim_text ilike ${pattern}
      )
      and (
        ${scopedTargetObjectId === null}
        or exists (
          select 1
          from claim_targets
          where claim_targets.claim_id = claims.id
            and claim_targets.target_object_id = ${scopedTargetObjectId}
        )
      )
    order by
      case
        when ${exactQuery !== ""} and lower(claims.claim_text) = lower(${exactQuery}) then 0
        else 1
      end,
      claims.updated_at desc,
      claims.id
    limit ${limit}
  `);
}

export async function getClaimFormOptions(
  domainSlug: string
): Promise<ClaimFormOptions> {
  const [domain, claimClass] = await Promise.all([
    getDomainBySlug(domainSlug),
    getClaimClass(),
  ]);

  if (!claimClass) {
    return {
      targets: [],
      types: [],
    };
  }

  const domainId = domain?.id ?? null;
  const types = (await db.execute(sql`
    select types.id, types.label, types.slug
    from types
    where types.class_id = ${claimClass.id}
      and (${domainId}::uuid is null or types.domain_id is null or types.domain_id = ${domainId})
    order by lower(types.label), types.id
  `)) as unknown as ClaimFormOptions["types"];

  const targets = (await db.execute(sql`
    select subjects.id, subjects.canonical_label as label
    from subjects
    join object_domain_memberships memberships
      on memberships.object_id = subjects.id
    join domains on domains.id = memberships.domain_id
    where domains.slug = ${domainSlug}
      and memberships.membership_state = 'member'
    order by lower(subjects.canonical_label), subjects.id
  `)) as unknown as ClaimFormOptions["targets"];

  return {
    targets,
    types,
  };
}

async function getClaimTargets(id: string): Promise<ClaimTargetDetail[]> {
  const targets = (await db.execute(sql`
    select
      claim_targets.id,
      coalesce(subjects.canonical_label, claim_targets.target_object_id::text) as label,
      claim_targets.position,
      claim_targets.target_object_id as "targetObjectId",
      claim_targets.target_role as "targetRole"
    from claim_targets
    left join subjects on subjects.id = claim_targets.target_object_id
    where claim_targets.claim_id = ${id}
    order by
      case when claim_targets.target_role = 'about' then 0 else 1 end,
      claim_targets.position,
      lower(subjects.canonical_label),
      claim_targets.target_object_id
  `)) as unknown as ClaimTargetRow[];

  return targets;
}
