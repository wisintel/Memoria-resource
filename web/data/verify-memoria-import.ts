import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
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

loadLocalEnv();

const bundlePath = resolve(
  process.cwd(),
  "../..",
  "workbench/test-data/memoria-domain-bundle-draft.json"
);

type CountRow = { count: string | number };

async function scalarCount(query: ReturnType<typeof sql>) {
  const { db } = await import("./client");
  const result = (await db.execute(query)) as unknown as CountRow[];
  return Number(result[0]?.count ?? 0);
}

async function main() {
  const { db, postgresClient } = await import("./client");

  try {
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      claims: { targets?: unknown[] }[];
      counts: Record<string, number>;
      views: { relationships?: unknown[]; subjects?: unknown[] }[];
    };

    const domainRows = (await db.execute(sql`
      select id from domains where slug = 'memoria' limit 1
    `)) as unknown as { id: string }[];
    const domainId = domainRows[0]?.id;

    if (!domainId) {
      throw new Error("Memoria domain was not found");
    }

    const expected = {
      claim_targets: bundle.claims.reduce(
        (total, claim) => total + (claim.targets?.length ?? 0),
        0
      ),
      claims: bundle.counts.claims,
      documents: bundle.counts.documents,
      domain_map_nodes: bundle.views.reduce(
        (total, view) => total + (view.subjects?.length ?? 0),
        0
      ),
      domain_map_relationships: bundle.views.reduce(
        (total, view) => total + (view.relationships?.length ?? 0),
        0
      ),
      domain_maps: bundle.counts.views,
      evidence: bundle.counts.evidence,
      evidence_links: bundle.counts.evidence_links,
      lexicalizations: bundle.counts.lexicalizations,
      relationships: bundle.counts.relationships,
      subjects: bundle.counts.subjects,
      types: bundle.counts.type_cards,
    };

    const membershipCount = (classKey: string, tableName: string) =>
      scalarCount(sql`
        select count(*)::int as count
        from ${sql.identifier(tableName)} records
        join objects on objects.id = records.id
        join classes on classes.id = objects.class_id
        join object_domain_memberships memberships
          on memberships.object_id = objects.id
        where classes.key = ${classKey}
          and memberships.domain_id = ${domainId}
      `);

    const actual = {
      claim_targets: await scalarCount(sql`select count(*)::int as count from claim_targets`),
      claims: await membershipCount("claim", "claims"),
      documents: await membershipCount("document", "documents"),
      domain_map_nodes: await scalarCount(sql`select count(*)::int as count from domain_map_nodes`),
      domain_map_relationships: await scalarCount(sql`select count(*)::int as count from domain_map_relationships`),
      domain_maps: await membershipCount("domain_map", "domain_maps"),
      evidence: await scalarCount(sql`select count(*)::int as count from evidence`),
      evidence_links: await scalarCount(sql`select count(*)::int as count from evidence_links`),
      lexicalizations: await scalarCount(sql`
        select count(*)::int as count from lexicalizations where domain_id = ${domainId}
      `),
      relationships: await membershipCount("relationship", "relationships"),
      subjects: await membershipCount("subject", "subjects"),
      types: await scalarCount(sql`
        select count(*)::int as count from types where domain_id = ${domainId}
      `),
    };

    for (const [key, expectedCount] of Object.entries(expected)) {
      if (actual[key as keyof typeof actual] !== expectedCount) {
        throw new Error(
          `${key} count mismatch: expected ${expectedCount}, got ${
            actual[key as keyof typeof actual]
          }`
        );
      }
    }

    console.log(JSON.stringify({ actual, domainId, expected }, null, 2));
  } finally {
    await postgresClient.end({ timeout: 5 });
  }
}

void main();
