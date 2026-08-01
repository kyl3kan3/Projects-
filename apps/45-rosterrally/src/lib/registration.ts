/**
 * Season registration: the public parent flow, capacity and waitlists, the money
 * that follows, and the registrar's live view of all of it.
 *
 * The five-minute phone flow is a product requirement, so this module is written
 * to survive what a parent on a phone actually does: double-tap the submit
 * button, background the browser mid-payment, come back an hour later and try
 * again. Every write here is therefore idempotent or guarded by a unique index —
 * `registrations (division_id, player_id)` makes a resubmitted form a no-op
 * rather than a second charge, and `payments (stripe_payment_intent_id)` makes a
 * replayed webhook a no-op rather than a second credit.
 *
 * Two money rules from lib/ledger are enforced at the points they matter:
 * a payment cascades across the household's open registrations oldest-first, and
 * any credit a family already holds is applied the moment a new registration
 * appears. A family with money on account never shows a balance.
 */

import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  clubs,
  divisions,
  households,
  paymentAllocations,
  payments,
  paymentSchedules,
  players,
  registrations,
  seasons,
  type AppliedDiscount,
  type Club,
  type Division,
  type PaymentMethod,
  type Season,
  type ScholarshipCode,
} from "@/db/schema";
import { audit, SYSTEM, type Actor } from "@/lib/audit";
import { encryptContacts, encryptField } from "@/lib/crypto";
import { env } from "@/lib/env";
import {
  balanceCents,
  cascade,
  cascadeOrder,
  deriveState,
  householdMoney,
  refundPlan,
  seasonMoney,
  type LedgerRegistration,
  type PaymentState,
} from "@/lib/ledger";
import { mintHouseholdToken, householdUrl } from "@/lib/links";
import { splitCents } from "@/lib/money";
import { getGateway } from "@/lib/payments";
import { buildInstallmentPlan, findScholarshipCode, quoteCart, type CartQuote } from "@/lib/pricing";
import { addMonthsIso, todayIso, type IsoDate } from "@/lib/time";

/* --------------------------------------------------------- the public view --- */

export interface DivisionAvailability extends Division {
  activeCount: number;
  waitlistCount: number;
  spotsLeft: number;
  full: boolean;
}

export interface PublicSeason {
  season: Season;
  club: Club;
  divisions: DivisionAvailability[];
  open: boolean;
  /** Why registration is closed, in words a parent can act on. */
  closedReason: string | null;
}

export async function getPublicSeason(
  slug: string,
  asOf: IsoDate = todayIso(),
): Promise<PublicSeason | null> {
  const db = getDb();
  const [row] = await db
    .select({ season: seasons, club: clubs })
    .from(seasons)
    .innerJoin(clubs, eq(clubs.id, seasons.clubId))
    .where(eq(seasons.slug, slug));
  if (!row) return null;

  const divs = await divisionAvailability(row.season.id);

  let closedReason: string | null = null;
  if (row.season.status === "draft") {
    closedReason = "Registration for this season has not opened yet.";
  } else if (row.season.status === "archived" || row.season.status === "closed") {
    closedReason = "Registration for this season is closed.";
  } else if (asOf < row.season.registrationOpensOn) {
    closedReason = `Registration opens ${row.season.registrationOpensOn}.`;
  } else if (asOf > row.season.registrationClosesOn) {
    closedReason = `Registration closed ${row.season.registrationClosesOn}.`;
  }

  return {
    season: row.season,
    club: row.club,
    divisions: divs,
    open: closedReason === null,
    closedReason,
  };
}

export async function divisionAvailability(seasonId: string): Promise<DivisionAvailability[]> {
  const db = getDb();
  const divs = await db
    .select()
    .from(divisions)
    .where(eq(divisions.seasonId, seasonId))
    .orderBy(asc(divisions.sortOrder), asc(divisions.name));
  if (divs.length === 0) return [];

  const counts = await db
    .select({
      divisionId: registrations.divisionId,
      status: registrations.status,
      n: count(),
    })
    .from(registrations)
    .where(
      and(
        eq(registrations.seasonId, seasonId),
        inArray(
          registrations.divisionId,
          divs.map((d) => d.id),
        ),
      ),
    )
    .groupBy(registrations.divisionId, registrations.status);

  return divs.map((d) => {
    const active = Number(
      counts.find((c) => c.divisionId === d.id && c.status === "active")?.n ?? 0,
    );
    const waiting = Number(
      counts.find((c) => c.divisionId === d.id && c.status === "waitlisted")?.n ?? 0,
    );
    const spotsLeft = Math.max(0, d.capacity - active);
    return {
      ...d,
      activeCount: active,
      waitlistCount: waiting,
      spotsLeft,
      full: spotsLeft === 0,
    };
  });
}

/* ------------------------------------------------------------- registering --- */

const childSchema = z.object({
  firstName: z.string().trim().min(1, "Enter the child's first name"),
  lastName: z.string().trim().min(1, "Enter the child's last name"),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the birthdate as YYYY-MM-DD"),
  divisionId: z.string().uuid("Choose a division"),
  medicalNotes: z.string().trim().max(2000).optional().default(""),
  emergencyName: z.string().trim().max(120).optional().default(""),
  emergencyPhone: z.string().trim().max(40).optional().default(""),
  emergencyRelationship: z.string().trim().max(60).optional().default(""),
  answers: z.record(z.string()).optional().default({}),
});

