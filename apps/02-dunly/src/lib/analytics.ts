/**
 * src/lib/analytics.ts
 *
 * Recovered-revenue attribution + dashboard aggregates. This module is the
 * product's credibility: it decides what counts as "recovered by Dunly"
 * (conservative, last-touch) vs "baseline" (would have recovered anyway).
 * Baseline is displayed but never billed on the Performance plan.
 *
 * TODO:
 * - [ ] attributeRecovery(invoicePaidEvent): priority order --
 *       (1) payment intent matches one of our recovery_attempts -> "retry";
 *       (2) card updated via our hosted page, or paid within 24h of a
 *           delivered/clicked message -> "email" | "sms";
 *       (3) otherwise -> "baseline".
 *       Writes one recovered_revenue_events row.
 * - [ ] getDashboardStats(orgId, range): recovered $ (dunly vs baseline),
 *       recovery rate, at-risk MRR, active failures, per-campaign stats.
 * - [ ] getRecoveryPreview(stripeAccountId): from 90-day backfill, estimate
 *       what Dunly would likely have recovered (the onboarding hook).
 * - [ ] computePerformancePlanCharge(orgId, month): 25% of non-baseline
 *       recovered revenue, capped at $2,000.
 * - [ ] Per-failure drill-down: full timeline of retries + messages that
 *       preceded payment (attribution transparency).
 */

import type { AttributionSource } from "../db/schema";

export interface DashboardStats {
  recoveredByDunlyCents: number;
  recoveredBaselineCents: number;
  recoveryRate: number;
  atRiskMrrCents: number;
  activeFailures: number;
}

export interface AttributionResult {
  source: AttributionSource;
  recoveryAttemptId?: string;
  messageId?: string;
  amountCents: number;
}

export function attributeRecovery(
  _stripeInvoiceId: string,
): Promise<AttributionResult> {
  throw new Error("Not implemented");
}

export function getDashboardStats(
  _orgId: string,
  _range: { from: Date; to: Date },
): Promise<DashboardStats> {
  throw new Error("Not implemented");
}
