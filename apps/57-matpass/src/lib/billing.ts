/**
 * src/lib/billing.ts
 *
 * Two Stripe surfaces: family tuition on the school's own connected account, and
 * MatPass's own subscription. Card details are collected only by Stripe-hosted
 * flows — there is no card field anywhere in this product.
 *
 * ## The rules this file must never break
 *
 * 1. **Attendance is never blocked by billing state.** Nothing here is called
 *    from the check-in path, and nothing in the check-in path reads a
 *    subscription. A past-due family's kid checks in; the desk has the
 *    conversation. `attendance.test.ts` proves it.
 * 2. **Dunning stops.** Notices are pinned to fixed distances from
 *    `past_due_since` (day 0, day 3, day 7) rather than "is past due today", so a
 *    family that never pays gets three emails, not one a day forever.
 * 3. **Money is integer cents.** No float arithmetic, ever.
 * 4. **Webhooks are idempotent by event id.** `webhook_events` has a unique index
 *    on (provider, external_id); a duplicate delivery is acknowledged and
 *    dropped.
 */

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  families,
  membershipPlans,
  schools,
  students,
  subscriptions,
  webhookEvents,
  type Family,
  type MembershipPlan,
  type PlanTier,
  type Subscription,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { PLANS, formatMoney, tuitionCents } from "@/lib/plans";
import { gateway } from "@/lib/stripe";
import { dayKey, daysBetween, formatDay } from "@/lib/time";

// ------------------------------------------------------------- connect

export async function connectOnboarding(input: {
  schoolId: string;
  actorId: string;
}): Promise<{ url: string; simulated: boolean }> {
  const db = getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, input.schoolId));
  if (!school) throw new Error("School not found");

  const gw = await gateway();
  const result = await gw.connectAccountLink({
    schoolId: school.id,
    schoolName: school.name,
    existingAccountId: school.stripeAccountId,
  });
  if (result.accountId !== school.stripeAccountId) {
    await db
      .update(schools)
      .set({ stripeAccountId: result.accountId, updatedAt: new Date() })
      .where(eq(schools.id, school.id));
  }
  await audit({
    schoolId: school.id,
    actorId: input.actorId,
    action: "billing.connect_started",
    target: result.accountId,
    metadata: { simulated: result.simulated },
  });
  return { url: result.url, simulated: result.simulated };
}

// -------------------------------------------------------- membership plans

export async function createMembershipPlan(input: {
  schoolId: string;
  name: string;
  amountCents: number;
  interval: "month" | "year";
  kind: "per_student" | "family_flat";
  actorId: string;
}): Promise<MembershipPlan> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Give the plan a name");
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100) {
    throw new Error("Enter an amount of at least $1.00");
  }
  const db = getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, input.schoolId));
  if (!school) throw new Error("School not found");

  const gw = await gateway();
  const { priceId } = await gw.createPrice({
    accountId: school.stripeAccountId,
    productName: name,
    amountCents: input.amountCents,
    interval: input.interval,
  });

  const [plan] = await db
    .insert(membershipPlans)
    .values({
      schoolId: input.schoolId,
      name,
      amountCents: input.amountCents,
      interval: input.interval,
      kind: input.kind,
      stripePriceId: priceId,
      status: "active",
    })
    .returning();

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "billing.plan_created",
    target: plan.id,
    metadata: { name, amountCents: input.amountCents, kind: input.kind },
  });
  return plan;
}

export async function listMembershipPlans(schoolId: string): Promise<MembershipPlan[]> {
  const db = getDb();
  return db
    .select()
    .from(membershipPlans)
    .where(and(eq(membershipPlans.schoolId, schoolId), eq(membershipPlans.status, "active")))
    .orderBy(asc(membershipPlans.amountCents));
}

export async function archiveMembershipPlan(input: {
  schoolId: string;
  planId: string;
  actorId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(membershipPlans)
    .set({ status: "archived" })
    .where(and(eq(membershipPlans.id, input.planId), eq(membershipPlans.schoolId, input.schoolId)));
  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "billing.plan_archived",
    target: input.planId,
  });
}

