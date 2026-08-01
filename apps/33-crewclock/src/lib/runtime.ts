/**
 * Deployment shape.
 *
 * ARCHITECTURE.md describes a long-lived BullMQ worker. The portfolio's
 * deployment target is Vercel + Neon, which has no always-on process, so the
 * background work (OT projection scan, budget threshold checks, forgotten
 * clock-out flagging) lives in one idempotent function — `runTick()` in
 * src/lib/tick.ts — reached two ways:
 *
 *   - `/api/cron/tick`, protected by CRON_SECRET (Vercel Cron, or any external
 *     scheduler that can hit a URL).
 *   - `npm run worker`, a plain Node loop that calls the same function, for a
 *     Railway/Fly host where an always-on process is preferred.
 *
 * Nothing about the domain logic differs between the two; the tick is safe to
 * run twice in the same minute because every alert it can send is guarded by a
 * uniqueness constraint or a `*_sent_at` column.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long a tick may run before it stops and leaves the rest to the next one.
 * Vercel's ceiling is 300s; stopping well short keeps one slow org from
 * starving the others.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
