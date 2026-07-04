/**
 * src/lib/screening.ts
 *
 * Screening orchestration behind a provider adapter (SmartMove-class API).
 * Applicant-initiated and applicant-paid: the provider handles identity
 * verification, payment, and FCRA report delivery; we orchestrate and
 * store the summary.
 *
 * TODO:
 * - [ ] ScreeningProvider interface: invite(application), getStatus(ref),
 *       parseWebhook(payload) — keep provider-specific code inside one
 *       adapter file so a second provider can slot in (Phase 3 failover).
 * - [ ] inviteToScreen(applicationId): create screening_reports row
 *       (status invited), call adapter, email the applicant their link.
 * - [ ] Webhook handling: in_progress -> ready; store summary fields
 *       exactly as returned (never re-derive or editorialize risk).
 * - [ ] Report expiry handling (provider reports expire ~30 days).
 * - [ ] Margin bookkeeping: retail price vs provider cost per report.
 */

export type ScreeningStatus = "invited" | "in_progress" | "ready" | "expired";

export function inviteToScreen(_applicationId: string): Promise<void> {
  throw new Error("Not implemented");
}
