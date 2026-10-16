import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/data/client";
import { getClaimDetail, searchClaims } from "@/services/claims";
import { getPreparedDocument, listDocuments } from "@/services/documents";
import { getDomainMapSnapshot } from "@/services/domain-maps";
import {
  getDomainActivity,
  getDomainById,
  getDomainBySlug,
  getDomainInventory,
} from "@/services/domains";
import { getRelationshipDetail } from "@/services/relationships";
import { getSubjectDetail, searchSubjects } from "@/services/subjects";
import { getTypeDetail } from "@/services/types";
import { getWorkshopBundleReview } from "@/services/workshop";

const defaultLimit = 12;
const maxLimit = 40;
const defaultClaimLengthLimit = 100;
const defaultLowWeightLimit = 100;
const maxClaimLengthLimit = 500;
const maxLowWeightLimit = 500;
const defaultSourceUnitLimit = 8;
const maxExcerptLength = 1_200;
const maxRecordBodyLength = 200_000;
const maxGuidanceBlockLength = 2_000;
const maxSkillMarkdownLength = 16_000;
const maxSkillReferenceLength = 24_000;
const agentGuidanceRoot = path.join(process.cwd(), "agent-guidance");
const availableSkillIds = new Set([
  "admission",
  "document-inspection",
  "extraction",
  "knowledge-model",
]);

type DomainRef = {
  domainId?: string | null;
  domainSlug?: string | null;
};

type DomainScope = {
  id: string;
  label: string;
  slug: string;
};

type GuidanceSection = {
  body: string;
  bodyLength: number;
  bodyTruncated: boolean;
};

type AgentSkillGuidanceInput = {
  referencePaths?: string[];
  skill: string;
};

type ClaimTextLengthRow = {
  claimId: string;
  claimText: string;
  claimTypeLabel: string | null;
  reviewId: string;
  reviewNumber: number;
  statusLabel: string | null;
  targets: string[] | null;
};

type NumericStats = {
  max: number;
  mean: number;
  min: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
};

type LowWeightSubjectRow = {
  claimCount: number;
  groupLabel: string | null;
  id: string;
  label: string;
  relationshipCount: number;
  statusLabel: string | null;
  subjectTypeLabel: string | null;
  subjectTypeSlug: string | null;
  weight: number;
};

type LowWeightReviewHint =
  | "named_anchor"
  | "orphan"
  | "relationship_only"
  | "thin_concept"
  | "underused_structure";

