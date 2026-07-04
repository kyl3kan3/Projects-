/**
 * src/db/index.ts
 *
 * Drizzle + postgres.js client factory. Single connection point for the
 * whole app (dashboard, portal routes, cron job routes, webhooks).
 *
 * TODO:
 * - [ ] Create postgres.js client from DATABASE_URL (pooled).
 * - [ ] Export drizzle(db, { schema }) with the full schema.
 * - [ ] Singleton pattern so Next.js hot reload doesn't leak connections.
 */

export const db: unknown = undefined;
