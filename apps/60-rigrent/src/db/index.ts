/**
 * src/db/index.ts
 *
 * Drizzle client over postgres-js. Lazy singleton, globalThis-cached.
 *
 * TODO:
 * - [ ] Lazy-init postgres(env.databaseUrl, { prepare: false }).
 * - [ ] export const db = drizzle(client, { schema })
 */

export * as schema from "./schema";

export function db(): never {
  throw new Error("Not implemented: initialize drizzle(postgres(env.databaseUrl))");
}
