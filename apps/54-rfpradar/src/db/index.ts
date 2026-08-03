/**
 * src/db/index.ts
 *
 * Drizzle client over postgres-js. One lazy singleton shared by the Next.js
 * app and the worker, cached on globalThis so `next dev` hot reloads don't
 * leak connections.
 *
 * The connection is created on first use, so importing this module during
 * `next build` (no DATABASE_URL) never opens a socket or throws.
 *
 * Serverless note: on Vercel each warm instance keeps its own pool, so a
 * generous `max` multiplies into Neon's ceiling. There the pool is one
 * connection with a short idle timeout; long-lived workers get a real pool.
 * `prepare: false` is required either way — Neon's pooled endpoint runs
 * PgBouncer in transaction mode, which cannot carry prepared statements.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __rfpradarClient?: ReturnType<typeof postgres>;
  __rfpradarDb?: Db;
};

export function getDb(): Db {
  if (!globalForDb.__rfpradarDb) {
    const serverless = Boolean(process.env.VERCEL);
    globalForDb.__rfpradarClient = postgres(env.databaseUrl, {
      max: serverless ? 1 : 10,
      idle_timeout: serverless ? 20 : undefined,
      connect_timeout: 10,
      prepare: false,
    });
    globalForDb.__rfpradarDb = drizzle(globalForDb.__rfpradarClient, {
      schema,
      casing: "snake_case",
    });
  }
  return globalForDb.__rfpradarDb;
}

/** Raw postgres.js handle, for the few hand-written SQL paths (tsvector). */
export function getSql(): ReturnType<typeof postgres> {
  getDb();
  return globalForDb.__rfpradarClient!;
}

/** Close the pool — the worker and scripts call this on shutdown. */
export async function closeDb(): Promise<void> {
  await globalForDb.__rfpradarClient?.end({ timeout: 5 });
  globalForDb.__rfpradarClient = undefined;
  globalForDb.__rfpradarDb = undefined;
}

export { schema };
