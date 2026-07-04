/**
 * src/db/index.ts
 *
 * Drizzle client singleton shared by the Next.js app and the worker.
 *
 * TODO:
 * - [ ] postgres.js connection from DATABASE_URL (pooled in app, direct in
 *       migrations).
 * - [ ] drizzle() instance with schema import; export typed `db`.
 * - [ ] Graceful shutdown hook for the worker process.
 */

export const db: unknown = undefined; // TODO: implement
