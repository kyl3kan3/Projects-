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
    _client = postgres(env.databaseUrl, { max: 10, prepare: false });
    _db = drizzle(_client, { schema, casing: "snake_case" });
  }
  return _db;
}

/** Close the pool — used by the workers on shutdown. */
export async function closeDb(): Promise<void> {
  await _client?.end({ timeout: 5 });
  _client = null;
  _db = null;
}

export { schema };
