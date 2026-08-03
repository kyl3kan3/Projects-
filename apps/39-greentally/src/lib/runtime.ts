/**
 * Where the code is running.
 *
 * The database pool sizing depends on it: on Vercel every warm lambda keeps its
 * own pool, so `max: 1` there and a real pool in a long-lived process.
 */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}
