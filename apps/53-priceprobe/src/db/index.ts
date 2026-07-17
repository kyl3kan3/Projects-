/**
 * src/db/index.ts
 *
 * Database client singleton shared by the Next.js app and the worker
 * process. Uses the postgres.js driver with Drizzle.
 *
 * TODO:
 * - [ ] Lazy-initialize the postgres client from env DATABASE_URL
 *       (import { env } from "@/lib/env") so importing this module
 *       without a database configured does not throw at build time.
 * - [ ] `prepare: false` for Neon's pooled connections.
 * - [ ] Export `db` (drizzle instance bound to schema) and `sql` (raw
 *       client) for the rare hand-written query.
 * - [ ] Graceful shutdown helper for the worker (drain + end()).
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export function getDb(): Database {
  throw new Error("Not implemented");
}
