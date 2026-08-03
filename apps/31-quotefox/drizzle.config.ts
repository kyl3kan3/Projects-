import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit is a plain Node process, so it does not get Next's .env.local
// loading for free. Migrations should run against the *direct* Neon URL, not the
// pooled one: PgBouncer in transaction mode cannot run DDL in the sessions
// drizzle-kit opens.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // camelCase in TypeScript, snake_case in Postgres. The db client is
  // configured the same way (src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