// ------------------------------------------------------ family subscriptions

/**
 * Subscribe a household. The desk picks the plan and which students it covers;
 * the parent gets a Stripe-hosted link and completes it on their own phone.
 */
export async function subscribeFamily(input: {
  schoolId: string;
  familyId: string;
  membershipPlanId: string;
  studentIds: string[];
  actorId: string;
}): Promise<{ paymentLinkUrl: string; simulated: boolean; amountCents: number }> {
  const db = getDb();
  const [family] = await db
    .select()
    .from(families)
    .where(and(eq(families.id, input.familyId), eq(families.schoolId, input.schoolId)));
  if (!family) throw new Error("Household not found");
  if (!family.email) throw new Error("Add a guardian email to the household first — the link goes to them");

  const [plan] = await db
    .select()
    .from(membershipPlans)
    .where(
      and(eq(membershipPlans.id, input.membershipPlanId), eq(membershipPlans.schoolId, input.schoolId)),
    );
  if (!plan) throw new Error("Membership plan not found");

  const covered = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.familyId, family.id), inArray(students.id, input.studentIds)));
  if (covered.length === 0) throw new Error("Pick at least one student this membership covers");

  const [school] = await db.select().from(schools).where(eq(schools.id, input.schoolId));
  const gw = await gateway();

  let customerId = family.stripeCustomerId;
  if (!customerId) {
    const created = await gw.createCustomer({
      accountId: school?.stripeAccountId ?? null,
      email: family.email,
      name: family.name,
    });
    customerId = created.customerId;
    await db
      .update(families)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(families.id, family.id));
  }

  const quantity = plan.kind === "per_student" ? covered.length : 1;
  const amountCents = tuitionCents(plan, covered.length);

  const [subscription] = await db
    .insert(subscriptions)
    .values({
      familyId: family.id,
      membershipPlanId: plan.id,
      studentIds: covered.map((c) => c.id),
      status: "active",
      currentPeriodEnd: nextPeriodEnd(new Date(), plan.interval),
    })
    .returning();

  const checkout = await gw.subscriptionCheckout({
    accountId: school?.stripeAccountId ?? null,
    customerId,
    priceId: plan.stripePriceId ?? "",
    quantity,
    subscriptionRef: subscription.id,
    successUrl: `${env.appUrl}/billing?subscribed=${subscription.id}`,
  });

  if (checkout.subscriptionId) {
    await db
      .update(subscriptions)
      .set({ stripeSubscriptionId: checkout.subscriptionId, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id));
  }

  await sendEmail({
    to: family.email,
    subject: `Set up tuition for the ${family.name}`,
    text: [
      `Please finish setting up your membership payment method:`,
      checkout.url,
      "",
      `Plan: ${plan.name} — ${formatMoney(amountCents)} per ${plan.interval}`,
      `Covers: ${covered.length} student${covered.length === 1 ? "" : "s"}`,
      "",
      `Card details are entered on Stripe's own page — the school never sees them.`,
    ].join("\n"),
  });

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "billing.family_subscribed",
    target: subscription.id,
    metadata: { familyId: family.id, planId: plan.id, students: covered.length, amountCents },
  });

  return { paymentLinkUrl: checkout.url, simulated: checkout.simulated, amountCents };
}

