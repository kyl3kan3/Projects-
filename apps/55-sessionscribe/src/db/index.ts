/**
 * src/db/index.ts
 *
 * Database client (lazy singleton).
 *
 * The connection opens on first use, so importing this module during
 * `next build` — which has no DATABASE_URL — neither opens a socket nor throws.
 *
 * On a serverless platform every warm instance keeps its own pool, so `max` is
 * one there with a short idle timeout; a long-lived worker gets a real pool.
 * `prepare: false` is required either way: Neon's pooled endpoint runs PgBouncer
 * in transaction mode, which cannot carry prepared statements across connections.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import { isServerless } from "@/lib/runtime";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    _client = postgres(env.databaseUrl, {
      max: isServerless() ? 1 : 10,
      idle_timeout: isServerless() ? 20 : undefined,
      connect_timeout: 10,
      prepare: false,
    });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

/** Close the pool — the worker and the scripts call this on shutdown. */
export async function closeDb(): Promise<void> {
  await _client?.end({ timeout: 5 });
  _client = null;
  _db = null;
}

export { schema };
