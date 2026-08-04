/**
 * src/db/seed.ts — `npm run db:seed`
 *
 * A plausible chair, so every screen has real content to show: a barber renting chair 3 at a
 * five-chair shop, five clients with actual rhythms, a month of history including one no-show
 * that collected its fee and one that was waived, an appointment sitting unmarked from
 * yesterday, and a rent ledger with a late week in it.
 *
 * Idempotent by handle: running it twice replaces the demo tenant rather than doubling it.
 * It refuses to touch anything else in the database.
 */

import "@/lib/load-env";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  appointments,
  auditLog,
  cadences,
  chairs,
  charges,
  clients,
  messages,
  nudges,
  policies,
  rentPeriods,
  services,
  shops,
  stylists,
  users,
  waitlistEntries,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { type WorkingHours } from "@/lib/availability";
import { DEFAULT_SETTINGS, computeCadence } from "@/lib/cadence";
import { addDaysToDay, mondayOfWeek, todayInTimezone, zonedTimeToUtc } from "@/lib/dates";
import { POLICY_TEMPLATES, computeFee, defaultPolicyText } from "@/lib/policy";
import { mintToken } from "@/lib/tokens";

const HANDLE = "deecuts";

/**
 * The seeded barber's week: closed Sunday, on the chair Monday to Saturday. Deliberately not
 * the app's default (which is closed Sunday and Monday), so the demo has a live day and a
 * live day-strip whatever day of the week it is loaded on.
 */
