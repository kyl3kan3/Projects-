import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated and applied from a developer machine, never from a
 * build step — a build that migrates is a build that can half-migrate (root
 * DEPLOYING.md).
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
