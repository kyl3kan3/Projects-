/**
 * src/lib/announcements.ts
 *
 * Segmented announcements over email + SMS with per-recipient delivery
 * tracking. Reaching people is the product; proving it is the feature.
 *
 * TODO:
 * - [ ] resolveSegment(associationId, segments): all | delinquency bucket |
 *       explicit units -> member recipient list; SMS channel filters to
 *       sms_opt_in only, everyone else falls back to email automatically.
 * - [ ] send(announcementId): fan out via Resend (React Email template
 *       with association branding) and Twilio; write a deliveries row per
 *       recipient per channel; respect DRY_RUN.
 * - [ ] Provider webhooks -> delivery status updates (delivered / bounced /
 *       failed); STOP replies route through roster.recordStopReply.
 * - [ ] deliveryReport(announcementId): "58 delivered · 2 bounced" with
 *       bounce rows expandable to fix addresses inline (roster hygiene
 *       loop).
 * - [ ] Rate/size guards: max recipients per plan sanity check, link-only
 *       attachments (documents live in the library, not in email blobs).
 * - [ ] Monthly board digest (cron): collected vs expected, open issues,
 *       delinquency total -- the between-cycles retention touch.
 */

export function send(): Promise<void> {
  throw new Error("Not implemented");
}

export function deliveryReport(): Promise<unknown> {
  throw new Error("Not implemented");
}
