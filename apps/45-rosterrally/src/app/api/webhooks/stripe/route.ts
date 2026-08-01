import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clubs, households, registrations, webhookEvents } from "@/db/schema";
import { DEFAULT_CLUB_SETTINGS } from "@/lib/auth";
import { notifyHousehold } from "@/lib/comms";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { getPlatformStripe } from "@/lib/payments";
import {
  applyAvailableCredit,
  getHouseholdMoney,
  promoteFromWaitlist,
  settlePayment,
} from "@/lib/registration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhooks: registration payments on connected accounts, refunds, and our
 * own flat-plan lifecycle.
 *
 * Verify, then gate on idempotency, then hand off. `webhook_events` is the outer
 * gate: an event id we have already seen is acknowledged and dropped before any
 * handler runs, so Stripe's retries — and Stripe retries a lot — cannot credit the
 * same money twice. `settlePayment` has its own inner gate on the PaymentIntent id
 * as well, because two different event types can describe one payment.
 *
 * This route is the one part of the money path that cannot be exercised in this
 * environment: there is no Stripe key here. The settlement it calls is the same
 * function the test gateway calls, which is exercised end to end.
 */
export async function POST(req: Request): Promise<Response> {
  const stripe = getPlatformStripe();
  if (!stripe) {
    return Response.json(
      { error: "Stripe is not configured on this deployment" },
      { status: 503 },
    );
  }
  const secret = env.stripeWebhookSecret;
  if (!secret) {
    return Response.json({ error: "STRIPE_WEBHOOK_SECRET is not set" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "No signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error("[stripe] signature check failed", err);
    return Response.json({ error: "Bad signature" }, { status: 400 });
  }

  const db = getDb();
  const [claimed] = await db
    .insert(webhookEvents)
    .values({ source: "stripe", eventId: event.id, eventType: event.type })
    .onConflictDoNothing()
    .returning();
  if (!claimed) {
    // Already handled. Acknowledge so Stripe stops retrying.
    return Response.json({ ok: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckout(event.data.object);
        break;
      }
      case "charge.refunded": {
        // The refund was almost certainly initiated from our own console, which
        // has already written the negative allocation. Log it and move on rather
        // than double-recording.
        console.info("[stripe] charge.refunded", event.data.object.id);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await handleSubscription(event.data.object);
        break;
      }
      default:
        console.info(`[stripe] ignoring ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe] handler for ${event.type} failed`, err);
    // Return 200 anyway: the event is recorded as seen, and a 500 would have
    // Stripe retry an event whose handler is deterministically broken. The error
    // is in the log for a human.
    return Response.json({ ok: false, error: "handler failed" });
  }

  return Response.json({ ok: true });
}

async function handleCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const clubId = session.metadata?.clubId;
  const householdId = session.metadata?.householdId;
  const registrationIds = (session.metadata?.registrationIds ?? "")
    .split(",")
    .filter(Boolean);
  const platformFeeCents = Number(session.metadata?.platformFeeCents ?? 0);
  const amountCents = session.amount_total ?? 0;
  const intentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!clubId || !householdId || !intentId || amountCents <= 0) {
    console.error("[stripe] checkout.session.completed missing metadata", session.id);
    return;
  }

  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  if (!household || household.clubId !== clubId) {
    console.error("[stripe] checkout for an unknown household", householdId);
    return;
  }
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));

  const result = await settlePayment({
    clubId,
    householdId,
    amountCents,
    platformFeeCents: Number.isFinite(platformFeeCents) ? platformFeeCents : 0,
    method: "card",
    providerReference: intentId,
    note: `Stripe checkout ${session.id}`,
  });
  if (result.duplicate) return;

  await applyAvailableCredit(householdId);

  // A payment can free a place: somebody who paid may have replaced a lapsed
  // registration, and the queue should move.
  const divisionIds = new Set<string>();
  for (const id of registrationIds) {
    const [reg] = await db.select().from(registrations).where(eq(registrations.id, id));
    if (reg) divisionIds.add(reg.divisionId);
  }
  for (const divisionId of divisionIds) await promoteFromWaitlist(divisionId);

  const money = await getHouseholdMoney(householdId);
  const seasonId =
    registrationIds.length > 0
      ? (await db.select().from(registrations).where(eq(registrations.id, registrationIds[0])))[0]
          ?.seasonId ?? ""
      : "";

  try {
    await notifyHousehold({
      clubId,
      seasonId,
      householdId,
      subject: `You're registered with ${club?.name ?? "the club"}`,
      body: [
        `Thanks ${household.contactName} — we received ${formatMoney(amountCents)}.`,
        money.netDueCents > 0
          ? `${formatMoney(money.netDueCents)} is still outstanding; your family page has the plan.`
          : "Nothing is outstanding.",
        "Your family page has your children's schedule, every message we send, and the volunteer slots you can claim.",
      ].join("\n\n"),
      channels: household.smsConsent && household.phone ? ["email", "sms"] : ["email"],
      purpose: "registration_receipt",
      smsBudget: club?.settings?.smsMonthlyBudget ?? DEFAULT_CLUB_SETTINGS.smsMonthlyBudget,
    });
  } catch (err) {
    // A receipt that failed must never unwind a settled payment.
    console.error("[stripe] receipt not sent", err);
  }
}

async function handleSubscription(subscription: Stripe.Subscription): Promise<void> {
  const clubId = subscription.metadata?.clubId;
  if (!clubId) return;
  const active = subscription.status === "active" || subscription.status === "trialing";
  await getDb()
    .update(clubs)
    .set({ plan: active ? "flat" : "per_registration" })
    .where(eq(clubs.id, clubId));
}
