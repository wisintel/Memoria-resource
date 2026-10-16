import type { AtlasChatSetupStatus } from "@/lib/atlas-chat/types";
import { isDatabaseConfigured, isDatabaseSchemaReady } from "@/lib/db/client";

const authEnvKeys = [
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_VERCEL_APP_CLIENT_ID",
  "VERCEL_APP_CLIENT_SECRET",
] as const;

const rateLimitEnvGroups = [
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
] as const;

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function isAtlasChatAuthConfigured() {
  return authEnvKeys.every(hasEnv);
}

export function isAtlasChatRateLimitConfigured() {
  return rateLimitEnvGroups.some((group) => group.every(hasEnv));
}

export function getInitialAtlasChatSetupStatus(): AtlasChatSetupStatus {
  return createAtlasChatSetupStatus({
    databaseSchemaReady: isDatabaseConfigured(),
  });
}

export async function getAtlasChatSetupStatus(): Promise<AtlasChatSetupStatus> {
  const databaseConfigured = isDatabaseConfigured();
  const databaseSchemaReady = databaseConfigured
    ? await isDatabaseSchemaReady()
    : false;

  return createAtlasChatSetupStatus({ databaseSchemaReady });
}

export async function isAtlasChatConfigured() {
  const status = await getAtlasChatSetupStatus();

  return status.appReady;
}

function createAtlasChatSetupStatus({
  databaseSchemaReady,
}: {
  databaseSchemaReady: boolean;
}): AtlasChatSetupStatus {
  const databaseConfigured = isDatabaseConfigured();
  const authReady = isAtlasChatAuthConfigured();
  const rateLimitReady = isAtlasChatRateLimitConfigured();
  const databaseReady = databaseConfigured && databaseSchemaReady;
  const missing = [
    ...(databaseConfigured ? [] : ["DATABASE_URL or POSTGRES_URL"]),
    ...(databaseConfigured && !databaseSchemaReady ? ["database migrations"] : []),
  ];

  return {
    appReady: databaseReady,
    authReady,
    databaseConfigured,
    databaseReady,
    databaseSchemaReady,
    missing,
    rateLimitReady,
  };
}
