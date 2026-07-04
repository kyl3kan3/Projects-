/**
 * src/lib/forecast.ts
 *
 * Aging dashboard aggregates and the weekly cash-in forecast. The forecast
 * blends due dates, open promises, and each client's historical days-to-pay
 * into expected receipts by week, with per-invoice confidence.
 *
 * TODO:
 * - [ ] getAgingBuckets(firmId): 0-30 / 31-60 / 61-90 / 90+ totals + counts.
 * - [ ] getDsoTrend(firmId, months): rolling DSO series for the hero stat.
 * - [ ] expectedDate(invoice): promised_for if open promise, else
 *       due_at + client avg lateness; confidence from reliability score.
 * - [ ] buildForecast(firmId): 8-week expected-receipts columns; persist a
 *       forecast_snapshots row nightly (accuracy is auditable later).
 * - [ ] needsAttention(firmId): feed sorted by escalation urgency for the
 *       home screen.
 */

export interface AgingBuckets {
  current: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
}

export interface ForecastWeek {
  weekStart: Date;
  expectedCents: number;
  confidence: number; // 0..1
}

export function getAgingBuckets(_firmId: string): Promise<AgingBuckets> {
  throw new Error("Not implemented");
}

export function buildForecast(_firmId: string): Promise<ForecastWeek[]> {
  throw new Error("Not implemented");
}
