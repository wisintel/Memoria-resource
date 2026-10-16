import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type ClaimLengthRow = {
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

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    let value = trimmed.slice(separatorIndex + 1);

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function parseArgs(argv: string[]) {
  let domainSlug = "solar-system";
  let limit: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--domain" || value === "--domainSlug") {
      domainSlug = argv[index + 1] ?? domainSlug;
      index += 1;
      continue;
    }

    if (value === "--limit") {
      const parsed = Number.parseInt(argv[index + 1] ?? "", 10);
      limit = Number.isFinite(parsed) && parsed > 0 ? parsed : limit;
      index += 1;
      continue;
    }

    if (!value.startsWith("-")) {
      domainSlug = value;
    }
  }

  return { domainSlug, limit };
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

function stats(values: number[]): NumericStats {
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

async function main() {
  loadLocalEnv();

  const { domainSlug, limit } = parseArgs(process.argv.slice(2));
  const [{ sql }, { db, postgresClient }] = await Promise.all([
    import("drizzle-orm"),
    import("../data/client"),
  ]);
  const rows = await db.execute<ClaimLengthRow>(sql`
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
    where domains.slug = ${domainSlug}
      and classes.key = 'claim'
      and memberships.membership_state = 'member'
      and coalesce(claim_statuses.key, '') <> 'archived'
    group by claims.id, claim_types.label, claim_statuses.label
    order by lower(claims.claim_text), claims.id
  `);
  const claims = rows.map((row) => {
    const characters = characterCount(row.claimText);
    const words = wordCount(row.claimText);

    return {
      characterCount: characters,
      claimId: row.claimId,
      claimText: row.claimText,
      claimTypeLabel: row.claimTypeLabel,
      reviewId: row.reviewId,
      reviewNumber: row.reviewNumber,
      statusLabel: row.statusLabel,
      targets: row.targets ?? [],
      wordCount: words,
    };
  });
  const sortedClaims = [...claims].sort(
    (left, right) =>
      right.wordCount - left.wordCount ||
      right.characterCount - left.characterCount ||
      left.claimText.localeCompare(right.claimText)
  );
  const returnedClaims = limit ? sortedClaims.slice(0, limit) : sortedClaims;
  const report = {
    claims: returnedClaims,
    domainSlug,
    returnedClaimCount: returnedClaims.length,
    summary: {
      characterCount: stats(claims.map((claim) => claim.characterCount)),
      totalClaimCount: claims.length,
      wordCount: stats(claims.map((claim) => claim.wordCount)),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  await postgresClient.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