function nextPeriodEnd(from: Date, interval: "month" | "year"): Date {
  const d = new Date(from);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export interface FamilyBillingRow {
  family: Family;
  studentNames: string[];
  subscription: Subscription | null;
  plan: MembershipPlan | null;
  amountCents: number | null;
  /** Days past due, derived as-of-now rather than read from a stale column. */
  daysPastDue: number | null;
}

/**
 * The desk's billing screen. Statuses are rendered from the subscription's own
 * state plus today's date — never from a column a sweep is supposed to have
 * reconciled, which is how an invoice ends up showing "Due" 212 days late.
 */
export async function familyBilling(input: {
  schoolId: string;
  timezone: string;
  now?: Date;
}): Promise<FamilyBillingRow[]> {
  const db = getDb();
  const now = input.now ?? new Date();
  const today = dayKey(now, input.timezone);

  const familyRows = await db
    .select()
    .from(families)
    .where(eq(families.schoolId, input.schoolId))
    .orderBy(asc(families.name));
  if (familyRows.length === 0) return [];

  const studentRows = await db
    .select({ id: students.id, familyId: students.familyId, firstName: students.firstName, lastName: students.lastName, status: students.status })
    .from(students)
    .where(eq(students.schoolId, input.schoolId));

  const subRows = await db
    .select({ subscription: subscriptions, plan: membershipPlans })
    .from(subscriptions)
    .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.membershipPlanId))
    .where(inArray(subscriptions.familyId, familyRows.map((f) => f.id)))
    .orderBy(desc(subscriptions.createdAt));

  return familyRows.map((family) => {
    const mine = studentRows.filter((s) => s.familyId === family.id);
    const sub = subRows.find(
      (s) => s.subscription.familyId === family.id && s.subscription.status !== "canceled",
    );
    const covered = sub
      ? mine.filter((s) => sub.subscription.studentIds.includes(s.id)).length || mine.length
      : mine.length;
    return {
      family,
      studentNames: mine.map((s) => `${s.firstName} ${s.lastName}`),
      subscription: sub?.subscription ?? null,
      plan: sub?.plan ?? null,
      amountCents: sub ? tuitionCents(sub.plan, covered) : null,
      daysPastDue:
        sub?.subscription.pastDueSince && sub.subscription.status === "past_due"
          ? daysBetween(dayKey(sub.subscription.pastDueSince, input.timezone), today)
          : null,
    };
  });
}

export async function pauseFamilySubscription(input: {
  schoolId: string;
  subscriptionId: string;
  actorId: string;
  resume: boolean;
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ subscription: subscriptions, accountId: schools.stripeAccountId })
    .from(subscriptions)
    .innerJoin(families, eq(families.id, subscriptions.familyId))
    .innerJoin(schools, eq(schools.id, families.schoolId))
    .where(and(eq(subscriptions.id, input.subscriptionId), eq(families.schoolId, input.schoolId)));
  if (!row) throw new Error("Subscription not found");

  if (row.subscription.stripeSubscriptionId) {
    const gw = await gateway();
    await gw.pauseSubscription({
      accountId: row.accountId,
      subscriptionId: row.subscription.stripeSubscriptionId,
      resume: input.resume,
    });
  }

  await db
    .update(subscriptions)
    .set({
      status: input.resume ? "active" : "paused",
      // Resuming clears the dunning ladder so a later failure starts clean.
      pastDueSince: input.resume ? null : row.subscription.pastDueSince,
      failedPayments: input.resume ? 0 : row.subscription.failedPayments,
      lastDunningOn: input.resume ? null : row.subscription.lastDunningOn,
      escalatedAt: input.resume ? null : row.subscription.escalatedAt,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, input.subscriptionId));

  // A pause is not a quiet quit: pausing the money pauses the students, so the
  // retention scan leaves them alone.
  const studentIds = row.subscription.studentIds;
  if (studentIds.length > 0) {
    await db
      .update(students)
      .set({ status: input.resume ? "active" : "paused", updatedAt: new Date() })
      .where(and(eq(students.schoolId, input.schoolId), inArray(students.id, studentIds)));
  }

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: input.resume ? "billing.subscription_resumed" : "billing.subscription_paused",
    target: input.subscriptionId,
  });
}

// -------------------------------------------------------------- dunning

/** The fixed rungs, in days after the first failure. Not "every day forever". */
export const DUNNING_DAYS = [0, 3, 7] as const;

export interface DunningResult {
  emailed: number;
  escalated: number;
  skipped: number;
}

