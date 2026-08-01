import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit is a plain Node process, so it does not get Next's env loading.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // camelCase in TS, snake_case in Postgres; the client matches (src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
