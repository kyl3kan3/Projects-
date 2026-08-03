import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit is a plain Node process, so it does not get Next's env loading.
// Reading .env.local here is what makes `npm run db:migrate` work straight after
// copying .env.example, exactly as the README says it does.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // The schema is camelCase in TypeScript and snake_case in Postgres; the db
  // client is configured to match (see src/db/index.ts).
  casing: "snake_case",
  strict: true,
  verbose: true,
});
