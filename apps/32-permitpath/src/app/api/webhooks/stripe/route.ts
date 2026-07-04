/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe Billing webhook endpoint. Verify, persist, enqueue -- near-zero
 * work inline; entitlement changes are applied by the worker so a web
 * deploy never drops a subscription event.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body, not parsed
 *       JSON).
 * - [ ] Insert into webhook_events with (provider, provider_event_id)
 *       unique constraint; duplicate delivery -> ack 200 and stop.
 * - [ ] Enqueue a process-webhook job (BullMQ) and return 200 in <1s.
 * - [ ] Handle in worker: checkout.session.completed,
 *       customer.subscription.updated/deleted, invoice.paid,
 *       invoice.payment_failed -> organizations.plan via
 *       lib/stripe.syncSubscriptionFromEvent.
 * - [ ] Unknown event types: persist, ack, ignore (no 4xx -- Stripe
 *       retries are not an error).
 */

export function POST(_req: Request): Promise<Response> {
  throw new Error("Not implemented");
}
