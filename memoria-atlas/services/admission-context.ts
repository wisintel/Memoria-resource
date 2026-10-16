import { sql } from "drizzle-orm";
import { db } from "@/data/client";
import {
  findCanonicalSubjectMatches,
  normalizeAdmissionSubjectLabel,
} from "@/lib/admission/subject-evidence";
import { getDomainById, getDomainBySlug } from "@/services/domains";

type AdmissionSubjectMatchRow = {
  aliases: string[] | null;
  candidateIndex: number;
  canonicalLabel: string;
  claimCount: number;
  description: string;
  id: string;
  relationshipCount: number;
  typeLabel: string | null;
};

type AdmissionPendingReferenceRow = {
  bundleId: string;
  bundleLabel: string;
  candidateIndex: number;
  claimCount: number;
  claimTextMentionCount: number;
  documentId: string;
  documentLabel: string;
  subjectMentionCount: number;
};

type AdmissionSubjectContextInput = {
  candidateLabels: string[];
  domainId?: string | null;
  domainSlug?: string | null;
};

async function resolveDomain(input: AdmissionSubjectContextInput) {
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

function excerpt(value: string, maxLength: number) {
  const compact = compactText(value);

  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength).trimEnd()}...`;
}

function candidateSqlRows(labels: string[]) {
  return sql.join(
    labels.map((label, index) => sql`(${index}::int, ${label}::text)`),
    sql`, `
  );
}

export async function getAdmissionSubjectContext(
  input: AdmissionSubjectContextInput
) {
  const domain = await resolveDomain(input);
  const candidateLabels = Array.from(
    new Map(
      input.candidateLabels
        .map(compactText)
        .filter(Boolean)
        .map((label) => [label.toLowerCase(), label])
    ).values()
  );

  if (!domain) {
    return { candidates: [], domain: null };
  }

  if (candidateLabels.length === 0) {
    return { candidates: [], domain };
  }

  const candidates = candidateSqlRows(candidateLabels);
  const [canonicalRows, pendingRows] = await Promise.all([
    db.execute<AdmissionSubjectMatchRow>(sql`
      with candidates("candidateIndex", "candidateLabel") as (
        values ${candidates}
      )
      select
        candidates."candidateIndex",
        subjects.id,
        subjects.canonical_label as "canonicalLabel",
        subjects.description,
        subject_types.label as "typeLabel",
        coalesce(subject_aliases.aliases, array[]::text[]) as aliases,
        coalesce(claim_weight.claim_count, 0)::int as "claimCount",
        coalesce(relationship_weight.relationship_count, 0)::int as "relationshipCount"
      from candidates
      join subjects on true
      join objects on objects.id = subjects.id
      join classes on classes.id = objects.class_id
      join object_domain_memberships memberships
        on memberships.object_id = subjects.id
      left join types subject_types on subject_types.id = subjects.subject_type_id
      left join statuses subject_statuses on subject_statuses.id = subjects.status_id
      left join lateral (
        select
          array_agg(lexicalizations.value order by lower(lexicalizations.value)) as aliases,
          bool_or(
            lower(lexicalizations.normalized_value) =
              lower(regexp_replace(candidates."candidateLabel", '[^a-zA-Z0-9]+', '-', 'g'))
          ) as exact_match
        from lexicalizations
        left join statuses lexicalization_statuses
          on lexicalization_statuses.id = lexicalizations.status_id
        where lexicalizations.object_id = subjects.id
          and (
            lexicalizations.domain_id is null
            or lexicalizations.domain_id = ${domain.id}
          )
          and coalesce(lexicalization_statuses.key, '') <> 'archived'
      ) subject_aliases on true
      left join lateral (
        select count(distinct claims.id)::int as claim_count
        from claim_targets
        join claims on claims.id = claim_targets.claim_id
        join object_domain_memberships claim_memberships
          on claim_memberships.object_id = claims.id
          and claim_memberships.domain_id = ${domain.id}
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
          and relationship_memberships.domain_id = ${domain.id}
          and relationship_memberships.membership_state = 'member'
        left join statuses relationship_statuses
          on relationship_statuses.id = relationships.status_id
        where (
            relationships.source_object_id = subjects.id
            or relationships.target_object_id = subjects.id
          )
          and coalesce(relationship_statuses.key, '') <> 'archived'
      ) relationship_weight on true
      where memberships.domain_id = ${domain.id}
        and memberships.membership_state = 'member'
        and classes.key = 'subject'
        and coalesce(subject_statuses.key, '') <> 'archived'
        and (
          lower(subjects.canonical_label) = lower(candidates."candidateLabel")
          or lower(regexp_replace(subjects.canonical_label, '[^a-zA-Z0-9]+', '-', 'g')) =
            lower(regexp_replace(candidates."candidateLabel", '[^a-zA-Z0-9]+', '-', 'g'))
          or coalesce(subject_aliases.exact_match, false)
          or to_tsvector('english', candidates."candidateLabel") @@
            plainto_tsquery('english', subjects.canonical_label)
          or to_tsvector(
            'english',
            concat_ws(' ', subjects.canonical_label, subjects.description)
          ) @@ plainto_tsquery('english', candidates."candidateLabel")
        )
      order by candidates."candidateIndex", lower(subjects.canonical_label), subjects.id
    `),
    db.execute<AdmissionPendingReferenceRow>(sql`
      with candidates("candidateIndex", "candidateLabel") as (
        values ${candidates}
      )
      select
        candidates."candidateIndex",
        extraction_bundles.id as "bundleId",
        extraction_bundles.label as "bundleLabel",
        documents.id as "documentId",
        documents.label as "documentLabel",
        count(distinct extraction_claims.id)::int as "claimCount",
        count(distinct extraction_claims.id) filter (
          where position(
            lower(candidates."candidateLabel") in lower(extraction_claims.text)
          ) > 0
        )::int as "claimTextMentionCount",
        count(distinct extraction_claim_mentions.claim_row_id)::int as "subjectMentionCount"
      from candidates
      join extraction_bundles
        on extraction_bundles.domain_id = ${domain.id}
        and extraction_bundles.status <> 'archived'
      join documents on documents.id = extraction_bundles.document_id
      join extraction_claims on extraction_claims.bundle_id = extraction_bundles.id
      left join workshop_claim_decisions
        on workshop_claim_decisions.claim_row_id = extraction_claims.id
      left join extraction_claim_mentions
        on extraction_claim_mentions.claim_row_id = extraction_claims.id
        and extraction_claim_mentions.role = 'g_subject'
        and lower(regexp_replace(extraction_claim_mentions.text, '[^a-zA-Z0-9]+', '-', 'g')) =
          lower(regexp_replace(candidates."candidateLabel", '[^a-zA-Z0-9]+', '-', 'g'))
      where (
          workshop_claim_decisions.outcome is null
          or workshop_claim_decisions.outcome = 'deferred'
        )
        and (
          position(
            lower(candidates."candidateLabel") in lower(extraction_claims.text)
          ) > 0
          or extraction_claim_mentions.id is not null
        )
      group by
        candidates."candidateIndex",
        extraction_bundles.id,
        extraction_bundles.label,
        documents.id,
        documents.label
      order by
        candidates."candidateIndex",
        lower(documents.label),
        documents.id,
        lower(extraction_bundles.label),
        extraction_bundles.id
    `),
  ]);

  return {
    candidates: candidateLabels.map((label, candidateIndex) => {
      const subjectRows = canonicalRows.filter(
        (row) => row.candidateIndex === candidateIndex
      );
      const sourceRows = pendingRows.filter(
        (row) => row.candidateIndex === candidateIndex
      );
      const matchedSubjects = findCanonicalSubjectMatches(
        label,
        subjectRows.map((row) => ({
          aliases: row.aliases ?? [],
          canonicalLabel: row.canonicalLabel,
          claimCount: row.claimCount,
          description: row.description,
          id: row.id,
          relationshipCount: row.relationshipCount,
          typeLabel: row.typeLabel,
        }))
      );
      const decorateMatch = (match: (typeof matchedSubjects)[number]) => {
        const row = subjectRows.find((candidate) => candidate.id === match.id);

        return {
          ...match,
          aliases: row?.aliases ?? [],
          descriptionExcerpt: row?.description
            ? excerpt(row.description, 400)
            : null,
        };
      };
      const isDescriptionOnly = (match: (typeof matchedSubjects)[number]) =>
        match.matchKinds.length === 1 &&
        match.matchKinds[0] === "description_tokens";
      const hasCanonicalMatch = matchedSubjects.some(
        (match) => !isDescriptionOnly(match)
      );

      return {
        canonicalMatches: matchedSubjects
          .filter((match) => !isDescriptionOnly(match))
          .map(decorateMatch),
        descriptionMatches: hasCanonicalMatch
          ? []
          : matchedSubjects.filter(isDescriptionOnly).map(decorateMatch),
        label,
        normalizedLabel: normalizeAdmissionSubjectLabel(label),
        pendingReferences: {
          claimCount: sourceRows.reduce((sum, row) => sum + row.claimCount, 0),
          distinctDocumentCount: new Set(
            sourceRows.map((row) => row.documentId)
          ).size,
          sources: sourceRows.map((row) => ({
            bundleId: row.bundleId,
            bundleLabel: row.bundleLabel,
            claimCount: row.claimCount,
            claimTextMentionCount: row.claimTextMentionCount,
            documentId: row.documentId,
            documentLabel: row.documentLabel,
            subjectMentionCount: row.subjectMentionCount,
          })),
        },
      };
    }),
    domain,
  };
}
