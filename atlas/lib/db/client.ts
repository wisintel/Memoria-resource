import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

type AtlasDatabase = PostgresJsDatabase<typeof schema>;

let database: AtlasDatabase | null = null;
let queryClient: postgres.Sql | null = null;

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

export function getDb() {
  if (!database) {
    const url = getDatabaseUrl();

    if (!url) {
      throw new Error(
        "DATABASE_URL or POSTGRES_URL is required for durable Atlas chat persistence.",
      );
    }

    queryClient = postgres(url, {
      max: 10,
      prepare: false,
    });
    database = drizzle(queryClient, { schema });
  }

  return database;
}

export const db = new Proxy({} as AtlasDatabase, {
  get(_, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function isDatabaseSchemaReady() {
  const url = getDatabaseUrl();

  if (!url) {
    return false;
  }

  const sql = postgres(url, {
    max: 1,
    prepare: false,
  });

  try {
    const rows = await sql<{
      ready: boolean;
    }[]>`
      with required_tables(table_name) as (
        values
          ('account'),
          ('atlas_chat_events'),
          ('atlas_chats'),
          ('session'),
          ('user'),
          ('verification')
      ),
      required_columns(table_name, column_name) as (
        values
          ('atlas_chats', 'id'),
          ('atlas_chats', 'owner_user_id'),
          ('atlas_chats', 'title'),
          ('atlas_chats', 'eve_session'),
          ('atlas_chats', 'pending_user_message'),
          ('atlas_chats', 'pending_user_message_created_at'),
          ('atlas_chats', 'domain_id'),
          ('atlas_chats', 'view_id'),
          ('atlas_chats', 'document_id'),
          ('atlas_chats', 'active_document_shard_id'),
          ('atlas_chats', 'mode'),
          ('atlas_chats', 'selected_record_table'),
          ('atlas_chats', 'selected_record_id'),
          ('atlas_chats', 'created_at'),
          ('atlas_chats', 'updated_at'),
          ('atlas_chat_events', 'id'),
          ('atlas_chat_events', 'chat_id'),
          ('atlas_chat_events', 'event_index'),
          ('atlas_chat_events', 'event'),
          ('atlas_chat_events', 'created_at')
      )
      select
        not exists (
          select 1
          from required_tables rt
          where to_regclass(format('public.%I', rt.table_name)) is null
        )
        and not exists (
          select 1
          from required_columns rc
          left join information_schema.columns c
            on c.table_schema = 'public'
            and c.table_name = rc.table_name
            and c.column_name = rc.column_name
          where c.column_name is null
        )
        and exists (
          select 1
          from pg_indexes
          where schemaname = 'public'
            and tablename = 'atlas_chat_events'
            and indexname = 'idx_atlas_chat_events_chat_index'
        )
        and exists (
          select 1
          from pg_class
          join pg_namespace on pg_namespace.oid = pg_class.relnamespace
          where pg_namespace.nspname = 'public'
            and pg_class.relname = 'atlas_chats'
            and pg_class.relrowsecurity
        )
        and exists (
          select 1
          from pg_class
          join pg_namespace on pg_namespace.oid = pg_class.relnamespace
          where pg_namespace.nspname = 'public'
            and pg_class.relname = 'atlas_chat_events'
            and pg_class.relrowsecurity
        ) as ready
    `;
    const result = rows[0];

    return Boolean(result?.ready);
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    null
  );
}
