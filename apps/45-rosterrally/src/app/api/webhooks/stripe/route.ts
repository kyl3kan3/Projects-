/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint: registration payments and installments on
 * connected accounts, plus RosterRally's own flat-plan lifecycle.
 * Verify, persist, enqueue — no business logic inline.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body).
 * - [ ] Idempotency: unique event id, duplicate -> ack 200 and stop.
 * - [ ] checkout.session.completed (connected): registration -> paid,
 *       capacity/waitlist logic, household link email.
 * - [ ] invoice.payment_failed on installment schedules: registrar
 *       notification + retry job.
 * - [ ] charge.refunded: registration status + application-fee refund
 *       bookkeeping.
 * - [ ] customer.subscription.* (platform): clubs.plan for flat billing.
 * - [ ] Return 200 in <1s; failures -> Sentry + Stripe retry.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  return new Response("Not implemented", { status: 501 });
}
