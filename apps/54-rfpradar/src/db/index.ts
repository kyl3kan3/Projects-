/**
 * src/db/index.ts
 *
 * Drizzle client over postgres-js. One lazy singleton shared by the
 * Next.js app and the worker (globalThis-cached so `next dev` hot
 * reloads don't leak connections).
 *
 * TODO:
 * - [ ] Lazy-init postgres(env.databaseUrl, { prepare: false }) —
 *       Neon's pooled URL requires prepare: false.
 * - [ ] export const db = drizzle(client, { schema })
 */

export * as schema from "./schema";

export function db(): never {
  throw new Error("Not implemented: initialize drizzle(postgres(env.databaseUrl))");
}