/**
 * Email past-due households a hosted payment-update link — once per rung.
 *
 * The bug this avoids: "past due" stays true until someone pays, so a sweep that
 * asks "is this family past due?" mails them every single night. The rung is
 * computed from the distance to `past_due_since` and recorded in `lastDunningOn`,
 * so each family gets day 0, day 3 and day 7 and then silence.
 */
export async function dunning(input: {
  schoolId: string;
  now?: Date;
}): Promise<DunningResult> {
  const db = getDb();
  const now = input.now ?? new Date();
  const [school] = await db.select().from(schools).where(eq(schools.id, input.schoolId));
  if (!school) throw new Error("School not found");
  const today = dayKey(now, school.timezone);

  const rows = await db
    .select({ subscription: subscriptions, family: families, plan: membershipPlans })
    .from(subscriptions)
    .innerJoin(families, eq(families.id, subscriptions.familyId))
    .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.membershipPlanId))
    .where(
      and(
        eq(families.schoolId, input.schoolId),
        eq(subscriptions.status, "past_due"),
        isNotNull(subscriptions.pastDueSince),
      ),
    );

  const gw = await gateway();
  let emailed = 0;
  let escalated = 0;
  let skipped = 0;

  for (const row of rows) {
    const since = row.subscription.pastDueSince;
    if (!since) continue;
    const age = daysBetween(dayKey(since, school.timezone), today);
    // The tightest rung that has been crossed and not yet sent — selecting the
    // loosest is how a ladder fires once and then goes silent forever.
    const rung = [...DUNNING_DAYS].reverse().find((d) => age >= d);
    if (rung === undefined) {
      skipped += 1;
      continue;
    }
    const rungDay = dayKeyForRung(since, rung, school.timezone);
    if (row.subscription.lastDunningOn && row.subscription.lastDunningOn >= rungDay) {
      skipped += 1;
      continue;
    }

    if (!row.family.email) {
      skipped += 1;
      continue;
    }

    const link = await gw.paymentUpdateLink({
      accountId: school.stripeAccountId,
      customerId: row.family.stripeCustomerId ?? "",
      subscriptionRef: row.subscription.id,
      returnUrl: `${env.appUrl}/billing`,
    });

    const result = await sendEmail({
      to: row.family.email,
      subject:
        rung === 0
          ? `${school.name}: your tuition payment did not go through`
          : `${school.name}: tuition still outstanding — ${age} days`,
      text: [
        `The card on file for the ${row.family.name} was declined on ${formatDay(dayKey(since, school.timezone))}.`,
        "",
        `Update the payment method here (Stripe's own secure page):`,
        link.url,
        "",
        `Plan: ${row.plan.name} — ${formatMoney(row.plan.amountCents)} per ${row.plan.interval}`,
        "",
        `Training continues as normal in the meantime — nobody is turned away at the door.`,
        "",
        `— ${school.name}`,
      ].join("\n"),
    });

    const shouldEscalate = row.subscription.failedPayments >= 2 && !row.subscription.escalatedAt;
    await db
      .update(subscriptions)
      .set({
        lastDunningOn: today,
        escalatedAt: shouldEscalate ? now : row.subscription.escalatedAt,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, row.subscription.id));

    if (result.ok) emailed += 1;
    else skipped += 1;
    if (shouldEscalate) {
      escalated += 1;
      await audit({
        schoolId: input.schoolId,
        action: "billing.dunning_escalated",
        target: row.subscription.id,
        metadata: { failures: row.subscription.failedPayments, familyId: row.family.id },
      });
    }
  }

  return { emailed, escalated, skipped };
}

function dayKeyForRung(since: Date, rung: number, timezone: string): string {
  const base = dayKey(since, timezone);
  return new Date(Date.parse(`${base}T00:00:00Z`) + rung * 86_400_000).toISOString().slice(0, 10);
}

// -------------------------------------------------------------- webhooks

/**
 * Persist a verified Stripe event. Returns false when this event id has already
 * been stored, which is the caller's cue to acknowledge and stop.
 */
