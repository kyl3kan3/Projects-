/**
 * src/lib/digests.ts
 *
 * Email digests via Resend + React Email: the weekly reorder summary
 * and the monthly dead-stock report ("cash buried on the shelf" -- the
 * retention feature).
 *
 * TODO:
 * - [ ] weeklyDigestModel(shopId): revenue at risk, SKUs entering
 *       order_now this week, POs sent, biggest movers.
 * - [ ] monthlyDeadStockModel(shopId): from lib/deadstock
 *       monthlyDigestModel -- same numbers as the in-app screen.
 * - [ ] Render React Email templates to DESIGN.md's type/color rules
 *       (mono figures, no emoji, no gradient buttons).
 * - [ ] send(shopId, kind): respect shop settings digest day/opt-out;
 *       DRY_RUN=1 logs instead of sending.
 * - [ ] Suppression list on bounces/complaints via Resend webhooks.
 */

export type DigestKind = "weekly_reorder" | "monthly_dead_stock";

export async function sendDigest(_shopId: string, _kind: DigestKind): Promise<void> {
  throw new Error("Not implemented");
}
