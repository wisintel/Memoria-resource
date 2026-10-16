import { eq, sql } from "drizzle-orm";
import { db } from "@/data/client";
import { domains } from "@/data/schema";

const refreshMetadataKey = "workspaceRefreshVersion";

export async function getWorkspaceRefreshSignal(domainSlug: string) {
  const [row] = await db
    .select({
      version: sql<string>`coalesce(${domains.metadata}->>${refreshMetadataKey}, '')`,
    })
    .from(domains)
    .where(eq(domains.slug, domainSlug))
    .limit(1);

  return {
    domainSlug,
    version: row?.version ?? "",
  };
}

export async function bumpWorkspaceRefreshSignal(domainSlug: string) {
  const version = new Date().toISOString();

  await db
    .update(domains)
    .set({
      metadata: sql`jsonb_set(${domains.metadata}, '{${sql.raw(refreshMetadataKey)}}', to_jsonb(${version}::text), true)`,
    })
    .where(eq(domains.slug, domainSlug));

  return {
    domainSlug,
    version,
  };
}
