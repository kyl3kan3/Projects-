/**
 * Database client — a lazy singleton.
 *
 * The socket is opened on first use, so importing this module during
 * `next build` (which has no DATABASE_URL) neither connects nor throws.
 *
 * On Vercel every warm lambda keeps its own pool, so `max` stays at 1 there and
 * the idle timeout is short; a long-lived process gets a real pool.
 * `prepare: false` is required either way: Neon's pooled endpoint runs PgBouncer
 * in transaction mode, which cannot carry prepared statements across
 * connections.
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

/** Close the pool — used by the worker loop and by scripts on shutdown. */
export async function closeDb(): Promise<void> {
  await _client?.end({ timeout: 5 });
  _client = null;
  _db = null;
}

export { schema };