export const registerSchema = z.object({
  contactName: z.string().trim().min(1, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(40).optional().default(""),
  smsConsent: z.boolean().default(false),
  scholarshipCode: z.string().trim().max(40).optional().default(""),
  waiverAccepted: z.literal(true, {
    errorMap: () => ({ message: "The waiver must be acknowledged to register" }),
  }),
  payPlan: z.enum(["full", "installments"]).default("full"),
  children: z.array(childSchema).min(1, "Add at least one child"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export interface RegisterResult {
  householdId: string;
  householdToken: string;
  householdUrl: string;
  registrationIds: string[];
  quote: CartQuote;
  /** Null when nothing is owed (a full scholarship, or credit covered it). */
  checkoutUrl: string | null;
  waitlisted: { playerName: string; divisionName: string; position: number }[];
}

/**
 * Register one or more children in one pass.
 *
 * Ordering matters: children are placed (or waitlisted) before anything is
 * priced, because a waitlisted child changes the cart, and priced before any
 * money is asked for, because the fee summary a parent approves must be the fee
 * summary they are charged.
 */
export async function registerChildren(
  slug: string,
  input: RegisterInput,
  asOf: IsoDate = todayIso(),
): Promise<RegisterResult> {
  const parsed = registerSchema.parse(input);
  const db = getDb();

  const view = await getPublicSeason(slug, asOf);
  if (!view) throw new Error("That registration link is not valid");
  if (!view.open) throw new Error(view.closedReason ?? "Registration is closed");
  const { season, club } = view;

  const codeResult = findScholarshipCode(
    season.settings.scholarshipCodes ?? [],
    parsed.scholarshipCode,
  );
  if (codeResult.error) throw new Error(codeResult.error);
  const scholarship: ScholarshipCode | null = codeResult.code;

  // --- household: match on email within the club, never across clubs --------
  const [existingHousehold] = await db
    .select()
    .from(households)
    .where(and(eq(households.clubId, club.id), eq(households.email, parsed.email)));

  const household =
    existingHousehold ??
    (
      await db
        .insert(households)
        .values({
          clubId: club.id,
          contactName: parsed.contactName,
          email: parsed.email,
          phone: parsed.phone || null,
          smsConsent: parsed.smsConsent,
          smsConsentAt: parsed.smsConsent ? new Date() : null,
        })
        .returning()
    )[0];

  if (existingHousehold) {
    // Keep the contact details current, and treat consent as a one-way switch a
    // parent controls: ticking it now grants it, and a later form that leaves it
    // unticked does not silently revoke a consent they gave deliberately.
    await db
      .update(households)
      .set({
        contactName: parsed.contactName,
        phone: parsed.phone || existingHousehold.phone,
        smsConsent: parsed.smsConsent || existingHousehold.smsConsent,
        smsConsentAt:
          parsed.smsConsent && !existingHousehold.smsConsent
            ? new Date()
            : existingHousehold.smsConsentAt,
      })
      .where(eq(households.id, existingHousehold.id));
  }

  // --- players: match a child already on file, or add them ------------------
  const divisionsById = new Map(view.divisions.map((d) => [d.id, d]));
  const existingPlayers = await db
    .select()
    .from(players)
    .where(eq(players.householdId, household.id));

  interface Placed {
    ref: string;
    playerId: string;
    playerName: string;
    division: DivisionAvailability;
    waitlisted: boolean;
    answers: Record<string, string>;
  }
  const placed: Placed[] = [];
  // Track placements made in this same request so two children into one nearly
  // full division cannot both take the last spot.
  const takenThisRequest = new Map<string, number>();

  for (const [index, child] of parsed.children.entries()) {
    const division = divisionsById.get(child.divisionId);
    if (!division) throw new Error("Choose a division for every child");

    const match = existingPlayers.find(
      (p) =>
        p.firstName.toLowerCase() === child.firstName.toLowerCase() &&
        p.lastName.toLowerCase() === child.lastName.toLowerCase() &&
        p.birthdate === child.birthdate,
    );

    let playerId: string;
    if (match) {
      playerId = match.id;
      // Only overwrite the sensitive fields when the parent supplied new text.
      const patch: Record<string, string | null> = {};
      if (child.medicalNotes) patch.medicalNotesEnc = encryptField(child.medicalNotes);
      if (child.emergencyName && child.emergencyPhone) {
        patch.emergencyContactsEnc = encryptContacts([
          {
            name: child.emergencyName,
            phone: child.emergencyPhone,
            relationship: child.emergencyRelationship || "Guardian",
          },
        ]);
      }
      if (Object.keys(patch).length > 0) {
        await db.update(players).set(patch).where(eq(players.id, playerId));
      }
    } else {
      const [created] = await db
        .insert(players)
        .values({
          householdId: household.id,
          firstName: child.firstName,
          lastName: child.lastName,
          birthdate: child.birthdate,
          medicalNotesEnc: encryptField(child.medicalNotes),
          emergencyContactsEnc:
            child.emergencyName && child.emergencyPhone
              ? encryptContacts([
                  {
                    name: child.emergencyName,
                    phone: child.emergencyPhone,
                    relationship: child.emergencyRelationship || "Guardian",
                  },
                ])
              : null,
        })
        .returning();
      playerId = created.id;
      existingPlayers.push(created);
    }

    const alreadyTaken = takenThisRequest.get(division.id) ?? 0;
    const spotsLeft = division.spotsLeft - alreadyTaken;
    const waitlisted = spotsLeft <= 0;
    if (waitlisted && !division.waitlistEnabled) {
      throw new Error(
        `${division.name} is full and the club has not opened a waitlist for it. Contact the registrar.`,
      );
    }
    if (!waitlisted) takenThisRequest.set(division.id, alreadyTaken + 1);

    placed.push({
      ref: `c${index}`,
      playerId,
      playerName: `${child.firstName} ${child.lastName}`,
      division,
      waitlisted,
      answers: child.answers ?? {},
    });
  }

  // --- price the cart -------------------------------------------------------
  const quote = quoteCart(
    placed.map((p) => ({
      ref: p.ref,
      divisionId: p.division.id,
      divisionName: p.division.name,
      playerName: p.playerName,
      feeCents: p.division.feeCents,
      earlyBird: p.division.earlyBird ?? null,
      waitlisted: p.waitlisted,
    })),
    season.settings,
    {
      scholarship,
      asOf,
      plan: club.plan,
      applicationFeeCents: env.applicationFeeCents,
    },
  );

  // --- write the registrations ---------------------------------------------
  const waiverText = season.settings.waiverText;
  const registrationIds: string[] = [];
  const waitlisted: RegisterResult["waitlisted"] = [];

  for (const p of placed) {
    const line = quote.lines.find((l) => l.ref === p.ref)!;
    let position: number | null = null;
    if (p.waitlisted) {
      const [{ maxPos }] = await db
        .select({ maxPos: sql<number>`coalesce(max(${registrations.waitlistPosition}), 0)::int` })
        .from(registrations)
        .where(
          and(eq(registrations.divisionId, p.division.id), eq(registrations.status, "waitlisted")),
        );
      position = Number(maxPos) + 1;
    }

    const values = {
      clubId: club.id,
      seasonId: season.id,
      divisionId: p.division.id,
      playerId: p.playerId,
      householdId: household.id,
      status: p.waitlisted ? ("waitlisted" as const) : ("active" as const),
      feeCents: line.feeCents,
      discounts: line.discounts as AppliedDiscount[],
      amountCents: line.amountCents,
      platformFeeCents: line.platformFeeCents,
      waiverText,
      waiverAckAt: new Date(),
      answers: p.answers,
      waitlistPosition: position,
    };

    // The unique index on (division_id, player_id) is what makes a double-tapped
    // submit safe: the second insert does nothing and we reuse the first row.
    const [inserted] = await db
      .insert(registrations)
      .values(values)
      .onConflictDoNothing({
        target: [registrations.divisionId, registrations.playerId],
      })
      .returning();

    const row =
      inserted ??
      (
        await db
          .select()
          .from(registrations)
          .where(
            and(
              eq(registrations.divisionId, p.division.id),
              eq(registrations.playerId, p.playerId),
            ),
          )
      )[0];

    registrationIds.push(row.id);
    if (row.status === "waitlisted") {
      waitlisted.push({
        playerName: p.playerName,
        divisionName: p.division.name,
        position: row.waitlistPosition ?? 1,
      });
    }
  }

  // Any credit the family is already holding lands on these registrations before
  // we ask them for a cent more.
  await applyAvailableCredit(household.id);

  const token = await mintHouseholdToken(household.id);

  // --- installments, if the family chose them and the club offers them ------
  const chargeableIds = registrationIds.filter((_, i) => !placed[i].waitlisted);
  const dueNow = await sumOpenBalances(registrationIds);

  if (
    parsed.payPlan === "installments" &&
    season.settings.installmentsEnabled &&
    dueNow > season.settings.depositCents &&
    chargeableIds.length > 0
  ) {
    await createInstallmentPlans(chargeableIds, season, asOf);
  }

  await audit(club.id, { kind: "household", id: household.id, name: parsed.contactName }, "registered", `season:${season.id}`, {
    registrationIds,
    amountCents: quote.totalCents,
    waitlisted: waitlisted.length,
  });

  const chargeNow = await chargeNowByRegistration(registrationIds);
  const depositDue = [...chargeNow.values()].reduce((s, v) => s + v, 0);

  let checkoutUrl: string | null = null;
  if (depositDue > 0) {
    const lineRows = await db
      .select({ reg: registrations, division: divisions, player: players })
      .from(registrations)
      .innerJoin(divisions, eq(divisions.id, registrations.divisionId))
      .innerJoin(players, eq(players.id, registrations.playerId))
      .where(inArray(registrations.id, chargeableIds));

    const checkout = await getGateway().createCheckout({
      clubId: club.id,
      clubName: club.name,
      householdId: household.id,
      householdEmail: parsed.email,
      lines: lineRows
        .map((l) => ({
          registrationId: l.reg.id,
          label:
            (chargeNow.get(l.reg.id) ?? 0) < l.reg.amountCents
              ? `${l.player.firstName} ${l.player.lastName} — ${l.division.name} (deposit)`
              : `${l.player.firstName} ${l.player.lastName} — ${l.division.name}`,
          amountCents: chargeNow.get(l.reg.id) ?? 0,
        }))
        .filter((l) => l.amountCents > 0),
      platformFeeCents: quote.platformFeeCents,
      absorbPlatformFee: season.settings.absorbPlatformFee,
      connectedAccountId: club.stripeAccountReady ? club.stripeAccountId : null,
      successUrl: `${env.appUrl}/register/${slug}/done?h=${encodeURIComponent(token)}`,
      cancelUrl: `${env.appUrl}/register/${slug}`,
    });
    checkoutUrl = checkout.url;
  }

  return {
    householdId: household.id,
    householdToken: token,
    householdUrl: householdUrl(token),
    registrationIds,
    quote,
    checkoutUrl,
    waitlisted,
  };
}

/* -------------------------------------------------------------- the money --- */

/** Settled allocation totals per registration. */
export async function allocatedByRegistration(
  registrationIds: readonly string[],
): Promise<Map<string, number>> {
  if (registrationIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      registrationId: paymentAllocations.registrationId,
      allocated: sql<number>`coalesce(sum(${paymentAllocations.amountCents}), 0)::int`,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(
      and(
        inArray(paymentAllocations.registrationId, [...registrationIds]),
        eq(payments.status, "settled"),
      ),
    )
    .groupBy(paymentAllocations.registrationId);
  return new Map(rows.map((r) => [r.registrationId, Number(r.allocated)]));
}

async function ledgerRows(registrationIds: readonly string[]): Promise<LedgerRegistration[]> {
  if (registrationIds.length === 0) return [];
  const db = getDb();
  const regs = await db
    .select({ reg: registrations, planId: paymentSchedules.id })
    .from(registrations)
    .leftJoin(paymentSchedules, eq(paymentSchedules.registrationId, registrations.id))
    .where(inArray(registrations.id, [...registrationIds]));
  const allocated = await allocatedByRegistration(regs.map((r) => r.reg.id));
  return regs.map((r) => ({
    id: r.reg.id,
    status: r.reg.status,
    amountCents: r.reg.amountCents,
    allocatedCents: allocated.get(r.reg.id) ?? 0,
    createdAt: r.reg.createdAt,
    onPlan: Boolean(r.planId),
  }));
}

async function sumOpenBalances(registrationIds: readonly string[]): Promise<number> {
  const rows = await ledgerRows(registrationIds);
  return rows.reduce((s, r) => s + balanceCents(r), 0);
}

/**
 * What each registration should be charged right now: its full open balance, or
 * just the deposit when the family is on an installment plan.
 */
async function chargeNowByRegistration(
  registrationIds: readonly string[],
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await ledgerRows(registrationIds);
  if (rows.length === 0) return new Map();
  const plans = await db
    .select()
    .from(paymentSchedules)
    .where(
      and(
        inArray(
          paymentSchedules.registrationId,
          rows.map((r) => r.id),
        ),
        isNull(paymentSchedules.canceledAt),
      ),
    );
  const out = new Map<string, number>();
  for (const row of rows) {
    const balance = balanceCents(row);
    if (balance <= 0) continue;
    const plan = plans.find((p) => p.registrationId === row.id);
    out.set(row.id, plan ? Math.min(balance, plan.depositCents) : balance);
  }
  return out;
}

async function createInstallmentPlans(
  registrationIds: readonly string[],
  season: Season,
  asOf: IsoDate,
): Promise<void> {
  const db = getDb();
  const rows = await ledgerRows(registrationIds);
  for (const row of rows) {
    const balance = balanceCents(row);
    const plan = buildInstallmentPlan(
      balance,
      season.settings.depositCents,
      Math.max(1, season.settings.installmentCount),
      asOf,
      addMonthsIso,
      splitCents,
    );
    if (!plan) continue;
    await db
      .insert(paymentSchedules)
      .values({
        registrationId: row.id,
        depositCents: plan.depositCents,
        installments: plan.installments,
      })
      .onConflictDoNothing({ target: paymentSchedules.registrationId });
  }
}

export interface SettleInput {
  clubId: string;
  householdId: string;
  amountCents: number;
  platformFeeCents: number;
  method: PaymentMethod;
  /** Stripe PaymentIntent id, or the test gateway's reference. Unique. */
  providerReference: string;
  receivedOn?: IsoDate;
  note?: string;
  recordedByUserId?: string | null;
}

export interface SettleResult {
  duplicate: boolean;
  paymentId: string | null;
  appliedCents: number;
  creditCents: number;
}

/**
 * Record money received and spread it across the household's open registrations,
 * oldest first.
 *
 * Called by the Stripe webhook, by the test gateway's confirm page, and by the
 * registrar recording a cheque — one settlement path, so there is one place for
 * this to be right. The unique index on the provider reference is the idempotency
 * gate: a replayed webhook inserts nothing and returns `duplicate: true`.
 */
export async function settlePayment(input: SettleInput): Promise<SettleResult> {
  const db = getDb();
  const receivedOn = input.receivedOn ?? todayIso();

  const [payment] = await db
    .insert(payments)
    .values({
      clubId: input.clubId,
      householdId: input.householdId,
      kind: "payment",
      method: input.method,
      status: "settled",
      amountCents: input.amountCents,
      stripePaymentIntentId: input.providerReference,
      platformFeeCents: input.platformFeeCents,
      note: input.note ?? null,
      receivedOn,
      recordedByUserId: input.recordedByUserId ?? null,
    })
    .onConflictDoNothing({ target: payments.stripePaymentIntentId })
    .returning();

  if (!payment) {
    return { duplicate: true, paymentId: null, appliedCents: 0, creditCents: 0 };
  }

  const open = await householdLedgerRows(input.householdId);
  const result = cascade(cascadeOrder(open), input.amountCents);
  if (result.allocations.length > 0) {
    await db.insert(paymentAllocations).values(
      result.allocations.map((a) => ({
        paymentId: payment.id,
        registrationId: a.registrationId,
        amountCents: a.amountCents,
      })),
    );
  }

  await audit(input.clubId, SYSTEM, "payment_settled", `household:${input.householdId}`, {
    amountCents: input.amountCents,
    appliedCents: result.appliedCents,
    creditCents: result.creditCents,
    reference: input.providerReference,
  });

  return {
    duplicate: false,
    paymentId: payment.id,
    appliedCents: result.appliedCents,
    creditCents: result.creditCents,
  };
}

async function householdLedgerRows(householdId: string): Promise<LedgerRegistration[]> {
  const ids = await getDb()
    .select({ id: registrations.id })
    .from(registrations)
    .where(eq(registrations.householdId, householdId));
  return ledgerRows(ids.map((r) => r.id));
}

/**
 * Apply money the family has already paid but that is not yet allocated to
 * anything. Runs after every new registration and after every promotion, so an
 * overpayment never sits as "credit" beside a registration that looks unpaid.
 */
export async function applyAvailableCredit(householdId: string): Promise<number> {
  const db = getDb();
  const money = await getHouseholdMoney(householdId);
  if (money.creditCents <= 0 || money.balanceCents <= 0) return 0;

  // Which payments still have room under them, oldest first.
  const paymentRows = await db
    .select({
      payment: payments,
      allocated: sql<number>`coalesce(sum(${paymentAllocations.amountCents}), 0)::int`,
    })
    .from(payments)
    .leftJoin(paymentAllocations, eq(paymentAllocations.paymentId, payments.id))
    .where(
      and(
        eq(payments.householdId, householdId),
        eq(payments.status, "settled"),
        eq(payments.kind, "payment"),
      ),
    )
    .groupBy(payments.id)
    .orderBy(asc(payments.receivedOn), asc(payments.createdAt));

  let budget = money.creditCents;
  const targets = cascadeOrder(await householdLedgerRows(householdId));
  let applied = 0;

  for (const row of paymentRows) {
    if (budget <= 0) break;
    const room = Math.min(budget, row.payment.amountCents - Number(row.allocated));
    if (room <= 0) continue;
    const result = cascade(targets, room);
    if (result.allocations.length === 0) break;
    await db.insert(paymentAllocations).values(
      result.allocations.map((a) => ({
        paymentId: row.payment.id,
        registrationId: a.registrationId,
        amountCents: a.amountCents,
      })),
    );
    // Reduce the remaining targets by what this payment just covered.
    for (const alloc of result.allocations) {
      const target = targets.find((t) => t.registrationId === alloc.registrationId);
      if (target) target.balanceCents -= alloc.amountCents;
    }
    for (let i = targets.length - 1; i >= 0; i--) {
      if (targets[i].balanceCents <= 0) targets.splice(i, 1);
    }
    budget -= result.appliedCents;
    applied += result.appliedCents;
  }

  if (applied > 0) {
    const [row] = await db.select().from(households).where(eq(households.id, householdId));
    if (row) {
      await audit(row.clubId, SYSTEM, "credit_applied", `household:${householdId}`, {
        amountCents: applied,
      });
    }
  }
  return applied;
}

export async function getHouseholdMoney(householdId: string) {
  const db = getDb();
  const regs = await householdLedgerRows(householdId);
  const paymentRows = await db
    .select({ kind: payments.kind, status: payments.status, amountCents: payments.amountCents })
    .from(payments)
    .where(eq(payments.householdId, householdId));
  const [{ allocatedNet }] = await db
    .select({
      allocatedNet: sql<number>`coalesce(sum(${paymentAllocations.amountCents}), 0)::int`,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(and(eq(payments.householdId, householdId), eq(payments.status, "settled")));
  return householdMoney(regs, paymentRows, Number(allocatedNet));
}

/* ------------------------------------------------------------- waitlists --- */

export interface PromotionResult {
  promoted: { registrationId: string; playerName: string; amountDueCents: number }[];
}

/**
 * Promote as many waitlisted children as there are free spots, in queue order.
 *
 * Promotion does not charge a card — the family agreed to a price weeks ago and
 * a silent charge on an old card is not something a volunteer club should do. It
 * makes the registration active and owed, applies any credit the family holds,
 * and returns what is due so the caller can tell them.
 */
export async function promoteFromWaitlist(
  divisionId: string,
  actor: Actor = SYSTEM,
): Promise<PromotionResult> {
  const db = getDb();
  const [division] = await db.select().from(divisions).where(eq(divisions.id, divisionId));
  if (!division) return { promoted: [] };

  const [{ active }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.divisionId, divisionId), eq(registrations.status, "active")));
  let spots = division.capacity - Number(active);
  if (spots <= 0) return { promoted: [] };

  const queue = await db
    .select({ reg: registrations, player: players })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.playerId))
    .where(and(eq(registrations.divisionId, divisionId), eq(registrations.status, "waitlisted")))
    .orderBy(asc(registrations.waitlistPosition), asc(registrations.createdAt));

  const promoted: PromotionResult["promoted"] = [];
  for (const row of queue) {
    if (spots <= 0) break;
    await db
      .update(registrations)
      .set({ status: "active", waitlistPosition: null })
      .where(and(eq(registrations.id, row.reg.id), eq(registrations.status, "waitlisted")));
    await applyAvailableCredit(row.reg.householdId);
    const [ledger] = await ledgerRows([row.reg.id]);
    promoted.push({
      registrationId: row.reg.id,
      playerName: `${row.player.firstName} ${row.player.lastName}`,
      amountDueCents: ledger ? balanceCents(ledger) : row.reg.amountCents,
    });
    await audit(row.reg.clubId, actor, "waitlist_promoted", `registration:${row.reg.id}`, {
      divisionId,
    });
    spots -= 1;
  }
  return promoted.length > 0 ? { promoted } : { promoted: [] };
}

/* --------------------------------------------------------------- refunds --- */

/**
 * Refund money on one registration, and cancel it when the refund clears the
 * whole thing. Reverses the newest allocation first, refunds through the gateway
 * on the club's own account, and writes a negative allocation so the refund is
 * part of the record instead of an erasure.
 */
export async function refundRegistration(
  registrationId: string,
  amountCents: number,
  actor: Actor,
  options: { cancel?: boolean; reason?: string } = {},
): Promise<{ refundedCents: number; canceled: boolean }> {
  const db = getDb();
  const [row] = await db
    .select({ reg: registrations, club: clubs })
    .from(registrations)
    .innerJoin(clubs, eq(clubs.id, registrations.clubId))
    .where(eq(registrations.id, registrationId));
  if (!row) throw new Error("No such registration");

  const [ledger] = await ledgerRows([registrationId]);
  const settled = ledger?.allocatedCents ?? 0;
  const requested = Math.min(Math.max(0, amountCents), settled);
  if (requested <= 0 && !options.cancel) {
    throw new Error("There is nothing settled on this registration to refund");
  }

  const allocations = await db
    .select({
      id: paymentAllocations.id,
      paymentId: paymentAllocations.paymentId,
      amountCents: paymentAllocations.amountCents,
      at: payments.createdAt,
      intent: payments.stripePaymentIntentId,
      fee: payments.platformFeeCents,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(
      and(
        eq(paymentAllocations.registrationId, registrationId),
        eq(payments.status, "settled"),
        eq(payments.kind, "payment"),
      ),
    );

  const plan = refundPlan(allocations, requested);
  let refunded = 0;
  const gateway = getGateway();

  for (const step of plan) {
    const source = allocations.find((a) => a.paymentId === step.paymentId)!;
    const result = await gateway.refund({
      connectedAccountId: row.club.stripeAccountReady ? row.club.stripeAccountId : null,
      paymentIntentId: source.intent,
      amountCents: step.amountCents,
      // Our fee comes back with the money: we do not keep $1.50 on a refund.
      platformFeeRefundCents: row.reg.platformFeeCents,
    });
    const [refundPayment] = await db
      .insert(payments)
      .values({
        clubId: row.reg.clubId,
        householdId: row.reg.householdId,
        kind: "refund",
        method: "card",
        status: "settled",
        amountCents: step.amountCents,
        stripeRefundId: result.refundId,
        platformFeeCents: 0,
        note: options.reason ?? null,
        receivedOn: todayIso(),
        recordedByUserId: actor.kind === "user" ? actor.id : null,
      })
      .onConflictDoNothing({ target: payments.stripeRefundId })
      .returning();
    if (!refundPayment) continue;
    await db.insert(paymentAllocations).values({
      paymentId: refundPayment.id,
      registrationId,
      amountCents: -step.amountCents,
    });
    refunded += step.amountCents;
  }

  const canceled = Boolean(options.cancel);
  if (canceled) {
    await db
      .update(registrations)
      .set({ status: "canceled", canceledAt: new Date(), waitlistPosition: null })
      .where(eq(registrations.id, registrationId));
  }

  await audit(row.reg.clubId, actor, canceled ? "registration_canceled" : "refund_issued", `registration:${registrationId}`, {
    amountCents: refunded,
    reason: options.reason ?? null,
  });

  // A canceled registration frees a spot, so the queue moves.
  if (canceled) await promoteFromWaitlist(row.reg.divisionId, SYSTEM);

  return { refundedCents: refunded, canceled };
}

/** Record a cheque, cash, or a transfer the registrar saw in the bank. */
export async function recordManualPayment(args: {
  clubId: string;
  householdId: string;
  amountCents: number;
  method: PaymentMethod;
  reference: string;
  actorUserId: string;
  actorName: string;
}): Promise<SettleResult> {
  const result = await settlePayment({
    clubId: args.clubId,
    householdId: args.householdId,
    amountCents: args.amountCents,
    platformFeeCents: 0,
    method: args.method,
    providerReference: `manual_${args.clubId}_${args.householdId}_${Date.now()}`,
    note: args.reference || undefined,
    recordedByUserId: args.actorUserId,
  });
  return result;
}

/* ------------------------------------------------------- registrar views --- */

export interface RegistrationRow {
  id: string;
  playerFirstName: string;
  playerLastName: string;
  birthdate: IsoDate;
  divisionId: string;
  divisionName: string;
  householdId: string;
  contactName: string;
  email: string;
  phone: string | null;
  smsConsent: boolean;
  status: RegistrationRowStatus;
  state: PaymentState;
  amountCents: number;
  allocatedCents: number;
  balanceCents: number;
  discounts: AppliedDiscount[];
  waitlistPosition: number | null;
  onPlan: boolean;
  createdAt: Date;
  rosteredTeamName: string | null;
}

type RegistrationRowStatus = "active" | "waitlisted" | "canceled";

export async function listRegistrations(
  seasonId: string,
  options: { divisionId?: string; state?: PaymentState | "all" } = {},
): Promise<RegistrationRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      reg: registrations,
      player: players,
      household: households,
      division: divisions,
      planId: paymentSchedules.id,
    })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.playerId))
    .innerJoin(households, eq(households.id, registrations.householdId))
    .innerJoin(divisions, eq(divisions.id, registrations.divisionId))
    .leftJoin(paymentSchedules, eq(paymentSchedules.registrationId, registrations.id))
    .where(
      options.divisionId
        ? and(eq(registrations.seasonId, seasonId), eq(registrations.divisionId, options.divisionId))
        : eq(registrations.seasonId, seasonId),
    )
    .orderBy(desc(registrations.createdAt));

  const allocated = await allocatedByRegistration(rows.map((r) => r.reg.id));

  const out = rows.map((r) => {
    const ledger: LedgerRegistration = {
      id: r.reg.id,
      status: r.reg.status,
      amountCents: r.reg.amountCents,
      allocatedCents: allocated.get(r.reg.id) ?? 0,
      createdAt: r.reg.createdAt,
      onPlan: Boolean(r.planId),
    };
    return {
      id: r.reg.id,
      playerFirstName: r.player.firstName,
      playerLastName: r.player.lastName,
      birthdate: r.player.birthdate,
      divisionId: r.division.id,
      divisionName: r.division.name,
      householdId: r.household.id,
      contactName: r.household.contactName,
      email: r.household.email,
      phone: r.household.phone,
      smsConsent: r.household.smsConsent,
      status: r.reg.status,
      state: deriveState(ledger),
      amountCents: r.reg.amountCents,
      allocatedCents: ledger.allocatedCents,
      balanceCents: balanceCents(ledger),
      discounts: r.reg.discounts,
      waitlistPosition: r.reg.waitlistPosition,
      onPlan: Boolean(r.planId),
      createdAt: r.reg.createdAt,
      rosteredTeamName: null as string | null,
    };
  });

  return options.state && options.state !== "all"
    ? out.filter((r) => r.state === options.state)
    : out;
}

