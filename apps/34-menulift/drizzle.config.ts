import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit runs outside Next, so load the same files Next would.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // camelCase in TS, snake_case in Postgres — the db client matches (src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
