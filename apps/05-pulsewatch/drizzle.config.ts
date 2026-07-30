import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // The schema uses camelCase in TS and snake_case in Postgres; the db client
  // is configured to match (see src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
