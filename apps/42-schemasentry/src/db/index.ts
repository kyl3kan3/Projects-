/**
 * src/db/index.ts
 *
 * Drizzle client singleton shared by the API, worker, and dashboard.
 *
 * TODO:
 * - [ ] postgres.js connection from DATABASE_URL; drizzle() with schema.
 * - [ ] Export typed `db`; graceful shutdown for API/worker processes.
 */

export const db: unknown = undefined; // TODO: implement
