import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Use the DIRECT (non-pooled) connection string for migrations.
    url: process.env.DATABASE_URL ?? "",
  },
});
