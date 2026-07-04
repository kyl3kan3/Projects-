import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __dunlyPostgresClient: ReturnType<typeof postgres> | undefined;
  var __dunlyDb: Db | undefined;
}

export function getDb(): Db {
  if (!serverEnv.databaseUrl) {
    throw new Error("DATABASE_URL is required for database-backed Dunly operations.");
  }

  if (!globalThis.__dunlyPostgresClient) {
    globalThis.__dunlyPostgresClient = postgres(serverEnv.databaseUrl, {
      max: 10,
      prepare: false,
    });
  }

  if (!globalThis.__dunlyDb) {
    globalThis.__dunlyDb = drizzle(globalThis.__dunlyPostgresClient, {
      schema,
      casing: "snake_case",
    });
  }

  return globalThis.__dunlyDb;
}

export { schema };
