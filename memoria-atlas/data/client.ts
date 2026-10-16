import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

type PostgresClient = ReturnType<typeof postgres>;
type DrizzleClient = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  memoriaPostgresClient?: PostgresClient;
  memoriaDb?: DrizzleClient;
};

export const postgresClient =
  globalForDb.memoriaPostgresClient ??
  postgres(databaseUrl, {
    prepare: false,
  });

export const db = globalForDb.memoriaDb ?? drizzle(postgresClient);

if (process.env.NODE_ENV !== "production") {
  globalForDb.memoriaPostgresClient = postgresClient;
  globalForDb.memoriaDb = db;
}

export type DbClient = typeof db;
