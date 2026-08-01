/**
 * Migration runner.
 *
 * `drizzle-kit migrate` needs the kit installed at runtime; this app's processes
 * only need drizzle-orm, so migrations are applied with the ORM's own migrator
 * against the committed SQL in ./drizzle. Idempotent: the migrator keeps its
 * journal in `drizzle.__drizzle_migrations` and skips what is already applied.
 *
 *   npm run db:migrate
 */

import "../lib/load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "./index";
import { log } from "../lib/logger";

async function main() {
  const db = getDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
  log.info({}, "migrations applied");
  await closeDb();
}

main().catch(async (err: unknown) => {
  log.error({ err: String(err) }, "migration failed");
  await closeDb().catch(() => undefined);
  process.exit(1);
});
