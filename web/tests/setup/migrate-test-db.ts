import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";

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

function requireTestDatabaseUrl() {
  loadLocalEnv();

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests.");
  }

  if (
    testDatabaseUrl === process.env.DATABASE_URL ||
    testDatabaseUrl === process.env.DIRECT_URL
  ) {
    throw new Error(
      "TEST_DATABASE_URL must not match DATABASE_URL or DIRECT_URL."
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;

  return testDatabaseUrl;
}

function migrationStatements() {
  const migrationsDir = resolve(process.cwd(), "data/migrations");

  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .flatMap((name) =>
      readFileSync(join(migrationsDir, name), "utf8")
        .split("--> statement-breakpoint")
        .flatMap((chunk) => chunk.split(/;\s*(?:\r?\n|$)/))
        .map((statement) => statement.trim())
        .filter(Boolean)
    );
}

async function main() {
  const testDatabaseUrl = requireTestDatabaseUrl();
  const sql = postgres(testDatabaseUrl, {
    max: 1,
    prepare: false,
  });

  try {
    await sql.unsafe("drop schema if exists public cascade");
    await sql.unsafe("create schema public");
    await sql.unsafe("create extension if not exists pgcrypto");

    for (const statement of migrationStatements()) {
      await sql.unsafe(statement);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const { postgresClient } = await import("@/data/client");
  const { seedRegistry } = await import("@/data/registry-seed");

  try {
    await seedRegistry();
  } finally {
    await postgresClient.end({ timeout: 5 });
  }
}

void main();
