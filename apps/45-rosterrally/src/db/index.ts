/**
 * Database client (lazy singleton).
 *
 * The connection opens on first use, so importing this module during
 * `next build` — which has no DATABASE_URL — neither opens a socket nor throws.
 *
 * On Vercel every warm function instance keeps its own pool, so `max` is held at
 * one connection there and the idle timeout kept short; a long-lived local
 * process gets a real pool. `prepare: false` is required either way: Neon's
 * pooled endpoint is PgBouncer in transaction mode and cannot carry prepared
 * statements across connections.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    _client = postgres(env.databaseUrl, {
      max: process.env.VERCEL ? 1 : 10,
      idle_timeout: process.env.VERCEL ? 20 : undefined,
      connect_timeout: 10,
      prepare: false,
    });
    _db = drizzle(_client, { schema, casing: "snake_case" });
  }
  return _db;
}

/** Close the pool. Used by scripts and the local worker, never a request path. */
export async function closeDb(): Promise<void> {
  await _client?.end({ timeout: 5 });
  _client = null;
  _db = null;
}

export { schema };