export interface SeasonDashboard {
  season: Season;
  divisions: DivisionAvailability[];
  registeredCount: number;
  capacityTotal: number;
  waitlistTotal: number;
  money: ReturnType<typeof seasonMoney>;
  unpaidCount: number;
  partialCount: number;
}

export async function getSeasonDashboard(seasonId: string): Promise<SeasonDashboard | null> {
  const db = getDb();
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season) return null;
  const divs = await divisionAvailability(seasonId);

  const regs = await db
    .select({ reg: registrations, planId: paymentSchedules.id })
    .from(registrations)
    .leftJoin(paymentSchedules, eq(paymentSchedules.registrationId, registrations.id))
    .where(eq(registrations.seasonId, seasonId));
  const allocated = await allocatedByRegistration(regs.map((r) => r.reg.id));
  const ledger = regs.map((r) => ({
    id: r.reg.id,
    status: r.reg.status,
    amountCents: r.reg.amountCents,
    allocatedCents: allocated.get(r.reg.id) ?? 0,
    createdAt: r.reg.createdAt,
    onPlan: Boolean(r.planId),
    platformFeeCents: r.reg.platformFeeCents,
  }));

  const states = ledger.map(deriveState);
  return {
    season,
    divisions: divs,
    registeredCount: divs.reduce((s, d) => s + d.activeCount, 0),
    capacityTotal: divs.reduce((s, d) => s + d.capacity, 0),
    waitlistTotal: divs.reduce((s, d) => s + d.waitlistCount, 0),
    money: seasonMoney(ledger),
    unpaidCount: states.filter((s) => s === "unpaid").length,
    partialCount: states.filter((s) => s === "partial" || s === "plan").length,
  };
}

