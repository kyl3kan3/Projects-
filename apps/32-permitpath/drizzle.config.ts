import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations want the direct (unpooled) connection string; Neon's pooled
    // endpoint cannot run DDL inside the transaction drizzle-kit uses.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  // The schema is camelCase in TypeScript and snake_case in Postgres; the db
  // client is configured to match (see src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
