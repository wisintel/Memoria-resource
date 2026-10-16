import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/data/client";
import {
  claimTargets,
  claims,
  classes,
  extractionBundles,
  extractionClaims,
  extractionClaimProvenance,
  objectDomainMemberships,
  objects,
  recordProvenance,
  subjects,
  types,
  workshopClaimDecisions,
  workshopPackageDecisions,
} from "@/data/schema";
import {
  getClassByKey,
  getDefaultStatusForClass,
} from "@/data/queries/registry";
import type {
  WorkshopBundleReview,
  WorkshopPackageClaim,
  WorkshopSubjectPackage,
  WorkshopSubjectPackageDecision,
  WorkshopSubjectPackageResult,
} from "@/domain/workshop";
import type { ClaimModality } from "@/domain/claims";
import { slugify } from "@/lib/slug";
import { getDomainBySlug } from "@/services/domains";
import { createRelationship } from "@/services/relationships";
import { err, ok, type CommandResult } from "@/services/result";
import { createSubject } from "@/services/subjects";
import { bumpWorkspaceRefreshSignal } from "@/services/workspace-refresh";

type PackageRow = {
  assertion: string;
  claimId: string;
  extractionClaimId: string;
  kind: string;
  modality: ClaimModality;
  normalizedSubject: string;
  subjectText: string;
  text: string;
};

type AdmissionPackageRow = PackageRow & {
  bundleId: string;
  bundleLabel: string;
  bundleUpdatedAt: Date;
  claimDecisionOutcome: string | null;
};

type WorkshopClaimDecisionOutcome =
  "admitted" | "deferred" | "duplicate" | "processed" | "rejected" | "split";

export type WorkshopClaimDecisionMetadata = {
  note?: string;
  resultClaimIds?: string[];
  resultRecordIds?: string[];
  resultRelationshipIds?: string[];
};

function normalizeSubject(value: string) {
  return slugify(value);
}

function uuidSqlList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  );
}

function uuidSqlValueRows(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`(${id}::uuid)`),
    sql`, `
  );
}

function shortRunHref(domainSlug: string, runId: string) {
  return `/workshop?${new URLSearchParams({
    class: "run",
    domain: domainSlug,
    sel: runId,
  }).toString()}`;
}

const admissionDecisionReferenceInput = z.object({
  claimRowId: z.string().uuid(),
  note: z.string().trim().optional(),
  resultClaimIds: z.array(z.string().uuid()).optional(),
  resultRecordIds: z.array(z.string().uuid()).optional(),
  resultRelationshipIds: z.array(z.string().uuid()).optional(),
});

export const applyAdmissionPlanInput = z.object({
  admitClaims: z
    .array(
      z.object({
        claimRowId: z.string().uuid(),
        claimText: z.string().trim().min(1).optional(),
        claimTypeSlug: z.string().trim().min(1).optional(),
        modality: z
          .enum([
            "empirical",
            "normative",
            "projection",
            "reported",
            "rhetorical",
          ])
          .optional(),
        targetSubjectIds: z.array(z.string().uuid()).optional(),
        targetSubjectKeys: z.array(z.string().trim().min(1)).optional(),
        targetSubjectLabels: z.array(z.string().trim().min(1)).optional(),
      })
    )
    .optional(),
  deferClaims: z.array(z.string().uuid()).optional(),
  domainSlug: z.string().min(1),
  duplicateClaims: z.array(admissionDecisionReferenceInput).optional(),
  processClaims: z.array(z.string().uuid()).optional(),
  rejectClaims: z
    .array(
      z.object({
        claimRowId: z.string().uuid(),
        note: z.string().trim().optional(),
      })
    )
    .optional(),
  relationships: z
    .array(
      z.object({
        key: z.string().trim().min(1).optional(),
        provenanceClaimRowId: z.string().uuid().optional(),
        relationshipTypeId: z.string().uuid().optional(),
        relationshipTypeSlug: z.string().trim().min(1).optional(),
        sourceSubjectId: z.string().uuid().optional(),
        sourceSubjectKey: z.string().trim().min(1).optional(),
        sourceSubjectLabel: z.string().trim().min(1).optional(),
        targetSubjectId: z.string().uuid().optional(),
        targetSubjectKey: z.string().trim().min(1).optional(),
        targetSubjectLabel: z.string().trim().min(1).optional(),
      })
    )
    .optional(),
  splitClaims: z.array(admissionDecisionReferenceInput).optional(),
  subjects: z
    .array(
      z.object({
        canonicalLabel: z.string().trim().min(1).max(240),
        description: z.string().trim().optional(),
        key: z.string().trim().min(1).optional(),
        provenanceClaimRowId: z.string().uuid().optional(),
        statusId: z.string().uuid().optional(),
        subjectTypeId: z.string().uuid().optional(),
        subjectTypeSlug: z.string().trim().min(1).optional(),
      })
    )
    .optional(),
});

export type ApplyAdmissionPlanInput = z.infer<typeof applyAdmissionPlanInput>;

async function getTypeBySlug(input: {
  classKey: "claim" | "relationship" | "subject";
  domainId: string;
  slug: string;
}) {
  const [row] = await db
    .select({ id: types.id })
    .from(types)
    .innerJoin(classes, eq(classes.id, types.classId))
    .where(
      and(
        eq(classes.key, input.classKey),
        eq(types.slug, input.slug),
        sql`(${types.domainId} is null or ${types.domainId} = ${input.domainId})`
      )
    )
    .orderBy(sql`${types.domainId} is null`)
    .limit(1);

  return row ?? null;
}