/** The detail a registrar sees on one registration, medical included by role. */
export async function getRegistrationDetail(registrationId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      reg: registrations,
      player: players,
      household: households,
      division: divisions,
      season: seasons,
      plan: paymentSchedules,
    })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.playerId))
    .innerJoin(households, eq(households.id, registrations.householdId))
    .innerJoin(divisions, eq(divisions.id, registrations.divisionId))
    .innerJoin(seasons, eq(seasons.id, registrations.seasonId))
    .leftJoin(paymentSchedules, eq(paymentSchedules.registrationId, registrations.id))
    .where(eq(registrations.id, registrationId));
  if (!row) return null;

  const history = await db
    .select({
      payment: payments,
      amountCents: paymentAllocations.amountCents,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(eq(paymentAllocations.registrationId, registrationId))
    .orderBy(desc(payments.createdAt));

  const allocated = (await allocatedByRegistration([registrationId])).get(registrationId) ?? 0;
  const ledger: LedgerRegistration = {
    id: row.reg.id,
    status: row.reg.status,
    amountCents: row.reg.amountCents,
    allocatedCents: allocated,
    createdAt: row.reg.createdAt,
    onPlan: Boolean(row.plan),
  };

  return {
    ...row,
    history,
    allocatedCents: allocated,
    balanceCents: balanceCents(ledger),
    state: deriveState(ledger),
    householdMoney: await getHouseholdMoney(row.household.id),
  };
}

/* ------------------------------------------------------------------ CSV --- */

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // Defuse anything a spreadsheet would treat as a formula.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The registrar's export. Medical notes are never included — this file gets
 * emailed to coaches and printed at a field, and a child's health information
 * does not belong in a spreadsheet that travels.
 */
export async function exportRegistrationsCsv(seasonId: string): Promise<string> {
  const rows = await listRegistrations(seasonId);
  const header = [
    "player_first_name",
    "player_last_name",
    "birthdate",
    "division",
    "status",
    "payment_state",
    "amount_due",
    "amount_paid",
    "balance",
    "discounts",
    "waitlist_position",
    "parent_name",
    "parent_email",
    "parent_phone",
    "sms_consent",
    "registered_at",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.playerFirstName),
        csvCell(r.playerLastName),
        csvCell(r.birthdate),
        csvCell(r.divisionName),
        csvCell(r.status),
        csvCell(r.state),
        csvCell((r.amountCents / 100).toFixed(2)),
        csvCell((r.allocatedCents / 100).toFixed(2)),
        csvCell((r.balanceCents / 100).toFixed(2)),
        csvCell(r.discounts.map((d) => `${d.label} ${(d.amountCents / 100).toFixed(2)}`).join("; ")),
        csvCell(r.waitlistPosition),
        csvCell(r.contactName),
        csvCell(r.email),
        csvCell(r.phone),
        csvCell(r.smsConsent ? "yes" : "no"),
        csvCell(r.createdAt.toISOString()),
      ].join(","),
    );
  }
  return lines.join("\n");
}

