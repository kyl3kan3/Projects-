/**
 * src/lib/comms.ts
 *
 * Parent communications: announcements with audience targeting, email/SMS
 * fan-out, read receipts, and automated game-day reminders. "Sent" is not
 * "seen" — the receipt grid is the product.
 *
 * TODO:
 * - [ ] compose/send(announcement): audience resolution (club/division/
 *       team -> households, deduped), recipient count preview, channel mix
 *       (SMS only to consented households, budget-checked).
 * - [ ] Fan-out as worker jobs: one deliveries row per household+channel;
 *       per-club rate limiting.
 * - [ ] Receipts: Resend open/click webhooks -> opened/clicked; Twilio
 *       delivery receipts; SMS "views" only via the tracked link — label
 *       it "viewed link", never fake an open.
 * - [ ] resendToUnreached(announcementId): exactly the households with no
 *       opened/clicked/viewed state.
 * - [ ] Game-day reminders: T-24h email, T-3h SMS, generated at publish;
 *       canceled/regenerated when a game moves.
 * - [ ] Message archive per household link-page ("I never got it" ends here).
 */

export function sendAnnouncement(_announcementId: string): Promise<void> {
  throw new Error("Not implemented");
}

export function resendToUnreached(_announcementId: string): Promise<void> {
  throw new Error("Not implemented");
}
