/** True on Vercel (or any platform that sets it), where every warm instance
 *  keeps its own connection pool and a generous `max` multiplies into Neon's
 *  connection ceiling. */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}