export async function persistWebhookEvent(input: {
  externalId: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string; fresh: boolean }> {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: input.externalId,
      type: input.type,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });
  if (inserted.length > 0) return { id: inserted[0].id, fresh: true };
  const [existing] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "stripe"), eq(webhookEvents.externalId, input.externalId)));
  return { id: existing?.id ?? "", fresh: false };
}

/**
 * Apply a stored event. Idempotent twice over: the row can only be inserted once,
 * and applying it again lands the same state.
 *
 * Handled:
 * - `invoice.payment_failed` — the family goes past_due, the failure count goes
 *   up, and `past_due_since` is set once (the dunning ladder's anchor).
 * - `invoice.payment_succeeded` / `invoice.paid` — past-due state and the whole
 *   dunning ladder clear.
 * - `customer.subscription.updated` / `.deleted` — status mirrored.
 * - `checkout.session.completed` — a hosted flow finished: attach the Stripe
 *   subscription id, and for platform events flip MatPass's own plan on.
 */
export async function applyStripeEvent(webhookEventId: string): Promise<{ applied: string }> {
  const db = getDb();
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId));
  if (!event) throw new Error("Webhook event not found");
  if (event.processedAt) return { applied: "already-processed" };

  const payload = event.payload as {
    data?: { object?: Record<string, unknown> };
    account?: string;
  };
  const object = payload.data?.object ?? {};
  let applied = "ignored";

  switch (event.type) {
    case "invoice.payment_failed": {
      applied = await onPaymentFailed(object);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      applied = await onPaymentSucceeded(object);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      applied = await onSubscriptionChanged(event.type, object);
      break;
    }
    case "checkout.session.completed": {
      applied = await onCheckoutCompleted(object);
      break;
    }
    default:
      applied = "ignored";
  }

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, webhookEventId));
  return { applied };
}

async function findSubscription(object: Record<string, unknown>): Promise<Subscription | null> {
  const db = getDb();
  const stripeSubscriptionId =
    typeof object.subscription === "string"
      ? object.subscription
      : typeof object.id === "string" && String(object.id).startsWith("sub_")
        ? String(object.id)
        : null;
  const metadataRef = (() => {
    const metadata = object.metadata;
    if (metadata && typeof metadata === "object" && "subscriptionRef" in metadata) {
      const ref = (metadata as Record<string, unknown>).subscriptionRef;
      return typeof ref === "string" ? ref : null;
    }
    return null;
  })();

  if (metadataRef) {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, metadataRef));
    if (row) return row;
  }
  if (stripeSubscriptionId) {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    if (row) return row;
  }
  const customerId = typeof object.customer === "string" ? object.customer : null;
  if (customerId) {
    const [row] = await db
      .select({ subscription: subscriptions })
      .from(subscriptions)
      .innerJoin(families, eq(families.id, subscriptions.familyId))
      .where(eq(families.stripeCustomerId, customerId))
      .orderBy(desc(subscriptions.createdAt));
    if (row) return row.subscription;
  }
  return null;
}

async function onPaymentFailed(object: Record<string, unknown>): Promise<string> {
  const db = getDb();
  const sub = await findSubscription(object);
  if (!sub) return "no-matching-subscription";
  await db
    .update(subscriptions)
    .set({
      status: "past_due",
      // The anchor is set once — the whole dunning ladder hangs off it.
      pastDueSince: sub.pastDueSince ?? new Date(),
      failedPayments: sub.failedPayments + 1,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));
  const [family] = await db.select().from(families).where(eq(families.id, sub.familyId));
  if (family) {
    await audit({
      schoolId: family.schoolId,
      action: "billing.payment_failed",
      target: sub.id,
      metadata: { familyId: family.id, failures: sub.failedPayments + 1 },
    });
  }
  return "past_due";
}

