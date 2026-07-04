/**
 * src/app/api/webhooks/inbound-email/route.ts
 *
 * POST endpoint for Resend Inbound: every email forwarded to
 * docs+{slug}@in.ledgerlens.app lands here. Verify, persist, enqueue --
 * return 200 in under a second; no extraction inline.
 *
 * TODO:
 * - [ ] Verify webhook signature (RESEND_WEBHOOK_SECRET); 401 otherwise.
 * - [ ] resolveOrgFromAddress; unknown slug -> 200 and drop silently
 *       (never reveal valid addresses to probes).
 * - [ ] Abuse guards from lib/inbound-email (size/type/rate/spam).
 * - [ ] persistAndEnqueue artifacts; idempotent by email_message_id.
 * - [ ] Always 200 on handled paths; 5xx only for genuine transient
 *       failures so Resend retries.
 */

export async function POST(_request: Request): Promise<Response> {
  throw new Error("Not implemented");
}
