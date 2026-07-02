/**
 * src/lib/campaigns.ts
 *
 * Campaign engine: turns an org's recovery_campaigns config into concrete
 * scheduled work (retry attempts + message sends) for a payment failure or
 * an expiring card. Pure planning logic -- execution happens in the worker.
 *
 * TODO:
 * - [ ] Default campaign templates: dunning (email +1h/+3d/+7d, SMS +5d on
 *       Growth+, retries +1d/+3d/+7d/+14d) and pre-dunning (T-21d/T-7d/T-1d).
 * - [ ] planRecovery(failure, campaign): returns retry + message schedule
 *       with absolute timestamps; nudge retries toward local morning and
 *       start-of-month/payday heuristics.
 * - [ ] planPreDunning(paymentMethod, subscription, campaign): schedule
 *       relative to first renewal on the expiring card.
 * - [ ] cancelPlan(failureId): remove outstanding BullMQ jobs when a
 *       failure resolves (recovered / subscription canceled).
 * - [ ] Plan gating: SMS steps only on growth|scale|performance.
 * - [ ] Validation (zod) for campaign step config edited from the dashboard.
 */

import type { CampaignStep, RetryScheduleEntry } from "../db/schema";

export interface RecoveryPlan {
  retries: Array<{ scheduledFor: Date; entry: RetryScheduleEntry }>;
  messages: Array<{ scheduledFor: Date; step: CampaignStep }>;
}

export function planRecovery(
  _failureId: string,
  _campaignId: string,
): RecoveryPlan {
  throw new Error("Not implemented");
}

export function planPreDunning(
  _paymentMethodId: string,
  _campaignId: string,
): RecoveryPlan {
  throw new Error("Not implemented");
}

export function cancelPlan(_failureId: string): Promise<void> {
  throw new Error("Not implemented");
}
