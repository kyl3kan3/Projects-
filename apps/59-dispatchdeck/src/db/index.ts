/**
 * src/db/index.ts
 *
 * Drizzle client over postgres-js. One lazy singleton shared by app and
 * worker, cached on globalThis so `next dev` hot reloads don't leak
 * connections.
 *
 * The connection is opened on first use, never at import time, so
 * `next build` (which imports every module without a DATABASE_URL) neither
 * opens a socket nor throws.
 *
 * `prepare: false` is required by Neon's pooled endpoint — PgBouncer in
 * transaction mode cannot carry prepared statements across connections.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const cache = globalThis as unknown as {
  __dispatchdeckClient?: ReturnType<typeof postgres>;
  __dispatchdeckDb?: Db;
};

export function getDb(): Db {
  if (!cache.__dispatchdeckDb) {
    const serverless = Boolean(process.env.VERCEL);
    cache.__dispatchdeckClient = postgres(env.databaseUrl, {
      max: serverless ? 1 : 10,
      idle_timeout: serverless ? 20 : undefined,
      connect_timeout: 10,
      prepare: false,
    });
    cache.__dispatchdeckDb = drizzle(cache.__dispatchdeckClient, { schema });
  }
  return cache.__dispatchdeckDb;
}

/** Close the pool — used by the worker and by scripts on shutdown. */
export async function closeDb(): Promise<void> {
  await cache.__dispatchdeckClient?.end({ timeout: 5 });
  cache.__dispatchdeckClient = undefined;
  cache.__dispatchdeckDb = undefined;
}

export { schema };
