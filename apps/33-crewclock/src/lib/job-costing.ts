/**
 * src/lib/job-costing.ts
 *
 * Live labor cost vs bid: prices time entries at loaded rates, rolls
 * them up per job, projects the finish, and fires budget threshold
 * alerts. The 4px cost bar and "$8,410 of $11,200 bid" read from here.
 *
 * TODO:
 * - [ ] burn(jobId): sum entry hours x each worker's hourly_cost_cents
 *       captured at entry time (rate changes never rewrite history),
 *       compared to bid_labor_hours / bid_labor_cost_cents.
 * - [ ] projectFinish(jobId): at the current pace, finish at X% of
 *       budget ("At this pace: $12,900 finish — $1,700 over bid").
 * - [ ] Thresholds at 80/100% (110% escalation post-MVP) -> alert
 *       events, each fired once (idempotent via sent-at columns);
 *       enqueue fan-out, never inline.
 * - [ ] Open entries count at running duration so the meter ticks while
 *       the crew is on the clock.
 * - [ ] Tabular-figure-ready output: integer cents everywhere, never
 *       floats; hours rounded only at display time.
 */

export interface JobCostRollup {
  jobId: string;
  actualHours: number;
  actualCostCents: number;
  bidHours: number | null;
  bidCostCents: number | null;
  percentOfBid: number | null;
}

export interface FinishProjection {
  projectedCostCents: number;
  projectedOverrunCents: number;
  basisDays: number;
}

export function burn(_jobId: string): Promise<JobCostRollup> {
  throw new Error("Not implemented");
}

export function projectFinish(_jobId: string): Promise<FinishProjection> {
  throw new Error("Not implemented");
}

export function checkBudgetThresholds(_jobId: string): Promise<void> {
  throw new Error("Not implemented");
}
