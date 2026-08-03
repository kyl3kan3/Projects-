import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit runs outside Next, so it does not get .env.local for free.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