/* ---------------------------------------------------------- season setup --- */

export async function listSeasons(clubId: string): Promise<Season[]> {
  return getDb()
    .select()
    .from(seasons)
    .where(eq(seasons.clubId, clubId))
    .orderBy(desc(seasons.startsOn));
}

export async function getCurrentSeason(clubId: string): Promise<Season | null> {
  const all = await listSeasons(clubId);
  return all.find((s) => s.status === "open") ?? all[0] ?? null;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export const DEFAULT_SEASON_SETTINGS = {
  siblingDiscountBps: 1000,
  siblingDiscountFlatCents: 0,
  scholarshipCodes: [] as ScholarshipCode[],
  waiverText:
    "I confirm that my child is medically able to take part in this program. I understand that youth sport carries a risk of injury, and I release the club, its volunteers and its coaches from liability for injury sustained in the ordinary course of play. I agree to the club's code of conduct for players and spectators, and I confirm that the emergency contact information I have given is current.",
  customQuestions: [] as { key: string; prompt: string; required: boolean }[],
  absorbPlatformFee: false,
  installmentsEnabled: true,
  depositCents: 5000,
  installmentCount: 3,
};

export async function createSeason(
  clubId: string,
  input: {
    name: string;
    registrationOpensOn: IsoDate;
    registrationClosesOn: IsoDate;
    startsOn: IsoDate;
    endsOn: IsoDate;
  },
): Promise<Season> {
  const db = getDb();
  const base = slugify(input.name) || "season";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const [clash] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.slug, slug));
    if (!clash) break;
    slug = `${base}-${i}`;
  }
  const [season] = await db
    .insert(seasons)
    .values({
      clubId,
      name: input.name.trim(),
      slug,
      status: "draft",
      registrationOpensOn: input.registrationOpensOn,
      registrationClosesOn: input.registrationClosesOn,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      settings: DEFAULT_SEASON_SETTINGS,
    })
    .returning();
  return season;
}

