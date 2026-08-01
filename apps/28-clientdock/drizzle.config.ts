import { defineConfig } from "drizzle-kit";
// drizzle-kit is a plain Node process and doesn't read .env.local the way Next
// does, so `npm run db:migrate` would otherwise see an empty DATABASE_URL.
import "./src/lib/load-env";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // The schema is camelCase in TS and snake_case in Postgres; the db client is
  // configured to match (see src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
