import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads .env.local so `npm run db:migrate` works with the same file
 * `next dev` uses. Migrations run from a developer machine against the direct
 * (non-pooled) Neon URL, never from a serverless function.
 */
import { loadEnvLocal } from "./src/lib/load-env";

loadEnvLocal();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // camelCase in TypeScript, snake_case in Postgres; the db client matches.
  casing: "snake_case",
  strict: true,
  verbose: true,
});
