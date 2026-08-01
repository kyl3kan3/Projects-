/**
 * Where is this code running?
 *
 * Used by the db client to size its pool and by the cron route to decide
 * whether to do the work inline or hand it to a BullMQ worker.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/** True when a Redis-backed worker is expected to exist (see DEPLOYING.md). */
export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}