export async function setSeasonStatus(
  seasonId: string,
  status: Season["status"],
): Promise<void> {
  await getDb().update(seasons).set({ status }).where(eq(seasons.id, seasonId));
}

export async function upsertDivision(
  seasonId: string,
  input: {
    id?: string;
    name: string;
    capacity: number;
    feeCents: number;
    birthYearFrom: number | null;
    birthYearTo: number | null;
    earlyBird: Division["earlyBird"];
    waitlistEnabled: boolean;
  },
): Promise<void> {
  const db = getDb();
  if (input.id) {
    await db
      .update(divisions)
      .set({
        name: input.name.trim(),
        capacity: input.capacity,
        feeCents: input.feeCents,
        birthYearFrom: input.birthYearFrom,
        birthYearTo: input.birthYearTo,
        earlyBird: input.earlyBird,
        waitlistEnabled: input.waitlistEnabled,
      })
      .where(and(eq(divisions.id, input.id), eq(divisions.seasonId, seasonId)));
    return;
  }
  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${divisions.sortOrder}), 0) + 1` })
    .from(divisions)
    .where(eq(divisions.seasonId, seasonId));
  await db.insert(divisions).values({
    seasonId,
    name: input.name.trim(),
    capacity: input.capacity,
    feeCents: input.feeCents,
    birthYearFrom: input.birthYearFrom,
    birthYearTo: input.birthYearTo,
    earlyBird: input.earlyBird,
    waitlistEnabled: input.waitlistEnabled,
    sortOrder: Number(nextOrder),
  });
}

export async function deleteDivision(seasonId: string, divisionId: string): Promise<void> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.divisionId, divisionId), ne(registrations.status, "canceled")));
  if (Number(n) > 0) {
    throw new Error("That division has registrations. Close the season instead of deleting it.");
  }
  await db.delete(divisions).where(and(eq(divisions.id, divisionId), eq(divisions.seasonId, seasonId)));
}
