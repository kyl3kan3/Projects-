import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // camelCase in TypeScript, snake_case in Postgres; the client is configured to
  // match (see src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
