/**
 * src/db/index.ts
 *
 * Database client (lazy singleton), shared by the dashboard, the Fastify API
 * and the CLI's local tooling.
 *
 * The connection is created on first use so importing this module during
 * `next build` — which has no DATABASE_URL — neither opens a socket nor throws.
 *
 * Serverless note: on Vercel every warm function instance keeps its own pool,
 * so a generous `max` multiplies into Neon's connection ceiling fast. There the
 * pool is one connection with a short idle timeout; a long-lived Fastify
 * process gets a real pool. `prepare: false` is required either way — Neon's
 * pooled endpoint runs PgBouncer in transaction mode, which cannot carry
 * prepared statements across connections.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: ReturnType<typeof postgres> | null = null;
let database: Db | null = null;

const isServerless = () => Boolean(process.env.VERCEL);

export function getDb(): Db {
  if (!database) {
    client = postgres(env.databaseUrl, {
      max: isServerless() ? 1 : 10,
      idle_timeout: isServerless() ? 20 : undefined,
      connect_timeout: 10,
      prepare: false,
    });
    database = drizzle(client, { schema, casing: "snake_case" });
  }
  return database;
}

/** Close the pool — used by the Fastify process and scripts on shutdown. */
export async function closeDb(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = null;
  database = null;
}

export { schema };
