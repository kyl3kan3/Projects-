import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // The direct (non-pooled) Neon URL for migrations; the app uses the pooled one.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