async function getExactSubject(input: { domainId: string; label: string }) {
  const normalized = normalizeSubject(input.label);
  const [row] = await db.execute<{ id: string }>(sql`
    select subjects.id
    from subjects
    join object_domain_memberships memberships
      on memberships.object_id = subjects.id
    where memberships.domain_id = ${input.domainId}
      and memberships.membership_state = 'member'
      and lower(regexp_replace(subjects.canonical_label, '[^a-zA-Z0-9]+', '-', 'g')) = ${normalized}
    limit 1
  `);

  return row ?? null;
}

async function getExactRelationship(input: {
  domainId: string;
  relationshipTypeId: string;
  sourceSubjectId: string;
  targetSubjectId: string;
}) {
  const [row] = await db.execute<{ id: string }>(sql`
    select relationships.id
    from relationships
    join object_domain_memberships memberships
      on memberships.object_id = relationships.id
    where memberships.domain_id = ${input.domainId}
      and memberships.membership_state = 'member'
      and relationships.relationship_type_id = ${input.relationshipTypeId}
      and relationships.source_object_id = ${input.sourceSubjectId}
      and relationships.target_object_id = ${input.targetSubjectId}
    limit 1
  `);

  return row ?? null;
}

async function getExtractionProvenance(claimRowId: string) {
  const [provenance] = await db
    .select({
      claimId: extractionClaims.claimId,
      runId: extractionBundles.runId,
      sourceUnitId: extractionClaimProvenance.sourceUnitId,
    })
    .from(extractionClaims)
    .innerJoin(
      extractionBundles,
      eq(extractionBundles.id, extractionClaims.bundleId)
    )
    .leftJoin(
      extractionClaimProvenance,
      eq(extractionClaimProvenance.claimRowId, extractionClaims.id)
    )
    .where(eq(extractionClaims.id, claimRowId))
    .limit(1);

  return provenance ?? null;
}

async function attachExtractionProvenance(input: {
  claimRowId: string;
  recordClassKey: string;
  recordId: string;
}) {
  const provenance = await getExtractionProvenance(input.claimRowId);

  if (!provenance) {
    return;
  }

  await db.insert(recordProvenance).values({
    recordClassKey: input.recordClassKey,
    recordId: input.recordId,
    runId: provenance.runId,
    sourceUnitId: provenance.sourceUnitId,
  });
}

function collectResultError<T>(
  result: CommandResult<T>,
  fallbackCode: string,
  fallbackMessage: string
) {
  return result.ok
    ? null
    : {
        code: result.error.code || fallbackCode,
        details: result.error.details,
        message: result.error.message || fallbackMessage,
      };
}

async function getExistingClaim(input: {
  domainId: string;
  subjectId: string;
  text: string;
}) {
  const [row] = await db.execute<{ id: string }>(sql`
    select claims.id
    from claims
    join object_domain_memberships memberships
      on memberships.object_id = claims.id
    join claim_targets
      on claim_targets.claim_id = claims.id
    where memberships.domain_id = ${input.domainId}
      and memberships.membership_state = 'member'
      and claim_targets.target_object_id = ${input.subjectId}
      and claim_targets.target_role = 'about'
      and lower(claims.claim_text) = lower(${input.text})
    limit 1
  `);

  return row ?? null;
}

async function getExistingClaimWithTargets(input: {
  domainId: string;
  targetSubjectIds: string[];
  text: string;
}) {
  const [row] = await db.execute<{ id: string }>(sql`
    select claims.id
    from claims
    join object_domain_memberships memberships
      on memberships.object_id = claims.id
    where memberships.domain_id = ${input.domainId}
      and memberships.membership_state = 'member'
      and lower(claims.claim_text) = lower(${input.text})
      and not exists (
        select 1
        from (values ${uuidSqlValueRows(input.targetSubjectIds)}) as target_ids(target_subject_id)
        where not exists (
          select 1
          from claim_targets
          where claim_targets.claim_id = claims.id
            and claim_targets.target_object_id = target_ids.target_subject_id
            and claim_targets.target_role = 'about'
        )
      )
    limit 1
  `);

  return row ?? null;
}

async function loadPackageRows(bundleId: string): Promise<PackageRow[]> {
  return db.execute<PackageRow>(sql`
    select
      extraction_claims.id as "extractionClaimId",
      extraction_claims.claim_id as "claimId",
      extraction_claims.text,
      extraction_claims.kind::text as kind,
      extraction_claims.modality::text as modality,
      extraction_claims.assertion::text as assertion,
      extraction_claim_mentions.text as "subjectText",
      lower(regexp_replace(extraction_claim_mentions.text, '[^a-zA-Z0-9]+', '-', 'g')) as "normalizedSubject"
    from extraction_claim_mentions
    join extraction_claims
      on extraction_claims.id = extraction_claim_mentions.claim_row_id
    where extraction_claims.bundle_id = ${bundleId}
      and extraction_claim_mentions.role = 'g_subject'
    order by
      lower(extraction_claim_mentions.text),
      extraction_claims.claim_id,
      extraction_claim_mentions.position
  `);
}

