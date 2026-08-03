// Loads .env.local / .env first, so `npm run db:migrate` works straight after
// copying .env.example. drizzle-kit does not read dotenv files on its own, and a
// migrate command that needs DATABASE_URL exported by hand is a setup step the
// README would have to apologise for.
import "./src/lib/load-env";
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
