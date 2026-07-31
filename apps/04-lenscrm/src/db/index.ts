import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const client =
  g.pgClient ??
  postgres(process.env.DATABASE_URL ?? "postgresql://localhost:5432/lenscrm", {
      // On Vercel each warm function instance keeps its own pool, so a
      // generous max multiplies into Neon's connection ceiling. Long-lived
      // workers get a real pool.
      max: process.env.VERCEL ? 1 : 10,
      idle_timeout: process.env.VERCEL ? 20 : undefined,
      connect_timeout: 10,
      // Required by Neon's pooled endpoint (PgBouncer transaction mode).
      prepare: false,
    });
if (process.env.NODE_ENV !== "production") g.pgClient = client;

export const db = drizzle(client, { schema });
export * as schema from "./schema";
