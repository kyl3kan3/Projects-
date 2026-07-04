/**
 * src/lib/expiry.ts
 *
 * Expiry engine for the org's own papers: contractor licenses, trade
 * registrations, business licenses, insurance certs -- and issued permits,
 * whose expiry rules come from their jurisdiction. Plans the escalating
 * alert schedule; the daily worker scan executes it.
 *
 * TODO:
 * - [ ] scanForUpcomingExpiries(horizonDays): licenses_and_credentials +
 *       issued permit_applications with expires_at inside the horizon.
 * - [ ] planAlerts(subject): T-60/T-30/T-7/T-1 for licenses, T-30/T-7/T-1
 *       for permits; skip tiers already in the past; idempotent against
 *       existing expiry_alerts rows.
 * - [ ] escalationRecipients(subject, tier): assigned user at T-60/T-30;
 *       + org owner at T-7/T-1.
 * - [ ] onRenewal(subjectId, newExpiresAt): cancel outstanding alerts,
 *       replan against the new date.
 * - [ ] markExpired(subjectId): flip status, surface red state on the job,
 *       keep in weekly digest until resolved.
 * - [ ] Permit expiry derivation: jurisdiction rules like "180 days after
 *       last passed inspection" recompute expires_at on inspection results.
 */

import type { ExpiryAlertTier } from "../db/schema";

export type ExpirySubjectType = "license" | "permit_application";

export interface PlannedAlert {
  subjectType: ExpirySubjectType;
  subjectId: string;
  tier: ExpiryAlertTier;
  scheduledFor: Date;
  recipientUserIds: string[];
}

export function planAlerts(
  _subjectType: ExpirySubjectType,
  _subjectId: string,
): Promise<PlannedAlert[]> {
  throw new Error("Not implemented");
}

export function onRenewal(
  _subjectId: string,
  _newExpiresAt: Date,
): Promise<void> {
  throw new Error("Not implemented");
}