export async function getWorkshopAdmissionPackages(
  domainSlug: string
): Promise<WorkshopSubjectPackage[]> {
  const rows = await db.execute<AdmissionPackageRow>(sql`
    with package_rows as (
      select
        extraction_bundles.id as "bundleId",
        extraction_bundles.label as "bundleLabel",
        extraction_bundles.updated_at as "bundleUpdatedAt",
        extraction_claims.id as "extractionClaimId",
        extraction_claims.claim_id as "claimId",
        extraction_claims.text,
        extraction_claims.kind::text as kind,
        extraction_claims.modality::text as modality,
        extraction_claims.assertion::text as assertion,
        extraction_claim_mentions.text as "subjectText",
        workshop_claim_decisions.outcome as "claimDecisionOutcome",
        lower(regexp_replace(extraction_claim_mentions.text, '[^a-zA-Z0-9]+', '-', 'g')) as "normalizedSubject"
      from extraction_claim_mentions
      join extraction_claims
        on extraction_claims.id = extraction_claim_mentions.claim_row_id
      join extraction_bundles
        on extraction_bundles.id = extraction_claims.bundle_id
      join domains
        on domains.id = extraction_bundles.domain_id
      left join workshop_package_decisions
        on workshop_package_decisions.bundle_id = extraction_bundles.id
        and workshop_package_decisions.normalized_subject = lower(regexp_replace(extraction_claim_mentions.text, '[^a-zA-Z0-9]+', '-', 'g'))
      left join workshop_claim_decisions
        on workshop_claim_decisions.claim_row_id = extraction_claims.id
      where domains.slug = ${domainSlug}
        and extraction_claim_mentions.role = 'g_subject'
        and extraction_bundles.status <> 'archived'
        and workshop_package_decisions.outcome is null
        and (
          workshop_claim_decisions.outcome is null
          or workshop_claim_decisions.outcome = 'deferred'
        )
    )
    select *
    from package_rows
    order by
      "bundleUpdatedAt" desc,
      lower("subjectText"),
      "claimId"
  `);
  const packages = new Map<string, WorkshopSubjectPackage>();

  for (const row of rows) {
    const isDeferred = row.claimDecisionOutcome === "deferred";
    const packageSubject = isDeferred ? "Deferred" : row.subjectText;
    const packageSlug = isDeferred ? "deferred" : row.normalizedSubject;
    const packageKey = `${row.bundleId}:${packageSlug}`;
    const existing = packages.get(packageKey);
    const claim: WorkshopPackageClaim = {
      assertion: row.assertion,
      claimId: row.claimId,
      id: row.extractionClaimId,
      kind: row.kind,
      modality: row.modality,
      text: row.text,
    };

    if (existing) {
      if (isDeferred && existing.claims.some((item) => item.id === claim.id)) {
        continue;
      }

      existing.claims.push(claim);
      existing.claimCount += 1;
      continue;
    }

    packages.set(packageKey, {
      admittedClaimCount: 0,
      claimCount: 1,
      claims: [claim],
      decision: null,
      normalizedSubject: packageKey,
      state: isDeferred ? "deferred" : "ready",
      subject: `${packageSubject} (${row.bundleLabel})`,
    });
  }

  return Array.from(packages.values()).sort((left, right) => {
    if (left.state === "deferred" && right.state !== "deferred") {
      return 1;
    }
    if (left.state !== "deferred" && right.state === "deferred") {
      return -1;
    }

    return left.subject.localeCompare(right.subject);
  });
}

export async function markWorkshopClaimProcessed(
  claimRowId: string
): Promise<CommandResult<{ claimRowId: string; outcome: "processed" }>> {
  return markWorkshopClaimDecision(claimRowId, "processed");
}

export async function markWorkshopClaimAdmitted(
  claimRowId: string,
  metadata: WorkshopClaimDecisionMetadata = {}
): Promise<CommandResult<{ claimRowId: string; outcome: "admitted" }>> {
  return markWorkshopClaimDecision(claimRowId, "admitted", metadata);
}

export async function markWorkshopClaimDeferred(
  claimRowId: string
): Promise<CommandResult<{ claimRowId: string; outcome: "deferred" }>> {
  return markWorkshopClaimDecision(claimRowId, "deferred");
}

export async function markWorkshopClaimDuplicate(
  claimRowId: string,
  metadata: WorkshopClaimDecisionMetadata = {}
): Promise<CommandResult<{ claimRowId: string; outcome: "duplicate" }>> {
  return markWorkshopClaimDecision(claimRowId, "duplicate", metadata);
}

export async function markWorkshopClaimRejected(
  claimRowId: string,
  metadata: WorkshopClaimDecisionMetadata = {}
): Promise<CommandResult<{ claimRowId: string; outcome: "rejected" }>> {
  return markWorkshopClaimDecision(claimRowId, "rejected", metadata);
}

export async function markWorkshopClaimSplit(
  claimRowId: string,
  metadata: WorkshopClaimDecisionMetadata = {}
): Promise<CommandResult<{ claimRowId: string; outcome: "split" }>> {
  return markWorkshopClaimDecision(claimRowId, "split", metadata);
}

async function markWorkshopClaimDecision<
  TOutcome extends WorkshopClaimDecisionOutcome,
>(
  claimRowId: string,
  outcome: TOutcome,
  metadata: WorkshopClaimDecisionMetadata = {}
): Promise<CommandResult<{ claimRowId: string; outcome: TOutcome }>> {
  const [claim] = await db
    .select({ id: extractionClaims.id })
    .from(extractionClaims)
    .where(eq(extractionClaims.id, claimRowId))
    .limit(1);

  if (!claim) {
    return err("not_found", "Extracted claim was not found", { claimRowId });
  }

  await db
    .insert(workshopClaimDecisions)
    .values({
      claimRowId,
      outcome,
      resultMetadata: metadata,
    })
    .onConflictDoUpdate({
      target: workshopClaimDecisions.claimRowId,
      set: {
        outcome,
        resultMetadata: metadata,
        updatedAt: new Date(),
      },
    });

  return ok({ claimRowId, outcome });
}

export async function admitExtractedClaimAsClaim(input: {
  claimRowId: string;
  claimText?: string;
  claimTypeSlug?: string;
  domainSlug: string;
  modality?: ClaimModality;
  targetSubjectIds: string[];
}): Promise<
  CommandResult<{
    canonicalClaimId: string;
    claimRowId: string;
    created: boolean;
    outcome: "admitted";
  }>