async function onPaymentSucceeded(object: Record<string, unknown>): Promise<string> {
  const db = getDb();
  const sub = await findSubscription(object);
  if (!sub) return "no-matching-subscription";
  const periodEnd = typeof object.period_end === "number" ? new Date(object.period_end * 1000) : null;
  await db
    .update(subscriptions)
    .set({
      status: "active",
      pastDueSince: null,
      failedPayments: 0,
      lastDunningOn: null,
      escalatedAt: null,
      currentPeriodEnd: periodEnd ?? sub.currentPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));
  return "active";
}

async function onSubscriptionChanged(
  type: string,
  object: Record<string, unknown>,
): Promise<string> {
  const db = getDb();
  const sub = await findSubscription(object);
  if (!sub) return "no-matching-subscription";
  const stripeStatus = typeof object.status === "string" ? object.status : "";
  const status =
    type === "customer.subscription.deleted" || stripeStatus === "canceled"
      ? "canceled"
      : stripeStatus === "past_due" || stripeStatus === "unpaid"
        ? "past_due"
        : stripeStatus === "paused"
          ? "paused"
          : "active";
  await db
    .update(subscriptions)
    .set({
      status,
      pastDueSince: status === "past_due" ? (sub.pastDueSince ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));
  return status;
}

async function onCheckoutCompleted(object: Record<string, unknown>): Promise<string> {
  const db = getDb();
  // Platform checkout: MatPass's own plan.
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const schoolId = typeof metadata.schoolId === "string" ? metadata.schoolId : null;
  if (schoolId) {
    const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
    if (school) {
      await db
        .update(schools)
        .set({
          billingStatus: "active",
          stripeCustomerId: typeof object.customer === "string" ? object.customer : school.stripeCustomerId,
          stripeSubscriptionId:
            typeof object.subscription === "string" ? object.subscription : school.stripeSubscriptionId,
          updatedAt: new Date(),
        })
        .where(eq(schools.id, schoolId));
      await audit({ schoolId, action: "billing.matpass_active", target: schoolId });
      return "matpass-active";
    }
  }

  const sub = await findSubscription(object);
  if (!sub) return "no-matching-subscription";
  await db
    .update(subscriptions)
    .set({
      stripeSubscriptionId:
        typeof object.subscription === "string" ? object.subscription : sub.stripeSubscriptionId,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));
  return "tuition-active";
}

// -------------------------------------------------- MatPass's own billing

export async function startPlanCheckout(input: {
  schoolId: string;
  tier: PlanTier;
  email: string;
  actorId: string;
}): Promise<{ url: string; simulated: boolean }> {
  const db = getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, input.schoolId));
  if (!school) throw new Error("School not found");

  const priceId = env.stripePrices[input.tier];
  const gw = await gateway();
  const session = await gw.platformCheckout({
    schoolId: school.id,
    priceId,
    customerId: school.stripeCustomerId,
    email: input.email,
    successUrl: `${env.appUrl}/settings/plan?checkout=done`,
    cancelUrl: `${env.appUrl}/settings/plan?checkout=cancelled`,
  });

  await db
    .update(schools)
    .set({ plan: input.tier, stripeCustomerId: session.customerId, updatedAt: new Date() })
    .where(eq(schools.id, school.id));

  await audit({
    schoolId: school.id,
    actorId: input.actorId,
    action: "billing.plan_checkout_started",
    target: input.tier,
    metadata: { simulated: session.simulated },
  });
  return { url: session.url, simulated: session.simulated };
}

export async function planPortal(input: {
  schoolId: string;
}): Promise<{ url: string; simulated: boolean }> {
  const db = getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, input.schoolId));
  if (!school?.stripeCustomerId) throw new Error("No billing account yet — start a plan first");
  const gw = await gateway();
  return gw.platformPortal({
    customerId: school.stripeCustomerId,
    returnUrl: `${env.appUrl}/settings/plan`,
  });
}

/** Plan copy for the settings screen. */
export function planSummary(tier: PlanTier): string {
  const plan = PLANS[tier];
  return `${plan.name} — ${formatMoney(plan.priceCents)}/mo, up to ${plan.studentLimit} students`;
}