async function resolveDomain(input: DomainRef): Promise<DomainScope | null> {
  const domainId = input.domainId?.trim();
  const domainSlug = input.domainSlug?.trim();
  const domain = domainId
    ? await getDomainById(domainId)
    : domainSlug
      ? await getDomainBySlug(domainSlug)
      : null;

  if (!domain) {
    return null;
  }

  return {
    id: domain.id,
    label: domain.label,
    slug: domain.slug,
  };
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function boundedText(
  value: string,
  maxLength = maxExcerptLength
): GuidanceSection {
  const body = compactText(value);
  const bodyTruncated = body.length > maxLength;

  return {
    body: bodyTruncated ? body.slice(0, maxLength).trimEnd() : body,
    bodyLength: body.length,
    bodyTruncated,
  };
}

function boundedMarkdown(value: string, maxLength: number): GuidanceSection {
  const body = value.trim();
  const bodyTruncated = body.length > maxLength;

  return {
    body: bodyTruncated ? body.slice(0, maxLength).trimEnd() : body,
    bodyLength: body.length,
    bodyTruncated,
  };
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function assertKnownSkillId(skill: string) {
  if (!availableSkillIds.has(skill)) {
    throw new Error(
      `Unknown skill "${skill}". Available skills: ${[...availableSkillIds]
        .sort()
        .join(", ")}.`
    );
  }
}

function assertSafeSkillReferencePath(referencePath: string) {
  if (
    referencePath.length === 0 ||
    referencePath.startsWith("/") ||
    referencePath.includes("\\") ||
    referencePath
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(
      `Invalid skill reference path "${referencePath}". Use a relative path inside the skill directory.`
    );
  }
}

function compileGuidanceBlock(input: {
  document: {
    documentForm: string;
    label: string;
    structuralNotes: string | null;
  } | null;
  domain: DomainScope | null;
}) {
  const domain = input.domain;
  const document = input.document;

  if (!document) {
    return null;
  }

  const lines = [
    ...(domain ? [`Domain: ${domain.label} (${domain.id})`] : []),
    `Document identification: ${[
      document.documentForm,
      document.structuralNotes,
    ]
      .filter(Boolean)
      .join("; ")}`,
  ].filter((line) => line.trim().length > 0);

  if (lines.length <= 1) {
    return null;
  }

  return boundedText(lines.join("\n"), maxGuidanceBlockLength);
}

export async function getAgentSkillGuidance(input: AgentSkillGuidanceInput) {
  const skill = input.skill.trim();
  assertKnownSkillId(skill);

  const skillRoot = path.join(agentGuidanceRoot, skill);
  const skillMarkdown = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const references = await Promise.all(
    (input.referencePaths ?? []).map(async (referencePath) => {
      const normalizedPath = referencePath.trim();
      assertSafeSkillReferencePath(normalizedPath);

      const markdown = await readFile(
        path.join(skillRoot, normalizedPath),
        "utf8"
      );
      const bounded = boundedMarkdown(markdown, maxSkillReferenceLength);

      return {
        body: bounded.body,
        bodyLength: bounded.bodyLength,
        bodyTruncated: bounded.bodyTruncated,
        path: normalizedPath,
      };
    })
  );
  const boundedSkill = boundedMarkdown(
    stripFrontmatter(skillMarkdown),
    maxSkillMarkdownLength
  );

  return {
    references,
    skill: {
      body: boundedSkill.body,
      bodyLength: boundedSkill.bodyLength,
      bodyTruncated: boundedSkill.bodyTruncated,
      name: skill,
    },
  };
}

// Full extraction context for a document in one packet: its identification
// fields plus the selected domain label when available.
export async function getAgentExtractionContext(input: {
  documentId: string;
  domainId?: string | null;
  domainSlug?: string | null;
}) {
  const [prepared, domain] = await Promise.all([
    getPreparedDocument(input.documentId, input.domainSlug?.trim() || undefined),
    resolveDomain({
      domainId: input.domainId,
      domainSlug: input.domainSlug,
    }),
  ]);
  const document = prepared?.document
    ? {
        documentForm: prepared.document.documentForm,
        label: prepared.document.label,
        structuralNotes: prepared.document.structuralNotes,
      }
    : null;

  return {
    documentId: input.documentId,
    document,
    guidanceBlock: compileGuidanceBlock({ document, domain }),
  };
}

function boundedLimit(limit: number | null | undefined) {
  if (!Number.isFinite(limit)) {
    return defaultLimit;
  }

  return Math.min(Math.max(Math.trunc(limit ?? defaultLimit), 1), maxLimit);
}

function boundedClaimLengthLimit(limit: number | null | undefined) {
  if (!Number.isFinite(limit)) {
    return defaultClaimLengthLimit;
  }

  return Math.min(
    Math.max(Math.trunc(limit ?? defaultClaimLengthLimit), 1),
    maxClaimLengthLimit
  );
}

function boundedLowWeightLimit(limit: number | null | undefined) {
  if (!Number.isFinite(limit)) {
    return defaultLowWeightLimit;
  }

  return Math.min(
    Math.max(Math.trunc(limit ?? defaultLowWeightLimit), 1),
    maxLowWeightLimit
  );
}

function boundedMaxWeight(maxWeight: number | null | undefined) {
  if (!Number.isFinite(maxWeight)) {
    return 2;
  }

  return Math.max(Math.trunc(maxWeight ?? 2), 0);
}

export function boundedAgentContextLimit(limit: number | null | undefined) {
  return boundedLimit(limit);
}

function excerpt(value: string, maxLength = maxExcerptLength) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength).trimEnd()}...`;
}

function recordBody(value: string) {
  const bodyLength = value.length;
  const bodyTruncated = bodyLength > maxRecordBodyLength;

  return {
    body: bodyTruncated ? value.slice(0, maxRecordBodyLength) : value,
    bodyLength,
    bodyTruncated,
  };
}

function characterCount(value: string) {
  return Array.from(value).length;
}

function wordCount(value: string) {
  const trimmed = value.trim();

  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;

  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

function numericStats(values: number[]): NumericStats {
  if (values.length === 0) {
    return { max: 0, mean: 0, min: 0, p50: 0, p75: 0, p90: 0, p95: 0 };
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    max: sortedValues[sortedValues.length - 1],
    mean: Number((sum / values.length).toFixed(2)),
    min: sortedValues[0],
    p50: percentile(sortedValues, 50),
    p75: percentile(sortedValues, 75),
    p90: percentile(sortedValues, 90),
    p95: percentile(sortedValues, 95),
  };
}

function iso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function getAgentDomainContext(
  input: DomainRef & { limit?: number }
) {
  const domain = await resolveDomain(input);

  if (!domain) {
    return { domain: null };
  }

  const limit = boundedLimit(input.limit);
  const [inventory, activity] = await Promise.all([
    getDomainInventory(domain.id),
    getDomainActivity(domain.id, limit),
  ]);
  const counts = Object.fromEntries(
    inventory.map((item) => [item.key, item.count])
  );

  return {
    claims: activity.claims.map((claim) => ({
      assertionState: claim.assertionState,
      claimText: excerpt(claim.claimText, 500),
      id: claim.id,
      reviewId: claim.reviewId,
      reviewNumber: claim.reviewNumber,
      targetLabel: claim.targetLabel,
      typeLabel: claim.typeLabel,
      updatedAt: iso(claim.updatedAt),
    })),
    counts,
    documents: activity.documents.map((document) => ({
      id: document.id,
      label: document.label,
      preparationState: document.preparationState,
      shardCount: document.shardCount,
      sourceFilename: document.sourceFilename,
      sourceType: document.sourceType,
      updatedAt: iso(document.updatedAt),
    })),
    domain,
    domainMaps: activity.domainMaps.map((domainMap) => ({
      descriptionExcerpt: domainMap.description
        ? excerpt(domainMap.description, 400)
        : null,
      id: domainMap.id,
      label: domainMap.label,
      mapKindLabel: domainMap.mapKindLabel,
      slug: domainMap.slug,
      statusLabel: domainMap.statusLabel,
      updatedAt: iso(domainMap.updatedAt),
    })),
    relationships: activity.relationships.map((relationship) => ({
      id: relationship.id,
      label: relationship.label,
      sourceLabel: relationship.sourceLabel,
      targetLabel: relationship.targetLabel,
      typeLabel: relationship.typeLabel,
      updatedAt: iso(relationship.updatedAt),
    })),
    returnedRowLimit: limit,
    subjects: activity.subjects.map((subject) => ({
      id: subject.id,
      label: subject.label,
      statusLabel: subject.statusLabel,
      typeLabel: subject.typeLabel,
      updatedAt: iso(subject.updatedAt),
    })),
  };
}

export async function listAgentDocuments(
  input: DomainRef & { limit?: number; query?: string | null }
) {
  const domain = await resolveDomain(input);

  if (!domain) {
    return { documents: [], domain: null };
  }

  const limit = boundedLimit(input.limit);
  const documents = await listDocuments({
    domainId: domain.id,
    limit,
    query: input.query,
  });

  return {
    documents: documents.map((document) => ({
      id: document.id,
      label: document.label,
      preparationState: document.preparationState,
      shardCount: document.shardCount,
      sizeBytes: document.sizeBytes,
      sourceFilename: document.sourceFilename,
      sourceType: document.sourceType,
      updatedAt: iso(document.updatedAt),
    })),
    domain,
    returnedRowLimit: limit,
  };
}

export async function getAgentDocumentContext(input: {
  documentId: string;
  domainSlug?: string | null;
  sourceUnitLimit?: number;
}) {
  const prepared = await getPreparedDocument(
    input.documentId,
    input.domainSlug?.trim() || undefined
  );

  if (!prepared) {
    return { document: null };
  }

  const sourceUnitLimit = Math.min(
    Math.max(Math.trunc(input.sourceUnitLimit ?? defaultSourceUnitLimit), 1),
    maxLimit
  );

  return {
    document: {
      id: prepared.document.id,
      label: prepared.document.label,
      preparationState: prepared.document.preparationState,
      shardCount: prepared.document.shardCount,
      sizeBytes: prepared.document.sizeBytes,
      sourceFilename: prepared.document.sourceFilename,
      sourceType: prepared.document.sourceType,
      updatedAt: iso(prepared.document.updatedAt),
    },
    returnedSourceUnitLimit: sourceUnitLimit,
    sourceUnits: prepared.sourceUnits.slice(0, sourceUnitLimit).map((unit) => ({
      ...recordBody(unit.body),
      headingPath: unit.headingPath,
      id: unit.id,
      position: unit.position,
      sizeBytes: unit.sizeBytes,
      unitType: unit.unitType,
    })),
    toc: prepared.toc,
    totalSourceUnitCount: prepared.sourceUnits.length,
  };
}

export async function searchAgentSubjects(
  input: DomainRef & { limit?: number; query?: string | null }
) {
  const domain = await resolveDomain(input);

  if (!domain) {
    return { domain: null, subjects: [] };
  }

  const limit = boundedLimit(input.limit);
  const subjects = await searchSubjects({
    domainId: domain.id,
    limit,
    query: input.query,
  });

  return {
    domain,
    returnedRowLimit: limit,
    subjects: subjects.map((subject) => ({
      descriptionExcerpt: subject.description
        ? excerpt(subject.description, 400)
        : null,
      id: subject.id,
      label: subject.label,
      statusLabel: subject.statusLabel,
      typeLabel: subject.typeLabel,
      updatedAt: iso(subject.updatedAt),
    })),
  };
}

function lowWeightReviewHint(row: LowWeightSubjectRow): LowWeightReviewHint {
  const typeLabel = row.subjectTypeLabel?.toLowerCase() ?? "";

  if (row.weight === 0) {
    return "orphan";
  }

  if (row.claimCount === 0 && row.relationshipCount > 0) {
    return "relationship_only";
  }

  if (["actor", "event", "object"].includes(typeLabel)) {
    return "named_anchor";
  }

  if (row.subjectTypeSlug === "concept") {
    return "thin_concept";
  }

  return "underused_structure";
}

export async function getAgentLowWeightSubjects(
  input: DomainRef & {
    includeNamedAnchors?: boolean | null;
    limit?: number | null;
    maxWeight?: number | null;
    subjectTypeSlug?: string | null;
  }
) {
  const domain = await resolveDomain(input);

  if (!domain) {
    return {
      domain: null,
      maxWeight: boundedMaxWeight(input.maxWeight),
      subjects: [],
    };
  }

  const includeNamedAnchors = input.includeNamedAnchors ?? true;
  const limit = boundedLowWeightLimit(input.limit);
  const maxWeight = boundedMaxWeight(input.maxWeight);
  const subjectTypeSlug = input.subjectTypeSlug?.trim() || null;
  const rows = await db.execute<LowWeightSubjectRow>(sql`
    select
      subjects.id,
      subjects.canonical_label as label,
      coalesce(taxonomy_parent.canonical_label, subject_types.label, 'Uncategorized') as "groupLabel",
      coalesce(subject_statuses.label, 'Active') as "statusLabel",
      subject_types.label as "subjectTypeLabel",
      subject_types.slug as "subjectTypeSlug",
      coalesce(claim_weight.claim_count, 0)::int as "claimCount",
      coalesce(relationship_weight.relationship_count, 0)::int as "relationshipCount",
      (
        coalesce(claim_weight.claim_count, 0) +
        coalesce(relationship_weight.relationship_count, 0)
      )::int as weight
    from subjects
    join objects on objects.id = subjects.id
    join classes on classes.id = objects.class_id
    join object_domain_memberships memberships
      on memberships.object_id = objects.id
    join domains on domains.id = memberships.domain_id
    left join types subject_types on subject_types.id = subjects.subject_type_id
    left join statuses subject_statuses on subject_statuses.id = subjects.status_id
    left join lateral (
      select parent_subjects.id, parent_subjects.canonical_label
      from relationships
      join types relationship_types
        on relationship_types.id = relationships.relationship_type_id
      join subjects parent_subjects
        on parent_subjects.id = relationships.target_object_id
      join object_domain_memberships parent_memberships
        on parent_memberships.object_id = parent_subjects.id
        and parent_memberships.domain_id = memberships.domain_id
        and parent_memberships.membership_state = 'member'
      where relationships.source_object_id = subjects.id
        and lower(regexp_replace(relationship_types.label, '[^a-zA-Z0-9]+', '', 'g')) = 'isa'
      order by lower(parent_subjects.canonical_label), parent_subjects.id
      limit 1
    ) taxonomy_parent on true
    left join lateral (
      select count(distinct claims.id)::int as claim_count
      from claim_targets
      join claims on claims.id = claim_targets.claim_id
      join object_domain_memberships claim_memberships
        on claim_memberships.object_id = claims.id
        and claim_memberships.domain_id = domains.id
        and claim_memberships.membership_state = 'member'
      left join statuses claim_statuses on claim_statuses.id = claims.status_id
      where claim_targets.target_object_id = subjects.id
        and coalesce(claim_statuses.key, '') <> 'archived'
    ) claim_weight on true
    left join lateral (
      select count(distinct relationships.id)::int as relationship_count
      from relationships
      join object_domain_memberships relationship_memberships
        on relationship_memberships.object_id = relationships.id
        and relationship_memberships.domain_id = domains.id
        and relationship_memberships.membership_state = 'member'
      left join statuses relationship_statuses
        on relationship_statuses.id = relationships.status_id
      where (
          relationships.source_object_id = subjects.id
          or relationships.target_object_id = subjects.id
        )
        and coalesce(relationship_statuses.key, '') <> 'archived'
    ) relationship_weight on true
    where domains.id = ${domain.id}
      and classes.key = 'subject'
      and memberships.membership_state = 'member'
      and coalesce(subject_statuses.key, '') <> 'archived'
      and (${subjectTypeSlug}::text is null or subject_types.slug = ${subjectTypeSlug})
      and (
        ${includeNamedAnchors}
        or coalesce(lower(subject_types.label), '') not in ('actor', 'event', 'object')
      )
      and (
        coalesce(claim_weight.claim_count, 0) +
        coalesce(relationship_weight.relationship_count, 0)
      ) <= ${maxWeight}
    order by
      (
        coalesce(claim_weight.claim_count, 0) +
        coalesce(relationship_weight.relationship_count, 0)
      ),
      lower(coalesce(taxonomy_parent.canonical_label, subject_types.label, 'Uncategorized')),
      lower(subjects.canonical_label),
      subjects.id
    limit ${limit}
  `);

  return {
    domain,
    includeNamedAnchors,
    maxWeight,
    returnedRowLimit: limit,
    subjects: rows.map((row) => ({
      claimCount: row.claimCount,
      groupLabel: row.groupLabel,
      id: row.id,
      label: row.label,
      relationshipCount: row.relationshipCount,
      reviewHint: lowWeightReviewHint(row),
      statusLabel: row.statusLabel,
      typeLabel: row.subjectTypeLabel,
      typeSlug: row.subjectTypeSlug,
      weight: row.weight,
    })),
  };
}

export async function searchAgentClaims(
  input: DomainRef & {
    includeReviewed?: boolean;
    limit?: number;
    query?: string | null;
    targetObjectId?: string | null;
  }
) {
  const domain = await resolveDomain(input);

  if (!domain) {
    return { claims: [], domain: null };
  }

  const limit = boundedLimit(input.limit);
  const claims = await searchClaims({
    domainId: domain.id,
    limit,
    query: input.query,
    targetObjectId: input.targetObjectId,
  });

  return {
    claims: claims.map((claim) => ({
      assertionState: claim.assertionState,
      claimText: excerpt(claim.claimText, 700),
      confidence: claim.confidence,
      id: claim.id,
      reviewId: claim.reviewId,
      reviewNumber: claim.reviewNumber,
      targetLabel: claim.targetLabel,
      typeLabel: claim.typeLabel,
      updatedAt: iso(claim.updatedAt),
    })),
    domain,
    returnedRowLimit: limit,
  };
}

export async function getAgentClaimTextLengths(
  input: DomainRef & {
    limit?: number | null;
    minCharacters?: number | null;
    minWords?: number | null;
    targetObjectId?: string | null;
  }
) {
  const domain = await resolveDomain(input);

  if (!domain) {
    return { claims: [], domain: null };
  }

  const limit = boundedClaimLengthLimit(input.limit);
  const minCharacters = Math.max(Math.trunc(input.minCharacters ?? 0), 0);
  const minWords = Math.max(Math.trunc(input.minWords ?? 0), 0);
  const targetObjectId = input.targetObjectId?.trim() || null;
  const rows = await db.execute<ClaimTextLengthRow>(sql`
    select
      claims.id as "claimId",
      claims.review_number as "reviewNumber",
      concat('CL-', lpad(claims.review_number::text, 5, '0')) as "reviewId",
      claims.claim_text as "claimText",
      claim_types.label as "claimTypeLabel",
      coalesce(claim_statuses.label, 'Active') as "statusLabel",
      coalesce(
        array_agg(subjects.canonical_label order by claim_targets.position, subjects.canonical_label)
          filter (where subjects.id is not null),
        '{}'::text[]
      ) as targets
    from claims
    join objects on objects.id = claims.id
    join classes on classes.id = objects.class_id
    join object_domain_memberships memberships
      on memberships.object_id = objects.id
    join domains on domains.id = memberships.domain_id
    left join types claim_types on claim_types.id = claims.claim_type_id
    left join statuses claim_statuses on claim_statuses.id = claims.status_id
    left join claim_targets on claim_targets.claim_id = claims.id
    left join subjects on subjects.id = claim_targets.target_object_id
    where domains.id = ${domain.id}
      and classes.key = 'claim'
      and memberships.membership_state = 'member'
      and coalesce(claim_statuses.key, '') <> 'archived'
      and (
        ${targetObjectId}::uuid is null
        or exists (
          select 1
          from claim_targets target_filter
          where target_filter.claim_id = claims.id
            and target_filter.target_object_id = ${targetObjectId}
        )
      )
    group by claims.id, claim_types.label, claim_statuses.label
  `);
  const measuredClaims = rows.map((row) => ({
    characterCount: characterCount(row.claimText),
    claimId: row.claimId,
    claimText: row.claimText,
    claimTypeLabel: row.claimTypeLabel,
    reviewId: row.reviewId,
    reviewNumber: row.reviewNumber,
    statusLabel: row.statusLabel,
    targets: row.targets ?? [],
    wordCount: wordCount(row.claimText),
  }));
  const wordStats = numericStats(
    measuredClaims.map((claim) => claim.wordCount)
  );
  const characterStats = numericStats(
    measuredClaims.map((claim) => claim.characterCount)
  );
  const filteredClaims = measuredClaims
    .filter(
      (claim) =>
        claim.wordCount >= minWords && claim.characterCount >= minCharacters
    )
    .sort(
      (left, right) =>
        right.wordCount - left.wordCount ||
        right.characterCount - left.characterCount ||
        left.claimText.localeCompare(right.claimText)
    );

  return {
    claims: filteredClaims.slice(0, limit),
    domain,
    filters: {
      minCharacters,
      minWords,
      targetObjectId,
    },
    returnedClaimCount: Math.min(filteredClaims.length, limit),
    returnedRowLimit: limit,
    summary: {
      characterCount: characterStats,
      filteredClaimCount: filteredClaims.length,
      overMedianCharacterCount: measuredClaims.filter(
        (claim) => claim.characterCount > characterStats.p50
      ).length,
      overMedianWordCount: measuredClaims.filter(
        (claim) => claim.wordCount > wordStats.p50
      ).length,
      totalClaimCount: measuredClaims.length,
      wordCount: wordStats,
    },
  };
}

export async function getAgentDomainMapContext(input: {
  domainMapId: string;
  domainSlug?: string | null;
}) {
  const domainSlug = input.domainSlug?.trim();

  if (!domainSlug) {
    return { domainMap: null };
  }

  const snapshot = await getDomainMapSnapshot(
    domainSlug,
    input.domainMapId
  );

  if (!snapshot.activeMap) {
    return { domainMap: null };
  }

  return {
    domainMap: snapshot.activeMap,
    nodes: snapshot.nodes,
    relationshipTypes: snapshot.relationshipTypes,
    relationships: snapshot.relationships,
  };
}

export async function getAgentSelectedRecordContext(input: {
  classKey: string;
  domainSlug?: string | null;
  packageId?: string | null;
  recordId: string;
}) {
  const domainSlug = input.domainSlug?.trim() || undefined;

  switch (input.classKey) {
    case "bundle": {
      const review = domainSlug
        ? await getWorkshopBundleReview(domainSlug, input.recordId)
        : null;
      const packageId = input.packageId?.trim();
      const selectedPackage = packageId
        ? review?.packages.find((pkg) => pkg.normalizedSubject === packageId) ??
          null
        : null;

      return {
        classKey: input.classKey,
        packageId: packageId || null,
        record: review
          ? {
              bundle: review.bundle,
              counts: review.counts,
              document: review.document,
              package:
                packageId && selectedPackage
                  ? selectedPackage
                  : null,
              packages:
                packageId && selectedPackage
                  ? []
                  : review.packages.map((pkg) => ({
                      claimCount: pkg.claimCount,
                      normalizedSubject: pkg.normalizedSubject,
                      state: pkg.state,
                      subject: pkg.subject,
                    })),
              run: review.run,
            }
          : null,
      };
    }
    case "claim":
      return {
        classKey: input.classKey,
        record: await getClaimDetail(input.recordId, domainSlug),
      };
    case "document":
      return {
        classKey: input.classKey,
        record: await getAgentDocumentContext({
          documentId: input.recordId,
          domainSlug,
          sourceUnitLimit: defaultSourceUnitLimit,
        }),
      };
    case "domain_map":
      return {
        classKey: input.classKey,
        record: await getAgentDomainMapContext({
          domainMapId: input.recordId,
          domainSlug,
        }),
      };
    case "relationship":
      return {
        classKey: input.classKey,
        record: await getRelationshipDetail(input.recordId, domainSlug),
      };
    case "subject":
      return {
        classKey: input.classKey,
        record: await getSubjectDetail(input.recordId, domainSlug),
      };
    case "type":
      return {
        classKey: input.classKey,
        record: domainSlug
          ? await getTypeDetail(input.recordId, domainSlug)
          : null,
      };
    default:
      return {
        classKey: input.classKey,
        record: null,
      };
  }
}
