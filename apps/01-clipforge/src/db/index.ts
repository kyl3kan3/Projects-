/**
 * Database client (lazy singleton).
 *
 * The connection is created on first use so importing this module during
 * `next build` (no DATABASE_URL) doesn't open a socket or throw.
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
      // On Vercel each warm function instance keeps its own pool, so a
      // generous max multiplies into Neon's connection ceiling. Long-lived
      // workers get a real pool.
      max: process.env.VERCEL ? 1 : 10,
      idle_timeout: process.env.VERCEL ? 20 : undefined,
      connect_timeout: 10,
      // Required by Neon's pooled endpoint (PgBouncer transaction mode).
      prepare: false,
    });
    _db = drizzle(_client, { schema, casing: "snake_case" });
  }
  return _db;
}

export { schema };