const SEED_WEEK: WorkingHours = {
  "0": { open: "10:00", close: "16:00", off: true },
  "1": { open: "10:00", close: "19:00", off: false },
  "2": { open: "10:00", close: "19:00", off: false },
  "3": { open: "10:00", close: "19:00", off: false },
  "4": { open: "10:00", close: "20:00", off: false },
  "5": { open: "09:00", close: "19:00", off: false },
  "6": { open: "09:00", close: "16:00", off: false },
};
const TZ = "America/New_York";
const STYLIST_EMAIL = "dee@foundrybarber.example";
const OWNER_EMAIL = "ray@foundrybarber.example";
/** Dev fixture only. The real app never stores or ships a password. */
const DEMO_PASSWORD = "chairflow-demo";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in");
  }
  const db = getDb();
  const now = new Date();
  const today = todayInTimezone(TZ, now);
  /**
   * How far back a money event may be placed and still land in the current month. The ledger
   * is month-scoped, so seeding a fee "19 days ago" on the 3rd would leave the hero stat at
   * zero and the demo looking broken.
   */
  const daysIntoMonth = Number(today.slice(8, 10)) - 1;
  const thisMonth = (want: number): number => Math.min(want, daysIntoMonth);

  /* --- wipe just the demo tenant ---------------------------------- */
  const [existing] = await db.select().from(stylists).where(eq(stylists.handle, HANDLE));
  if (existing) {
    const apptIds = (
      await db.select({ id: appointments.id }).from(appointments).where(eq(appointments.stylistId, existing.id))
    ).map((r) => r.id);
    if (apptIds.length > 0) {
      await db.delete(charges).where(inArray(charges.appointmentId, apptIds));
    }
    await db.delete(messages).where(eq(messages.stylistId, existing.id));
    await db.delete(nudges).where(eq(nudges.stylistId, existing.id));
    await db.delete(waitlistEntries).where(eq(waitlistEntries.stylistId, existing.id));
    await db.delete(cadences).where(eq(cadences.stylistId, existing.id));
    await db.delete(rentPeriods).where(eq(rentPeriods.stylistId, existing.id));
    await db.delete(appointments).where(eq(appointments.stylistId, existing.id));
    await db.delete(clients).where(eq(clients.stylistId, existing.id));
    await db.delete(services).where(eq(services.stylistId, existing.id));
    await db.delete(policies).where(eq(policies.stylistId, existing.id));
    await db.delete(auditLog).where(eq(auditLog.stylistId, existing.id));
    await db.update(chairs).set({ stylistId: null, status: "vacant" }).where(eq(chairs.stylistId, existing.id));
    await db.delete(stylists).where(eq(stylists.id, existing.id));
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const stylistUser = await upsertUser(STYLIST_EMAIL, "Dee Nakamura", passwordHash);
  const ownerUser = await upsertUser(OWNER_EMAIL, "Ray Okonjo", passwordHash);

  /* --- the shop and its chairs ------------------------------------ */
  let [shop] = await db.select().from(shops).where(eq(shops.slug, "foundry"));
  if (!shop) {
    [shop] = await db
      .insert(shops)
      .values({
        ownerUserId: ownerUser.id,
        name: "Foundry Barber Co",
        slug: "foundry",
        address: "118 Mill St, Providence RI",
        timezone: TZ,
        trialEndsAt: new Date(now.getTime() + 14 * 86_400_000),
      })
      .returning();
  }

  /* --- the stylist ------------------------------------------------ */
  const [stylist] = await db
    .insert(stylists)
    .values({
      userId: stylistUser.id,
      handle: HANDLE,
      displayName: "Dee Nakamura",
      trade: "barber",
      chairLocation: "Foundry Barber Co, 118 Mill St, Providence RI",
      bio: "Fades, beard work and hot towels. Twelve years behind the chair.",
      timezone: TZ,
      plan: "book",
      trialEndsAt: new Date(now.getTime() + 11 * 86_400_000),
      // Deposits and fees are exercisable: the recorded gateway stands in for Stripe.
      stripeAccountId: "acct_sim_seeded",
      connectStatus: "active",
      shopId: shop.id,
      workingHours: SEED_WEEK,
      settings: { ...DEFAULT_SETTINGS },
    })
    .returning();

  const template = POLICY_TEMPLATES[0];
  const [policy] = await db
    .insert(policies)
    .values({
      stylistId: stylist.id,
      version: 1,
      cancelWindowHours: template.cancelWindowHours,
      lateCancelFeePercent: template.lateCancelFeePercent,
      noShowFeePercent: template.noShowFeePercent,
      policyText: defaultPolicyText(template),
    })
    .returning();

  /* --- services --------------------------------------------------- */
  const [fade, beard, both] = await db
    .insert(services)
    .values([
      {
        stylistId: stylist.id,
        name: "Skin fade",
        durationMinutes: 45,
        priceCents: 4500,
        depositRule: { kind: "flat", cents: 1000 },
      },
      {
        stylistId: stylist.id,
        name: "Beard trim",
        durationMinutes: 20,
        priceCents: 2200,
        depositRule: { kind: "none" },
      },
      {
        stylistId: stylist.id,
        name: "Cut and beard",
        durationMinutes: 60,
        priceCents: 6200,
        depositRule: { kind: "percent", percent: 25 },
      },
    ])
    .returning();

  /* --- clients ---------------------------------------------------- */
  const clientRows = await db
    .insert(clients)
    .values([
      {
        stylistId: stylist.id,
        firstName: "Marcus",
        lastName: "Ollet",
        phone: "+15125550147",
        email: "marcus@example.com",
        smsConsent: true,
        stripeCustomerId: "cus_sim_marcus",
        defaultPaymentMethodId: "pm_sim_marcus",
        cardLast4: "4242",
        notes: "Number two on the sides, blends high. Always takes the 6pm.",
        noShowCount: 1,
      },
      {
        stylistId: stylist.id,
        firstName: "Priya",
        lastName: "Raman",
        phone: "+15125550182",
        email: "priya@example.com",
        smsConsent: true,
        stripeCustomerId: "cus_sim_priya",
        defaultPaymentMethodId: "pm_sim_priya",
        cardLast4: "1881",
      },
      {
        stylistId: stylist.id,
        firstName: "Tomas",
        lastName: "Beck",
        phone: "+15125550190",
        email: null,
        smsConsent: true,
        stripeCustomerId: "cus_sim_tomas",
        // Stripe's always-declines number, so the failure path is reachable in the demo.
        defaultPaymentMethodId: "pm_decline_sim_tomas",
        cardLast4: "0002",
      },
      {
        stylistId: stylist.id,
        firstName: "Alina",
        lastName: "Sokol",
        phone: "+15125550166",
        email: "alina@example.com",
        smsConsent: false,
        notes: "Prefers email. Books colour elsewhere, comes here for the beard.",
      },
      {
        stylistId: stylist.id,
        firstName: "Dev",
        lastName: "Aggarwal",
        phone: "+15125550101",
        email: "dev@example.com",
        smsConsent: true,
        smsOptedOutAt: new Date(now.getTime() - 30 * 86_400_000),
      },
    ])
    .returning();
  const [marcus, priya, tomas, alina, dev] = clientRows;
  // A client who replied STOP has consent off as well as the timestamp.
  await db.update(clients).set({ smsConsent: false }).where(eq(clients.id, dev.id));

  /* --- history: enough completed visits to have real rhythms ------- */
  const history: Array<{ clientId: string; serviceId: string; daysAgo: number; hour: number; minute: number }> = [
    // Marcus: every three weeks, on the fade.
    { clientId: marcus.id, serviceId: fade.id, daysAgo: 63, hour: 18, minute: 0 },
    { clientId: marcus.id, serviceId: fade.id, daysAgo: 42, hour: 18, minute: 0 },
    { clientId: marcus.id, serviceId: fade.id, daysAgo: 21, hour: 18, minute: 0 },
    // Priya: every four weeks, cut and beard.
    { clientId: priya.id, serviceId: both.id, daysAgo: 56, hour: 11, minute: 0 },
    { clientId: priya.id, serviceId: both.id, daysAgo: 28, hour: 11, minute: 0 },
    // Tomas: every two weeks on the beard, and he has drifted.
    { clientId: tomas.id, serviceId: beard.id, daysAgo: 60, hour: 13, minute: 0 },
    { clientId: tomas.id, serviceId: beard.id, daysAgo: 46, hour: 13, minute: 0 },
    { clientId: tomas.id, serviceId: beard.id, daysAgo: 32, hour: 13, minute: 30 },
    // Alina: six-weekly beard trim.
    { clientId: alina.id, serviceId: beard.id, daysAgo: 84, hour: 15, minute: 0 },
    { clientId: alina.id, serviceId: beard.id, daysAgo: 42, hour: 15, minute: 0 },
  ];

  const serviceById = new Map([fade, beard, both].map((s) => [s.id, s]));
  for (const visit of history) {
    const service = serviceById.get(visit.serviceId);
    if (!service) continue;
    const day = addDaysToDay(today, -visit.daysAgo);
    const startsAt = atLocal(day, visit.hour, visit.minute);
    await insertAppointment({
      stylistId: stylist.id,
      clientId: visit.clientId,
      service,
      startsAt,
      status: "completed",
      policyVersion: policy.version,
      markedAt: new Date(startsAt.getTime() + 60 * 60_000),
      markedBy: `user:${stylistUser.id}`,
    });
  }

  /* --- a no-show that collected its fee, three weeks ago ---------- */
  const noShowDay = addDaysToDay(today, -thisMonth(9));
  const noShowAppt = await insertAppointment({
    stylistId: stylist.id,
    clientId: marcus.id,
    service: fade,
    startsAt: atLocal(noShowDay, 18, 0),
    status: "no_show",
    policyVersion: policy.version,
    depositCents: 1000,
    // No `depositPaymentIntentId` here: the captured deposit row for this one is written
    // explicitly below, with the status it ended up in.
    markedAt: atLocal(noShowDay, 19, 15),
    markedBy: `user:${stylistUser.id}`,
  });
  const noShowFee = computeFee({
    priceCents: fade.priceCents,
    depositCents: 1000,
    terms: {
      version: policy.version,
      cancelWindowHours: policy.cancelWindowHours,
      lateCancelFeePercent: policy.lateCancelFeePercent,
      noShowFeePercent: policy.noShowFeePercent,
    },
    kind: "no_show_fee",
  });
  // The deposit row already exists from the appointment; the no-show is what turns it from
  // service money into protection.
  await db
    .update(charges)
    .set({ status: "captured", occurredAt: atLocal(noShowDay, 19, 15) })
    .where(and(eq(charges.appointmentId, noShowAppt.id), eq(charges.kind, "deposit")));
  await db.insert(charges).values({
    appointmentId: noShowAppt.id,
    kind: "no_show_fee",
    amountCents: noShowFee.chargeCents,
    depositAppliedCents: noShowFee.depositAppliedCents,
    status: "charged",
    policyVersion: policy.version,
    stripePaymentIntentId: "pi_sim_seed_fee_1",
    occurredAt: atLocal(noShowDay, 19, 15),
    simulated: true,
  });

  /* --- a late cancellation that was waived, ten days ago ---------- */
  const waivedDay = addDaysToDay(today, -thisMonth(6));
  const waivedAppt = await insertAppointment({
    stylistId: stylist.id,
    clientId: priya.id,
    service: both,
    startsAt: atLocal(waivedDay, 11, 0),
    status: "late_cancelled",
    policyVersion: policy.version,
    markedAt: atLocal(waivedDay, 8, 30),
    markedBy: "client_token",
  });
  const waivedFee = computeFee({
    priceCents: both.priceCents,
    depositCents: 0,
    terms: {
      version: policy.version,
      cancelWindowHours: policy.cancelWindowHours,
      lateCancelFeePercent: policy.lateCancelFeePercent,
      noShowFeePercent: policy.noShowFeePercent,
    },
    kind: "late_cancel_fee",
  });
  await db.insert(charges).values({
    appointmentId: waivedAppt.id,
    kind: "late_cancel_fee",
    amountCents: waivedFee.chargeCents,
    status: "waived",
    policyVersion: policy.version,
    waivedBy: stylistUser.id,
    occurredAt: atLocal(waivedDay, 8, 35),
  });

  /* --- a deposit kept on a cancellation inside the window --------- */
  const keptDay = addDaysToDay(today, -thisMonth(3));
  const keptAppt = await insertAppointment({
    stylistId: stylist.id,
    clientId: alina.id,
    service: beard,
    startsAt: atLocal(keptDay, 15, 0),
    status: "no_show",
    policyVersion: policy.version,
    markedAt: atLocal(keptDay, 15, 45),
    markedBy: `user:${stylistUser.id}`,
  });
  const beardFee = computeFee({
    priceCents: beard.priceCents,
    depositCents: 0,
    terms: {
      version: policy.version,
      cancelWindowHours: policy.cancelWindowHours,
      lateCancelFeePercent: policy.lateCancelFeePercent,
      noShowFeePercent: policy.noShowFeePercent,
    },
    kind: "no_show_fee",
  });
  await db.insert(charges).values({
    appointmentId: keptAppt.id,
    kind: "no_show_fee",
    amountCents: beardFee.chargeCents,
    status: "failed",
    policyVersion: policy.version,
    failureReason: "The card was declined. (card_declined)",
    occurredAt: atLocal(keptDay, 15, 45),
    simulated: true,
  });

  /* --- today, so the day strip has a day in it -------------------- */
  await insertAppointment({
    stylistId: stylist.id,
    clientId: priya.id,
    service: beard,
    startsAt: atLocal(today, 10, 30),
    status: "completed",
    policyVersion: policy.version,
    markedAt: atLocal(today, 11, 0),
    markedBy: `user:${stylistUser.id}`,
  });
  await insertAppointment({
    stylistId: stylist.id,
    clientId: alina.id,
    service: beard,
    startsAt: atLocal(today, 12, 0),
    status: "completed",
    policyVersion: policy.version,
    markedAt: atLocal(today, 12, 30),
    markedBy: `user:${stylistUser.id}`,
  });
  // Marcus, with a deposit already held and a card that works: the fee sheet on this one
  // shows the full deposit-first arithmetic rather than a bare percentage.
  await insertAppointment({
    stylistId: stylist.id,
    clientId: marcus.id,
    service: fade,
    startsAt: atLocal(today, 16, 30),
    status: "booked",
    policyVersion: policy.version,
    depositCents: 1000,
    depositPaymentIntentId: "pi_sim_seed_deposit_4",
  });

  /* --- yesterday, unmarked: the resolve card at the top of Today --- */
  await insertAppointment({
    stylistId: stylist.id,
    clientId: tomas.id,
    service: beard,
    startsAt: atLocal(addDaysToDay(today, -1), 13, 0),
    status: "booked",
    policyVersion: policy.version,
  });

  /* --- upcoming ---------------------------------------------------- */
  await insertAppointment({
    stylistId: stylist.id,
    clientId: marcus.id,
    service: fade,
    startsAt: atLocal(nextOpenDay(today, 1), 18, 0),
    status: "booked",
    policyVersion: policy.version,
    depositCents: 1000,
    depositPaymentIntentId: "pi_sim_seed_deposit_2",
  });
  await insertAppointment({
    stylistId: stylist.id,
    clientId: priya.id,
    service: both,
    startsAt: atLocal(nextOpenDay(today, 2), 11, 0),
    status: "booked",
    policyVersion: policy.version,
    depositCents: 1550,
    depositPaymentIntentId: "pi_sim_seed_deposit_3",
  });

  /* --- cadences, computed the way the nightly scan would ---------- */
  for (const service of [fade, beard, both]) {
    for (const client of clientRows) {
      const days = history
        .filter((h) => h.clientId === client.id && h.serviceId === service.id)
        .map((h) => addDaysToDay(today, -h.daysAgo))
        .sort();
      const computed = computeCadence(days);
      if (!computed) continue;
      await db.insert(cadences).values({
        stylistId: stylist.id,
        clientId: client.id,
        serviceId: service.id,
        medianIntervalDays: computed.medianIntervalDays,
        sampleCount: computed.sampleCount,
        lastVisitOn: computed.lastVisitOn,
        nextDueOn: computed.nextDueOn,
      });
    }
  }

  /* --- somebody on the waitlist ----------------------------------- */
  await db.insert(waitlistEntries).values({
    stylistId: stylist.id,
    clientId: dev.id,
    serviceId: fade.id,
    dayPreference: { weekdays: [4, 5], partOfDay: "evening" },
    status: "waiting",
  });

  /* --- chairs and the rent ledger --------------------------------- */
  await db.delete(rentPeriods).where(eq(rentPeriods.shopId, shop.id));
  await db.delete(chairs).where(eq(chairs.shopId, shop.id));
  const chairRows = await db
    .insert(chairs)
    .values([
      { shopId: shop.id, label: "Chair 1", weeklyRentCents: 25_000, status: "vacant" },
      { shopId: shop.id, label: "Chair 2", weeklyRentCents: 25_000, status: "vacant" },
      {
        shopId: shop.id,
        label: "Chair 3",
        weeklyRentCents: 27_500,
        stylistId: stylist.id,
        status: "occupied",
      },
      { shopId: shop.id, label: "Chair 4", weeklyRentCents: 25_000, status: "vacant" },
      { shopId: shop.id, label: "Chair 5", weeklyRentCents: 22_000, status: "vacant" },
    ])
    .returning();
  const deesChair = chairRows[2];

  const thisWeek = mondayOfWeek(today);
  const weeks = [-4, -3, -2, -1, 0].map((n) => addDaysToDay(thisWeek, n * 7));
  await db.insert(rentPeriods).values(
    weeks.map((week, i) => ({
      shopId: shop.id,
      chairId: deesChair.id,
      stylistId: stylist.id,
      weekStartOn: week,
      amountCents: deesChair.weeklyRentCents,
      // Paid up until the week before last, which leaves one genuinely late and one due.
      status: (i < weeks.length - 2 ? "paid" : "due") as "paid" | "due",
      paidAt: i < weeks.length - 2 ? new Date(Date.parse(`${week}T15:00:00.000Z`)) : null,
      paidVia: i < weeks.length - 2 ? ("manual" as const) : null,
    })),
  );

  await db.insert(auditLog).values({
    stylistId: stylist.id,
    shopId: shop.id,
    actor: "system",
    action: "seed.loaded",
    target: stylist.id,
    metadata: { clients: clientRows.length, services: 3 },
  });

  console.log(`Seeded @${HANDLE}`);
  console.log(`  stylist login: ${STYLIST_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  shop owner:    ${OWNER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  booking page:  /b/${HANDLE}`);
  await closeDb();

  /* --- helpers ---------------------------------------------------- */

  function atLocal(day: string, hour: number, minute: number): Date {
    const parts = day.split("-").map(Number);
    return zonedTimeToUtc(TZ, parts[0], parts[1], parts[2], hour, minute);
  }

  /** The nth day from today that is not marked off in the default week. */
  function nextOpenDay(from: string, nth: number): string {
    let found = 0;
    for (let i = 1; i <= 21; i++) {
      const day = addDaysToDay(from, i);
      const weekday = new Date(Date.parse(`${day}T00:00:00.000Z`)).getUTCDay();
      if (SEED_WEEK[String(weekday)].off) continue;
      found += 1;
      if (found === nth) return day;
    }
    return addDaysToDay(from, nth);
  }

  async function insertAppointment(input: {
    stylistId: string;
    clientId: string;
    service: typeof services.$inferSelect;
    startsAt: Date;
    status: "booked" | "completed" | "no_show" | "late_cancelled" | "cancelled";
    policyVersion: number;
    depositCents?: number;
    depositPaymentIntentId?: string | null;
    markedAt?: Date | null;
    markedBy?: string | null;
  }) {
    const { hash } = await mintToken("manage", crypto.randomUUID());
    const [row] = await db
      .insert(appointments)
      .values({
        stylistId: input.stylistId,
        clientId: input.clientId,
        serviceId: input.service.id,
        startsAt: input.startsAt,
        endsAt: new Date(input.startsAt.getTime() + input.service.durationMinutes * 60_000),
        priceCents: input.service.priceCents,
        status: input.status,
        policyVersion: input.policyVersion,
        policyAgreedAt: new Date(input.startsAt.getTime() - 6 * 86_400_000),
        depositCents: input.depositCents ?? 0,
        depositPaymentIntentId: input.depositPaymentIntentId ?? null,
        manageTokenHash: hash,
        source: "booking_page",
        markedAt: input.markedAt ?? null,
        markedBy: input.markedBy ?? null,
      })
      .returning();

    // A deposit that exists on the appointment but has no ledger row is a deposit the
    // protection ledger cannot see, and `captureFee` has nothing to flip to `captured`.
    if ((input.depositCents ?? 0) > 0) {
      await db.insert(charges).values({
        appointmentId: row.id,
        kind: "deposit",
        amountCents: input.depositCents ?? 0,
        status: "charged",
        policyVersion: input.policyVersion,
        stripePaymentIntentId: input.depositPaymentIntentId ?? null,
        occurredAt: input.startsAt,
        simulated: true,
      });
    }
    return row;
  }

  async function upsertUser(email: string, name: string, hash: string) {
    const [found] = await db.select().from(users).where(eq(users.email, email));
    if (found) {
      await db.update(users).set({ name, passwordHash: hash }).where(eq(users.id, found.id));
      return found;
    }
    const [created] = await db
      .insert(users)
      .values({ email, name, passwordHash: hash })
      .returning();
    return created;
  }
}

main().catch(async (err) => {
  console.error("seed failed:", err);
  await closeDb();
  process.exit(1);
});
