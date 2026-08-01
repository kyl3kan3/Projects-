/**
 * Database client (lazy singleton).
 *
 * The connection is created on first use, so importing this module during
 * `next build` (no DATABASE_URL) neither opens a socket nor throws.
 *
 * Serverless note: on Vercel every warm function instance keeps its own pool, so
 * a generous `max` multiplies into Neon's connection ceiling fast. There the pool
 * is one connection with a short idle timeout; long-lived processes get a real
 * pool. `prepare: false` is required either way — Neon's pooled endpoint runs
 * PgBouncer in transaction mode, which cannot carry prepared statements across
 * connections.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

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

/** Close the pool — used by scripts and the tick runner on shutdown. */
export async function closeDb(): Promise<void> {
  await _client?.end({ timeout: 5 });
  _client = null;
  _db = null;
}

export { schema };
