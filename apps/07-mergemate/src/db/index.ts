/**
 * Database client (lazy singleton).
 *
 * The connection is created on first use, so importing this module from the
 * typecheck, a unit test or a dashboard render that never touches the database
 * does not open a socket or throw on a missing DATABASE_URL.
 *
 * MergeMate's webhook server and review workers are long-lived processes (Fly.io
 * / Railway per ARCHITECTURE.md), so they get a real pool. The `VERCEL` branch
 * is kept because the dashboard is deployable there: every warm serverless
 * instance keeps its own pool, and a generous `max` multiplies into Neon's
 * connection ceiling. `prepare: false` is required either way — Neon's pooled
 * endpoint runs PgBouncer in transaction mode, which cannot carry prepared
 * statements across connections.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

const serverless = () => Boolean(process.env.VERCEL);

export function getDb(): Db {
  if (!_db) {
    _client = postgres(env.databaseUrl, {
      max: serverless() ? 1 : 10,
      idle_timeout: serverless() ? 20 : undefined,
      connect_timeout: 10,
      prepare: false,
      // postgres.js prints server NOTICEs to the console by default, which turns
      // every idempotent `create ... if not exists` in a migration into scary
      // output. Notices are not errors; real errors still throw.
      onnotice: () => undefined,
    });
    _db = drizzle(_client, { schema, casing: "snake_case" });
  }
  return _db;
}

/** Raw postgres.js handle — used by the migrator and by shutdown paths. */
export function getSql(): ReturnType<typeof postgres> {
  getDb();
  return _client as ReturnType<typeof postgres>;
}

export async function closeDb(): Promise<void> {
  await _client?.end({ timeout: 5 });
  _client = null;
  _db = null;
}

export { schema };
