import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

type DeleteStep = {
  label: string;
  sql: string;
};

const deleteSteps: DeleteStep[] = [
  { label: "evidence_links", sql: "delete from evidence_links" },
  { label: "record_provenance", sql: "delete from record_provenance" },
  {
    label: "workshop_package_decisions",
    sql: "delete from workshop_package_decisions",
  },
  {
    label: "extraction_claim_inferred_from",
    sql: "delete from extraction_claim_inferred_from",
  },
  {
    label: "extraction_claim_provenance",
    sql: "delete from extraction_claim_provenance",
  },
  {
    label: "extraction_claim_mentions",
    sql: "delete from extraction_claim_mentions",
  },
  { label: "extraction_claims", sql: "delete from extraction_claims" },
  { label: "extraction_bundles", sql: "delete from extraction_bundles" },
  { label: "pipeline_run_steps", sql: "delete from pipeline_run_steps" },
  { label: "pipeline_runs", sql: "delete from pipeline_runs" },
  {
    label: "domain_map_relationships",
    sql: "delete from domain_map_relationships",
  },
  { label: "domain_map_nodes", sql: "delete from domain_map_nodes" },
  { label: "domain_maps", sql: "delete from domain_maps" },
  { label: "relationships", sql: "delete from relationships" },
  { label: "claim_targets", sql: "delete from claim_targets" },
  { label: "claims", sql: "delete from claims" },
  { label: "lexicalizations", sql: "delete from lexicalizations" },
  { label: "subjects", sql: "delete from subjects" },
  { label: "document_profiles", sql: "delete from document_profiles" },
  { label: "source_units", sql: "delete from source_units" },
  { label: "shelf_folder_items", sql: "delete from shelf_folder_items" },
  { label: "shelf_folders", sql: "delete from shelf_folders" },
  { label: "evidence", sql: "delete from evidence" },
  { label: "documents", sql: "delete from documents" },
  {
    label: "domain_scoped_type_parent_links",
    sql: `
      update types
      set parent_type_id = null
      where parent_type_id in (
        select id from types where domain_id is not null
      )
    `,
  },
  {
    label: "domain_scoped_types",
    sql: "delete from types where domain_id is not null",
  },
  {
    label: "object_domain_memberships",
    sql: "delete from object_domain_memberships",
  },
  { label: "domains", sql: "delete from domains" },
  { label: "objects", sql: "delete from objects" },
];

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

export async function wipeUserData({
  closeSharedClient = true,
}: {
  closeSharedClient?: boolean;
} = {}) {
  loadLocalEnv();

  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DIRECT_URL or DATABASE_URL is required.");
  }

  const sql = postgres(databaseUrl, { prepare: false });
  const counts: Array<{ label: string; count: number }> = [];

  try {
    await sql.begin(async (transaction) => {
      for (const step of deleteSteps) {
        const result = await transaction.unsafe(step.sql);
        counts.push({ label: step.label, count: result.count });
      }
    });
  } finally {
    await sql.end();
  }

  await rm(resolve(process.cwd(), ".workflow-data"), {
    force: true,
    recursive: true,
  });

  const { postgresClient } = await import("../data/client");
  const { seedRegistry } = await import("../data/registry-seed");
  await seedRegistry();

  if (closeSharedClient) {
    await postgresClient.end({ timeout: 5 });
  }

  return counts;
}

async function main() {
  const counts = await wipeUserData();

  console.log("User data wiped and foundation seed restored.");
  console.table(counts);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
