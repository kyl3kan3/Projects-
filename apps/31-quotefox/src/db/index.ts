/**
 * src/db/index.ts
 *
 * Database client singleton. Wraps postgres.js + drizzle with the schema
 * from ./schema. Imported by both the Next.js app and the worker process.
 *
 * TODO:
 * - [ ] Create postgres.js client from DATABASE_URL (pooled URL in app,
 *       direct URL for migrations).
 * - [ ] Export `db = drizzle(client, { schema })`.
 * - [ ] Guard against multiple clients during Next.js dev hot-reload
 *       (globalThis caching pattern).
 * - [ ] Enable the pgvector extension in the first migration (price-book
 *       item embeddings depend on it).
 * - [ ] Fail fast with a clear error when DATABASE_URL is unset.
 */

export function getDb(): never {
  throw new Error("Not implemented");
}