> {
  if (input.targetSubjectIds.length === 0) {
    return err("invalid_input", "At least one target subject is required");
  }

  const domain = await getDomainBySlug(input.domainSlug);

  if (!domain) {
    return err("not_found", "Domain was not found", {
      domainSlug: input.domainSlug,
    });
  }

  const [claimRow] = await db
    .select({
      assertion: extractionClaims.assertion,
      bundleId: extractionClaims.bundleId,
      claimId: extractionClaims.claimId,
      id: extractionClaims.id,
      kind: extractionClaims.kind,
      modality: extractionClaims.modality,
      text: extractionClaims.text,
    })
    .from(extractionClaims)
    .where(eq(extractionClaims.id, input.claimRowId))
    .limit(1);

  if (!claimRow) {
    return err("not_found", "Extracted claim was not found", {
      claimRowId: input.claimRowId,
    });
  }

  const claimClass = await getClassByKey("claim");

  if (!claimClass) {
    return err("registry_missing", "Claim class is missing from the registry");
  }

  const [claimStatus, claimType] = await Promise.all([
    getDefaultStatusForClass(claimClass.id),
    getTypeBySlug({
      classKey: "claim",
      domainId: domain.id,
      slug: input.claimTypeSlug ?? claimRow.kind,
    }),
  ]);

  if (!claimType) {
    return err("invalid_input", "Claim type was not found", {
      claimTypeSlug: input.claimTypeSlug ?? claimRow.kind,
    });
  }

  const targets = await db.execute<{ id: string }>(sql`
    select subjects.id
    from subjects
    join object_domain_memberships memberships
      on memberships.object_id = subjects.id
    where memberships.domain_id = ${domain.id}
      and memberships.membership_state = 'member'
      and subjects.id in (${uuidSqlList(input.targetSubjectIds)})
  `);
  const foundTargetIds = new Set(targets.map((target) => target.id));
  const invalidTargetSubjectIds = input.targetSubjectIds.filter(
    (targetSubjectId) => !foundTargetIds.has(targetSubjectId)
  );

  if (invalidTargetSubjectIds.length > 0) {
    return err("invalid_input", "Claim target is invalid", {
      targetSubjectIds: invalidTargetSubjectIds,
    });
  }

  const claimText = input.claimText?.trim() || claimRow.text;
  const modality = input.modality ?? claimRow.modality;
  const existingClaim = await getExistingClaimWithTargets({
    domainId: domain.id,
    targetSubjectIds: input.targetSubjectIds,
    text: claimText,
  });

  const canonicalClaimId = await db.transaction(async (tx) => {
    if (existingClaim) {
      await tx
        .insert(workshopClaimDecisions)
        .values({
          claimRowId: claimRow.id,
          outcome: "admitted",
          resultMetadata: {
            resultClaimIds: [existingClaim.id],
            resultRecordIds: [existingClaim.id],
          },
        })
        .onConflictDoUpdate({
          target: workshopClaimDecisions.claimRowId,
          set: {
            outcome: "admitted",
            resultMetadata: {
              resultClaimIds: [existingClaim.id],
              resultRecordIds: [existingClaim.id],
            },
            updatedAt: new Date(),
          },
        });

      return existingClaim.id;
    }

    const [objectRow] = await tx
      .insert(objects)
      .values({ classId: claimClass.id })
      .returning({ id: objects.id });

    if (!objectRow) {
      throw new Error("Claim object insert failed");
    }

    await tx.insert(objectDomainMemberships).values({
      domainId: domain.id,
      objectId: objectRow.id,
    });
    await tx.insert(claims).values({
      id: objectRow.id,
      assertionState: "accepted",
      claimText,
      claimTypeId: claimType.id,
      metadata: {
        extractionAssertion: claimRow.assertion,
        extractionBundleId: claimRow.bundleId,
        extractionClaimId: claimRow.id,
        extractionModality: modality,
      },
      modality,
      source: `extraction:${claimRow.bundleId}:${claimRow.claimId}`,
      statusId: claimStatus?.id ?? null,
    });
    await tx.insert(claimTargets).values(
      input.targetSubjectIds.map((targetSubjectId, position) => ({
        claimId: objectRow.id,
        position,
        targetObjectId: targetSubjectId,
        targetRole: "about",
      }))
    );

    const [provenance] = await tx
      .select({
        runId: extractionBundles.runId,
        sourceUnitId: extractionClaimProvenance.sourceUnitId,
      })
      .from(extractionClaims)
      .innerJoin(
        extractionBundles,
        eq(extractionBundles.id, extractionClaims.bundleId)
      )
      .leftJoin(
        extractionClaimProvenance,
        eq(extractionClaimProvenance.claimRowId, extractionClaims.id)
      )
      .where(eq(extractionClaims.id, claimRow.id))
      .limit(1);

    await tx.insert(recordProvenance).values({
      recordClassKey: "claim",
      recordId: objectRow.id,
      runId: provenance?.runId ?? null,
      sourceUnitId: provenance?.sourceUnitId ?? null,
    });
    await tx
      .insert(workshopClaimDecisions)
      .values({
        claimRowId: claimRow.id,
        outcome: "admitted",
        resultMetadata: {
          resultClaimIds: [objectRow.id],
          resultRecordIds: [objectRow.id],
        },
      })
      .onConflictDoUpdate({
        target: workshopClaimDecisions.claimRowId,
        set: {
          outcome: "admitted",
          resultMetadata: {
            resultClaimIds: [objectRow.id],
            resultRecordIds: [objectRow.id],
          },
          updatedAt: new Date(),
        },
      });

    return objectRow.id;
  });

  return ok({
    canonicalClaimId,
    claimRowId: claimRow.id,
    created: !existingClaim,
    outcome: "admitted",
  });
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

async function resolvePlanSubjectId(input: {
  domainId: string;
  label?: string;
  subjectId?: string;
  subjectIdsByKey: Map<string, string>;
  subjectKey?: string;
}) {
  if (input.subjectId) {
    return input.subjectId;
  }

  if (input.subjectKey) {
    const subjectId = input.subjectIdsByKey.get(input.subjectKey);

    if (!subjectId) {
      return null;
    }

    return subjectId;
  }

  if (input.label) {
    return (
      (
        await getExactSubject({
          domainId: input.domainId,
          label: input.label,
        })
      )?.id ?? null
    );
  }

  return null;
}

async function resolvePlanTypeId(input: {
  classKey: "relationship" | "subject";
  domainId: string;
  typeId?: string;
  typeSlug?: string;
}) {
  if (input.typeId) {
    return input.typeId;
  }

  if (!input.typeSlug) {
    return null;
  }

  return (
    (
      await getTypeBySlug({
        classKey: input.classKey,
        domainId: input.domainId,
        slug: input.typeSlug,
      })
    )?.id ?? null
  );
}

export async function applyAdmissionPlan(
  input: ApplyAdmissionPlanInput
): Promise<
  CommandResult<{
    admittedClaims: Array<{
      canonicalClaimId: string;
      claimRowId: string;
      created: boolean;
    }>;
    deferredClaims: string[];
    duplicateClaims: string[];
    processedClaims: string[];
    rejectedClaims: string[];
    relationships: Array<{
      created: boolean;
      id: string;
      key: string | null;
    }>;
    splitClaims: string[];
    subjects: Array<{
      created: boolean;
      id: string;
      key: string | null;
      label: string;
    }>;
  }>
> {
  const parsed = applyAdmissionPlanInput.safeParse(input);

  if (!parsed.success) {
    return err("invalid_input", "Admission plan input is invalid", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const plan = parsed.data;
  const domain = await getDomainBySlug(plan.domainSlug);

  if (!domain) {
    return err("not_found", "Domain was not found", {
      domainSlug: plan.domainSlug,
    });
  }

  const subjectIdsByKey = new Map<string, string>();
  const subjectResults: Array<{
    created: boolean;
    id: string;
    key: string | null;
    label: string;
  }> = [];
  const relationshipResults: Array<{
    created: boolean;
    id: string;
    key: string | null;
  }> = [];
  const admittedClaims: Array<{
    canonicalClaimId: string;
    claimRowId: string;
    created: boolean;
  }> = [];
  const processedClaims: string[] = [];
  const deferredClaims: string[] = [];
  const duplicateClaims: string[] = [];
  const rejectedClaims: string[] = [];
  const splitClaims: string[] = [];

  for (const subjectPlan of plan.subjects ?? []) {
    const existingSubject = await getExactSubject({
      domainId: domain.id,
      label: subjectPlan.canonicalLabel,
    });
    let subjectId = existingSubject?.id ?? null;
    let created = false;

    if (!subjectId) {
      const subjectTypeId = await resolvePlanTypeId({
        classKey: "subject",
        domainId: domain.id,
        typeId: subjectPlan.subjectTypeId,
        typeSlug: subjectPlan.subjectTypeSlug,
      });

      if (!subjectTypeId) {
        return err("invalid_input", "Subject type is required", {
          subject: subjectPlan.canonicalLabel,
        });
      }

      const result = await createSubject(plan.domainSlug, {
        canonicalLabel: subjectPlan.canonicalLabel,
        description: subjectPlan.description,
        statusId: subjectPlan.statusId,
        subjectTypeId,
      });

      if (!result.ok) {
        return err(
          result.error.code || "create_subject_failed",
          result.error.message || "Subject could not be created",
          result.error.details
        );
      }

      subjectId = result.data.id;
      created = true;

      if (subjectPlan.provenanceClaimRowId) {
        await attachExtractionProvenance({
          claimRowId: subjectPlan.provenanceClaimRowId,
          recordClassKey: "subject",
          recordId: subjectId,
        });
      }
    }

    if (subjectPlan.key) {
      subjectIdsByKey.set(subjectPlan.key, subjectId);
    }

    subjectResults.push({
      created,
      id: subjectId,
      key: subjectPlan.key ?? null,
      label: subjectPlan.canonicalLabel,
    });
  }

  for (const relationshipPlan of plan.relationships ?? []) {
    const relationshipTypeId = await resolvePlanTypeId({
      classKey: "relationship",
      domainId: domain.id,
      typeId: relationshipPlan.relationshipTypeId,
      typeSlug: relationshipPlan.relationshipTypeSlug,
    });

    if (!relationshipTypeId) {
      return err("invalid_input", "Relationship type is required", {
        relationship: relationshipPlan.key ?? null,
      });
    }

    const [sourceSubjectId, targetSubjectId] = await Promise.all([
      resolvePlanSubjectId({
        domainId: domain.id,
        label: relationshipPlan.sourceSubjectLabel,
        subjectId: relationshipPlan.sourceSubjectId,
        subjectIdsByKey,
        subjectKey: relationshipPlan.sourceSubjectKey,
      }),
      resolvePlanSubjectId({
        domainId: domain.id,
        label: relationshipPlan.targetSubjectLabel,
        subjectId: relationshipPlan.targetSubjectId,
        subjectIdsByKey,
        subjectKey: relationshipPlan.targetSubjectKey,
      }),
    ]);

    if (!sourceSubjectId || !targetSubjectId) {
      return err(
        "invalid_input",
        "Relationship endpoint could not be resolved",
        {
          relationship: relationshipPlan.key ?? null,
          sourceSubject:
            relationshipPlan.sourceSubjectKey ??
            relationshipPlan.sourceSubjectLabel ??
            relationshipPlan.sourceSubjectId ??
            null,
          targetSubject:
            relationshipPlan.targetSubjectKey ??
            relationshipPlan.targetSubjectLabel ??
            relationshipPlan.targetSubjectId ??
            null,
        }
      );
    }

    const existingRelationship = await getExactRelationship({
      domainId: domain.id,
      relationshipTypeId,
      sourceSubjectId,
      targetSubjectId,
    });
    let relationshipId = existingRelationship?.id ?? null;
    let created = false;

    if (!relationshipId) {
      const result = await createRelationship(plan.domainSlug, {
        relationshipTypeId,
        sourceSubjectId,
        targetSubjectId,
      });

      if (!result.ok) {
        return err(
          result.error.code || "create_relationship_failed",
          result.error.message || "Relationship could not be created",
          result.error.details
        );
      }

      relationshipId = result.data.id;
      created = true;

      if (relationshipPlan.provenanceClaimRowId) {
        await attachExtractionProvenance({
          claimRowId: relationshipPlan.provenanceClaimRowId,
          recordClassKey: "relationship",
          recordId: relationshipId,
        });
      }
    }

    relationshipResults.push({
      created,
      id: relationshipId,
      key: relationshipPlan.key ?? null,
    });
  }

  for (const claimPlan of plan.admitClaims ?? []) {
    const targetSubjectIds = uniqueIds([
      ...(claimPlan.targetSubjectIds ?? []),
      ...(
        await Promise.all(
          (claimPlan.targetSubjectKeys ?? []).map((subjectKey) =>
            resolvePlanSubjectId({
              domainId: domain.id,
              subjectIdsByKey,
              subjectKey,
            })
          )
        )
      ).filter((id): id is string => Boolean(id)),
      ...(
        await Promise.all(
          (claimPlan.targetSubjectLabels ?? []).map((label) =>
            resolvePlanSubjectId({
              domainId: domain.id,
              label,
              subjectIdsByKey,
            })
          )
        )
      ).filter((id): id is string => Boolean(id)),
    ]);

    if (targetSubjectIds.length === 0) {
      return err("invalid_input", "Claim target could not be resolved", {
        claimRowId: claimPlan.claimRowId,
      });
    }

    const result = await admitExtractedClaimAsClaim({
      claimRowId: claimPlan.claimRowId,
      claimText: claimPlan.claimText,
      claimTypeSlug: claimPlan.claimTypeSlug,
      domainSlug: plan.domainSlug,
      modality: claimPlan.modality,
      targetSubjectIds,
    });

    if (!result.ok) {
      return err(
        result.error.code || "admit_claim_failed",
        result.error.message || "Extracted claim could not be admitted",
        result.error.details
      );
    }

    admittedClaims.push({
      canonicalClaimId: result.data.canonicalClaimId,
      claimRowId: result.data.claimRowId,
      created: result.data.created,
    });
  }

  for (const claimRowId of plan.processClaims ?? []) {
    const result = await markWorkshopClaimProcessed(claimRowId);
    const resultError = collectResultError(
      result,
      "process_claim_failed",
      "Extracted claim could not be marked processed"
    );

    if (resultError) {
      return err(resultError.code, resultError.message, resultError.details);
    }

    processedClaims.push(claimRowId);
  }

  for (const claimPlan of plan.duplicateClaims ?? []) {
    const result = await markWorkshopClaimDuplicate(claimPlan.claimRowId, {
      note: claimPlan.note,
      resultClaimIds: claimPlan.resultClaimIds,
      resultRecordIds: claimPlan.resultRecordIds,
      resultRelationshipIds: claimPlan.resultRelationshipIds,
    });
    const resultError = collectResultError(
      result,
      "duplicate_claim_failed",
      "Extracted claim could not be marked duplicate"
    );

    if (resultError) {
      return err(resultError.code, resultError.message, resultError.details);
    }

    duplicateClaims.push(claimPlan.claimRowId);
  }

  for (const claimPlan of plan.splitClaims ?? []) {
    const result = await markWorkshopClaimSplit(claimPlan.claimRowId, {
      note: claimPlan.note,
      resultClaimIds: claimPlan.resultClaimIds,
      resultRecordIds: claimPlan.resultRecordIds,
      resultRelationshipIds: claimPlan.resultRelationshipIds,
    });
    const resultError = collectResultError(
      result,
      "split_claim_failed",
      "Extracted claim could not be marked split"
    );

    if (resultError) {
      return err(resultError.code, resultError.message, resultError.details);
    }

    splitClaims.push(claimPlan.claimRowId);
  }

  for (const claimPlan of plan.rejectClaims ?? []) {
    const result = await markWorkshopClaimRejected(claimPlan.claimRowId, {
      note: claimPlan.note,
    });
    const resultError = collectResultError(
      result,
      "reject_claim_failed",
      "Extracted claim could not be rejected"
    );

    if (resultError) {
      return err(resultError.code, resultError.message, resultError.details);
    }

    rejectedClaims.push(claimPlan.claimRowId);
  }

  for (const claimRowId of plan.deferClaims ?? []) {
    const result = await markWorkshopClaimDeferred(claimRowId);
    const resultError = collectResultError(
      result,
      "defer_claim_failed",
      "Extracted claim could not be deferred"
    );

    if (resultError) {
      return err(resultError.code, resultError.message, resultError.details);
    }

    deferredClaims.push(claimRowId);
  }

  if (
    admittedClaims.length > 0 ||
    deferredClaims.length > 0 ||
    duplicateClaims.length > 0 ||
    processedClaims.length > 0 ||
    rejectedClaims.length > 0 ||
    relationshipResults.length > 0 ||
    splitClaims.length > 0 ||
    subjectResults.length > 0
  ) {
    await bumpWorkspaceRefreshSignal(plan.domainSlug);
  }

  return ok({
    admittedClaims,
    deferredClaims,
    duplicateClaims,
    processedClaims,
    rejectedClaims,
    relationships: relationshipResults,
    splitClaims,
    subjects: subjectResults,
  });
}

function groupPackages(input: {
  decisions: Array<typeof workshopPackageDecisions.$inferSelect>;
  rows: PackageRow[];
}): WorkshopSubjectPackage[] {
  const decisionsBySubject = new Map(
    input.decisions.map((decision) => [decision.normalizedSubject, decision])
  );
  const packages = new Map<string, WorkshopSubjectPackage>();

  for (const row of input.rows) {
    const decision = decisionsBySubject.get(row.normalizedSubject) ?? null;
    const existing = packages.get(row.normalizedSubject);
    const resultingClaimIds =
      decision && Array.isArray(decision.resultingClaimIds)
        ? decision.resultingClaimIds.filter(
            (id): id is string => typeof id === "string"
          )
        : [];
    const claim: WorkshopPackageClaim = {
      assertion: row.assertion,
      claimId: row.claimId,
      id: row.extractionClaimId,
      kind: row.kind,
      modality: row.modality,
      text: row.text,
    };

    if (existing) {
      existing.claims.push(claim);
      existing.claimCount += 1;
      continue;
    }

    const state =
      decision?.outcome === "admit"
        ? "admitted"
        : decision?.outcome === "defer"
          ? "deferred"
          : decision?.outcome === "reject"
            ? "rejected"
            : "ready";

    packages.set(row.normalizedSubject, {
      admittedClaimCount: resultingClaimIds.length,
      claimCount: 1,
      claims: [claim],
      decision: decision
        ? {
            outcome: decision.outcome,
            resultingClaimIds,
            resultingSubjectId: decision.resultingSubjectId,
            targetSubjectId: decision.targetSubjectId,
          }
        : null,
      normalizedSubject: row.normalizedSubject,
      state,
      subject: row.subjectText,
    });
  }

  return Array.from(packages.values()).sort((left, right) =>
    left.subject.localeCompare(right.subject)
  );
}

async function recomputeBundleStatus(bundleId: string) {
  const [packages, decisions] = await Promise.all([
    loadPackageRows(bundleId),
    db
      .select()
      .from(workshopPackageDecisions)
      .where(eq(workshopPackageDecisions.bundleId, bundleId)),
  ]);
  const normalizedSubjects = new Set(
    packages.map((row) => row.normalizedSubject)
  );
  const resolvedSubjects = new Set(
    decisions
      .filter((decision) =>
        ["admit", "defer", "reject"].includes(decision.outcome)
      )
      .map((decision) => decision.normalizedSubject)
  );
  const status =
    normalizedSubjects.size > 0 &&
    resolvedSubjects.size >= normalizedSubjects.size
      ? "committed"
      : "needs_review";

  await db
    .update(extractionBundles)
    .set({ status })
    .where(eq(extractionBundles.id, bundleId));

  return status;
}

export async function getWorkshopBundleReview(
  domainSlug: string,
  bundleId: string
): Promise<WorkshopBundleReview | null> {
  const [header] = await db.execute<{
    bundleId: string;
    bundleLabel: string;
    bundleStatus: string;
    documentId: string;
    documentLabel: string;
    runId: string;
    runStatus: string;
  }>(sql`
    select
      extraction_bundles.id as "bundleId",
      extraction_bundles.label as "bundleLabel",
      extraction_bundles.status as "bundleStatus",
      documents.id as "documentId",
      documents.label as "documentLabel",
      pipeline_runs.id as "runId",
      pipeline_runs.status as "runStatus"
    from extraction_bundles
    join domains on domains.id = extraction_bundles.domain_id
    join documents on documents.id = extraction_bundles.document_id
    join pipeline_runs on pipeline_runs.id = extraction_bundles.run_id
    where extraction_bundles.id = ${bundleId}
      and domains.slug = ${domainSlug}
    limit 1
  `);

  if (!header) {
    return null;
  }

  const [rows, decisions] = await Promise.all([
    loadPackageRows(bundleId),
    db
      .select()
      .from(workshopPackageDecisions)
      .where(eq(workshopPackageDecisions.bundleId, bundleId)),
  ]);
  const packages = groupPackages({ decisions, rows });
  const admitted = packages.filter((pkg) => pkg.state === "admitted").length;
  const ready = packages.filter((pkg) => pkg.state === "ready").length;

  return {
    bundle: {
      id: header.bundleId,
      label: header.bundleLabel,
      status: header.bundleStatus,
    },
    counts: {
      admitted,
      ready,
      total: packages.length,
    },
    document: {
      id: header.documentId,
      label: header.documentLabel,
    },
    packages,
    run: {
      id: header.runId,
      labHref: shortRunHref(domainSlug, header.runId),
      status: header.runStatus,
    },
  };
}

export async function resolveWorkshopSubjectPackage(
  domainSlug: string,
  bundleId: string,
  decision: WorkshopSubjectPackageDecision
): Promise<CommandResult<WorkshopSubjectPackageResult>> {
  const domain = await getDomainBySlug(domainSlug);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  const normalizedSubject = normalizeSubject(decision.subject);
  const packageRows = (await loadPackageRows(bundleId)).filter(
    (row) => row.normalizedSubject === normalizedSubject
  );

  if (packageRows.length === 0) {
    return err("not_found", "Subject package was not found", {
      bundleId,
      subject: decision.subject,
    });
  }

  if (decision.mode === "defer" || decision.mode === "reject") {
    await db
      .insert(workshopPackageDecisions)
      .values({
        bundleId,
        normalizedSubject,
        outcome: decision.mode,
        subjectText: decision.subject,
      })
      .onConflictDoUpdate({
        target: [
          workshopPackageDecisions.bundleId,
          workshopPackageDecisions.normalizedSubject,
        ],
        set: {
          outcome: decision.mode,
          subjectText: decision.subject,
          updatedAt: new Date(),
        },
      });
    await recomputeBundleStatus(bundleId);

    return ok({
      admittedClaimCount: 0,
      bundleId,
      resultingClaimIds: [],
      resultingSubjectId: null,
      subject: decision.subject,
    });
  }

  const [subjectClass, claimClass] = await Promise.all([
    getClassByKey("subject"),
    getClassByKey("claim"),
  ]);

  if (!subjectClass || !claimClass) {
    return err("registry_missing", "Subject or claim class is missing");
  }

  const [subjectStatus, claimStatus, subjectType] = await Promise.all([
    getDefaultStatusForClass(subjectClass.id),
    getDefaultStatusForClass(claimClass.id),
    getTypeBySlug({
      classKey: "subject",
      domainId: domain.id,
      slug: "concept",
    }),
  ]);

  if (!subjectType) {
    return err("registry_missing", "Default subject type is missing");
  }

  const claimTypeByKind = new Map<string, string>();
  const resultingClaimIds: string[] = [];

  try {
    const resultingSubjectId = await db.transaction(async (tx) => {
      const existingSubject = await getExactSubject({
        domainId: domain.id,
        label: decision.subject,
      });
      let subjectId = existingSubject?.id ?? null;

      if (!subjectId) {
        const [objectRow] = await tx
          .insert(objects)
          .values({ classId: subjectClass.id })
          .returning({ id: objects.id });

        if (!objectRow) {
          throw new Error("Subject object insert failed");
        }

        subjectId = objectRow.id;

        await tx.insert(objectDomainMemberships).values({
          domainId: domain.id,
          objectId: subjectId,
        });
        await tx.insert(subjects).values({
          id: subjectId,
          canonicalLabel: decision.subject,
          description: "",
          source: `extraction:${bundleId}`,
          statusId: subjectStatus?.id ?? null,
          subjectTypeId: subjectType.id,
        });
      }

      await tx.insert(recordProvenance).values({
        recordClassKey: "subject",
        recordId: subjectId,
        runId: null,
        sourceUnitId: null,
      });

      for (const packageRow of packageRows) {
        const existingClaim = await getExistingClaim({
          domainId: domain.id,
          subjectId,
          text: packageRow.text,
        });

        if (existingClaim) {
          resultingClaimIds.push(existingClaim.id);
          continue;
        }

        let claimTypeId = claimTypeByKind.get(packageRow.kind);

        if (!claimTypeId) {
          const claimType = await getTypeBySlug({
            classKey: "claim",
            domainId: domain.id,
            slug: packageRow.kind,
          });

          if (!claimType) {
            throw new Error(`Claim type was not found: ${packageRow.kind}`);
          }

          claimTypeId = claimType.id;
          claimTypeByKind.set(packageRow.kind, claimTypeId);
        }

        const [objectRow] = await tx
          .insert(objects)
          .values({ classId: claimClass.id })
          .returning({ id: objects.id });

        if (!objectRow) {
          throw new Error("Claim object insert failed");
        }

        await tx.insert(objectDomainMemberships).values({
          domainId: domain.id,
          objectId: objectRow.id,
        });
        await tx.insert(claims).values({
          id: objectRow.id,
          assertionState: "accepted",
          claimText: packageRow.text,
          claimTypeId,
          modality: packageRow.modality,
          metadata: {
            extractionAssertion: packageRow.assertion,
            extractionBundleId: bundleId,
            extractionClaimId: packageRow.extractionClaimId,
            extractionModality: packageRow.modality,
          },
          source: `extraction:${bundleId}:${packageRow.claimId}`,
          statusId: claimStatus?.id ?? null,
        });
        await tx.insert(claimTargets).values({
          claimId: objectRow.id,
          position: 0,
          targetObjectId: subjectId,
          targetRole: "about",
        });

        const [provenance] = await tx
          .select({
            runId: extractionBundles.runId,
            sourceUnitId: extractionClaimProvenance.sourceUnitId,
          })
          .from(extractionClaims)
          .innerJoin(
            extractionBundles,
            eq(extractionBundles.id, extractionClaims.bundleId)
          )
          .leftJoin(
            extractionClaimProvenance,
            eq(extractionClaimProvenance.claimRowId, extractionClaims.id)
          )
          .where(eq(extractionClaims.id, packageRow.extractionClaimId))
          .limit(1);

        await tx.insert(recordProvenance).values({
          recordClassKey: "claim",
          recordId: objectRow.id,
          runId: provenance?.runId ?? null,
          sourceUnitId: provenance?.sourceUnitId ?? null,
        });

        resultingClaimIds.push(objectRow.id);
      }

      await tx
        .insert(workshopPackageDecisions)
        .values({
          bundleId,
          normalizedSubject,
          outcome: "admit",
          resultingClaimIds,
          resultingSubjectId: subjectId,
          subjectText: decision.subject,
          targetSubjectId: existingSubject?.id ?? null,
        })
        .onConflictDoUpdate({
          target: [
            workshopPackageDecisions.bundleId,
            workshopPackageDecisions.normalizedSubject,
          ],
          set: {
            errorMessage: null,
            outcome: "admit",
            resultingClaimIds,
            resultingSubjectId: subjectId,
            subjectText: decision.subject,
            targetSubjectId: existingSubject?.id ?? null,
            updatedAt: new Date(),
          },
        });

      return subjectId;
    });

    await recomputeBundleStatus(bundleId);

    return ok({
      admittedClaimCount: resultingClaimIds.length,
      bundleId,
      resultingClaimIds,
      resultingSubjectId,
      subject: decision.subject,
    });
  } catch (error) {
    await db
      .insert(workshopPackageDecisions)
      .values({
        bundleId,
        errorMessage: error instanceof Error ? error.message : String(error),
        normalizedSubject,
        outcome: "failed",
        subjectText: decision.subject,
      })
      .onConflictDoUpdate({
        target: [
          workshopPackageDecisions.bundleId,
          workshopPackageDecisions.normalizedSubject,
        ],
        set: {
          errorMessage: error instanceof Error ? error.message : String(error),
          outcome: "failed",
          subjectText: decision.subject,
          updatedAt: new Date(),
        },
      });

    return err(
      "admission_failed",
      error instanceof Error ? error.message : String(error)
    );
  }
}
