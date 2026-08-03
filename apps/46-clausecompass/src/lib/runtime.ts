/**
 * Where is this code running?
 *
 * The database pool is sized from this: on Vercel every warm lambda keeps its own
 * pool, so `max` there is 1 with a short idle timeout; a local server or a script
 * gets a real pool.
 */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}
