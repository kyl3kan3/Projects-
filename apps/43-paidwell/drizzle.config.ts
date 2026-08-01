import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. Run migrations against the *direct* Neon URL (not the
 * pooled one) — PgBouncer in transaction mode cannot run DDL in the sessions
 * drizzle-kit opens.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // camelCase in TS, snake_case in Postgres. The runtime client is configured
  // with the same `casing` option (src/db/index.ts) so both agree.
  casing: "snake_case",
  strict: true,
  verbose: true,
});
