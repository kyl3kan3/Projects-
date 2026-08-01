import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Use the direct (non-pooled) Neon URL here: migrations should not run
    // through PgBouncer.
    url: process.env.DATABASE_URL ?? "",
  },
  // camelCase in TypeScript, snake_case in Postgres. The db client is configured
  // to match (src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
