import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const client =
  g.pgClient ??
  postgres(process.env.DATABASE_URL ?? "postgresql://localhost:5432/lenscrm", { max: 10, prepare: false });
if (process.env.NODE_ENV !== "production") g.pgClient = client;

export const db = drizzle(client, { schema });
export * as schema from "./schema";
