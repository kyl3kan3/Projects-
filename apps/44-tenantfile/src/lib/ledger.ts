/**
 * The ledger's database layer.
 *
 * All arithmetic lives in ledger-core.ts; this file only reads rows, hands them
 * to those pure functions, and writes back what changed. Three invariants are
 * enforced here because the database is the only place they can be:
 *
 *  1. **No double rent.** Charge generation inserts with `onConflictDoNothing`
 *     against a unique index on (tenancy, period) for rent. Two ticks racing
 *     produce one charge.
 *  2. **No double late fee.** Same trick, on a unique index over the fee's
 *     source charge.
 *  3. **A settled charge cancels its reminders.** Payment recording cancels
 *     scheduled reminders for anything now paid, and the sender re-checks anyway
 *     (src/lib/reminders.ts). Two independent guards, because "we reminded a
 *     tenant who already paid" is the kind of bug that loses the account.
 */

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  charges,
  lateFeeRules,
  payments,
  properties,
  tenancies,
  units,
  type Charge,
  type LateFeeRule,
  type PaymentMethod,
  type PaymentStatus,
  type Tenancy,
} from "@/db/schema";
import {
  assessLateFee,
  describeLateFeeRule,
  ledgerStrip,
  type Ledger,
  type StripCell,
} from "@/lib/ledger-core";
import { getLateFeeRule, loadLedger, toLedgerCharge } from "@/lib/ledger-read";
import { formatMoney, formatPeriod, isoDateOf, periodOf, type IsoDate, type Period } from "@/lib/money";
import { generationHorizon, plannedCharges } from "@/lib/schedule";
import { stitch } from "@/lib/file-events";
import { cancelRemindersForCharge, scheduleRemindersForCharge } from "@/lib/reminders";
import { audit } from "@/lib/audit";

/** Re-exported so callers have one ledger import; the reads live in ledger-read.ts. */
export { getLateFeeRule, loadLedger, toLedgerCharge };

/* ------------------------------------------------------------------ reads --- */

export interface LedgerView {
  ledger: Ledger;
  strip: StripCell[];
  rule: LateFeeRule | null;
  ruleSummary: string;
}

export async function loadLedgerView(
  tenancyId: string,
  year: number,
  asOf: IsoDate = isoDateOf(new Date()),
): Promise<LedgerView> {
  const [ledger, rule] = await Promise.all([loadLedger(tenancyId, asOf), getLateFeeRule(tenancyId)]);
  return {
    ledger,
    strip: ledgerStrip(ledger, year, asOf),
    rule,
    ruleSummary: rule
      ? describeLateFeeRule({
          graceDays: rule.graceDays,
          kind: rule.kind,
          amount: rule.amount,
          maxPerMonthCents: rule.maxPerMonthCents,
          enabled: rule.enabled,
        })
      : "No late fee set",
  };
}

/**
 * Persist the derived status of each charge, so that queries which cannot run the
 * pure function (the reminder sweep, the dashboard's dot colours) still see the
 * truth. The pure function stays authoritative; this is a cache with a job.
 */
export async function syncChargeStatuses(tenancyId: string, ledger?: Ledger): Promise<Ledger> {
  const db = getDb();
  const current = ledger ?? (await loadLedger(tenancyId));
  const rows = await db.select().from(charges).where(eq(charges.tenancyId, tenancyId));
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const state of current.charges) {
    const row = byId.get(state.charge.id);
    if (!row || row.status === state.status) continue;
    await db.update(charges).set({ status: state.status }).where(eq(charges.id, state.charge.id));
  }
  return current;
}

/* ------------------------------------------------------ charge generation --- */

export interface GenerationResult {
  created: Charge[];
  skipped: number;
}

/**
 * Make sure every charge the tenancy's terms imply exists, up to the horizon
 * (this month plus one). Safe to run as often as you like: existing periods are
 * skipped by the unique index, and a charge a human has edited is never touched.
 */
export async function ensureCharges(
  tenancy: Tenancy,
  throughPeriod: Period = generationHorizon(isoDateOf(new Date())),
): Promise<GenerationResult> {
  const db = getDb();
  const plan = plannedCharges(
    {
      startsOn: tenancy.startsOn as IsoDate,
      endsOn: (tenancy.endsOn as IsoDate | null) ?? null,
      rentCents: tenancy.rentCents,
      depositCents: tenancy.depositCents,
      rentDueDay: tenancy.rentDueDay,
      prorateFirstMonth: tenancy.prorateFirstMonth,
      prorateLastMonth: tenancy.prorateLastMonth,
    },
    throughPeriod,
  );

  const existing = await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id));
  const haveRentPeriod = new Set(existing.filter((c) => c.kind === "rent").map((c) => c.period));
  const haveDeposit = existing.some((c) => c.kind === "deposit");

  const created: Charge[] = [];
  let skipped = 0;

  for (const planned of plan) {
    if (planned.kind === "deposit" && haveDeposit) {
      skipped++;
      continue;
    }
    if (planned.kind === "rent" && haveRentPeriod.has(planned.period)) {
      skipped++;
      continue;
    }
    const rows = await db
      .insert(charges)
      .values({
        tenancyId: tenancy.id,
        kind: planned.kind,
        amountCents: planned.amountCents,
        dueOn: planned.dueOn,
        period: planned.period,
        prorated: planned.prorated,
        memo: planned.memo,
        status: "upcoming",
      })
      .onConflictDoNothing()
      .returning();

    const row = rows[0];
    if (!row) {
      // Another tick won the race. Exactly what the unique index is for.
      skipped++;
      continue;
    }
    created.push(row);

    await stitch({
      tenancyId: tenancy.id,
      kind: "charge",
      refId: row.id,
      occurredAt: new Date(`${row.dueOn}T12:00:00.000Z`),
      summary:
        row.kind === "deposit"
          ? `Security deposit charged · ${formatMoney(row.amountCents)}`
          : `${planned.prorated ? "Prorated rent" : "Rent"} charged for ${formatPeriod(row.period!)} · ${formatMoney(row.amountCents)}`,
      amountCents: row.amountCents,
      dedupeKey: `charge:${row.id}`,
    });

    if (row.kind === "rent") await scheduleRemindersForCharge(row, tenancy);
  }

  await syncChargeStatuses(tenancy.id);
  return { created, skipped };
}

/** Every active tenancy in the system, for the tick. */
export async function activeTenancies(): Promise<Tenancy[]> {
  return getDb().select().from(tenancies).where(eq(tenancies.status, "active"));
}

/* ---------------------------------------------------------------- payments --- */

export interface RecordPaymentInput {
  tenancyId: string;
  /** Null lets the ledger apply it to the oldest debt — the honest default. */
  chargeId?: string | null;
  amountCents: number;
  method: PaymentMethod;
  status?: PaymentStatus;
  reference?: string;
  paidAt?: Date;
  recordedBy?: "landlord" | "tenant";
  stripePaymentIntentId?: string | null;
  feeCents?: number;
}

export async function recordPayment(input: RecordPaymentInput): Promise<{ paymentId: string; ledger: Ledger }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("A payment has to be a positive amount");
  }
  const db = getDb();
  const status = input.status ?? "succeeded";
  const paidAt = input.paidAt ?? new Date();

  const [row] = await db
    .insert(payments)
    .values({
      tenancyId: input.tenancyId,
      chargeId: input.chargeId ?? null,
      amountCents: input.amountCents,
      method: input.method,
      status,
      reference: input.reference ?? "",
      paidAt,
      recordedBy: input.recordedBy ?? "landlord",
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      feeCents: input.feeCents ?? 0,
    })
    .returning();

  await stitch({
    tenancyId: input.tenancyId,
    kind: "payment",
    refId: row.id,
    occurredAt: paidAt,
    summary:
      status === "processing"
        ? `Bank payment started · ${formatMoney(input.amountCents)}`
        : `Payment received · ${formatMoney(input.amountCents)} by ${methodWord(input.method)}`,
    detail: input.reference ?? "",
    amountCents: input.amountCents,
    dedupeKey: `payment:${row.id}`,
  });

  const ledger = await settleAndCancelReminders(input.tenancyId);
  return { paymentId: row.id, ledger };
}

function methodWord(method: PaymentMethod): string {
  switch (method) {
    case "ach":
      return "bank transfer";
    case "card":
      return "card";
    case "manual_zelle":
      return "Zelle";
    case "manual_cash":
      return "cash";
    case "manual_check":
      return "check";
  }
}

/**
 * Recompute statuses and cancel any reminder still scheduled for a charge that no
 * longer owes anything. Called after every payment and by the tick.
 */
export async function settleAndCancelReminders(tenancyId: string): Promise<Ledger> {
  const ledger = await syncChargeStatuses(tenancyId);
  const settled = ledger.charges.filter((c) => c.outstandingCents === 0).map((c) => c.charge.id);
  for (const chargeId of settled) await cancelRemindersForCharge(chargeId, "charge settled");
  return ledger;
}

/** Mark an in-flight ACH/card payment as settled (Stripe webhook path). */
export async function settlePayment(
  stripePaymentIntentId: string,
  outcome: "succeeded" | "failed",
): Promise<{ tenancyId: string } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, stripePaymentIntentId));
  if (!row) return null;
  if (row.status === outcome) return { tenancyId: row.tenancyId };

  await db.update(payments).set({ status: outcome }).where(eq(payments.id, row.id));
  await stitch({
    tenancyId: row.tenancyId,
    kind: "payment",
    refId: row.id,
    occurredAt: new Date(),
    summary:
      outcome === "succeeded"
        ? `Bank payment cleared · ${formatMoney(row.amountCents)}`
        : `Bank payment failed · ${formatMoney(row.amountCents)}`,
    amountCents: row.amountCents,
    dedupeKey: `payment-${outcome}:${row.id}`,
  });
  await settleAndCancelReminders(row.tenancyId);
  return { tenancyId: row.tenancyId };
}

/* --------------------------------------------------------------- late fees --- */

export interface LateFeeResult {
  charged: Charge[];
}

/**
 * Assess late fees for one tenancy. The rule decides the amount; the unique index
 * on `source_charge_id` decides whether it has already been charged. Nothing here
 * asks "did we already do this today?" in application code, because that question
 * cannot be answered correctly under concurrency.
 */
export async function applyLateFees(tenancy: Tenancy, asOf: IsoDate = isoDateOf(new Date())): Promise<LateFeeResult> {
  const rule = await getLateFeeRule(tenancy.id);
  if (!rule || !rule.enabled) return { charged: [] };

  const db = getDb();
  const ledger = await loadLedger(tenancy.id, asOf);
  const charged: Charge[] = [];

  for (const state of ledger.charges) {
    const assessment = assessLateFee(
      {
        graceDays: rule.graceDays,
        kind: rule.kind,
        amount: rule.amount,
        maxPerMonthCents: rule.maxPerMonthCents,
        enabled: rule.enabled,
      },
      state,
      asOf,
    );
    if (!assessment) continue;

    const rows = await db
      .insert(charges)
      .values({
        tenancyId: tenancy.id,
        kind: "late_fee",
        amountCents: assessment.amountCents,
        dueOn: assessment.dueOn,
        period: null,
        sourceChargeId: assessment.sourceChargeId,
        memo: assessment.memo,
        status: "due",
      })
      .onConflictDoNothing()
      .returning();

    const row = rows[0];
    if (!row) continue; // already assessed against this rent charge
    charged.push(row);

    await stitch({
      tenancyId: tenancy.id,
      kind: "charge",
      refId: row.id,
      occurredAt: new Date(`${assessment.dueOn}T12:00:00.000Z`),
      summary: `Late fee charged · ${formatMoney(row.amountCents)}`,
      detail: `${state.charge.period ? formatPeriod(state.charge.period) : state.charge.dueOn} rent was ${formatMoney(state.outstandingCents)} short after ${rule.graceDays} grace day${rule.graceDays === 1 ? "" : "s"}`,
      amountCents: row.amountCents,
      dedupeKey: `late-fee:${row.id}`,
    });
  }

  if (charged.length) await syncChargeStatuses(tenancy.id);
  return { charged };
}

export interface LateFeeRuleInputDb {
  graceDays: number;
  kind: "flat" | "percent";
  amount: number;
  maxPerMonthCents: number | null;
  enabled: boolean;
  stateCapAck: boolean;
  stateCapNote: string;
}

export async function upsertLateFeeRule(tenancyId: string, input: LateFeeRuleInputDb): Promise<void> {
  const db = getDb();
  await db
    .insert(lateFeeRules)
    .values({ tenancyId, ...input })
    .onConflictDoUpdate({ target: lateFeeRules.tenancyId, set: { ...input } });
}

/* ------------------------------------------------------- manual ledger ops --- */

export async function waiveCharge(
  chargeId: string,
  reason: string,
  actor: string,
  landlordId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(charges).where(eq(charges.id, chargeId));
  if (!row) throw new Error("No such charge");
  if (row.waivedAt) return;

  await db
    .update(charges)
    .set({ waivedAt: new Date(), waivedReason: reason, status: "waived" })
    .where(eq(charges.id, chargeId));

  await stitch({
    tenancyId: row.tenancyId,
    kind: "charge",
    refId: row.id,
    summary: `${row.kind === "late_fee" ? "Late fee" : "Charge"} waived · ${formatMoney(row.amountCents)}`,
    detail: reason,
    amountCents: 0,
    dedupeKey: `waive:${row.id}`,
  });
  await cancelRemindersForCharge(row.id, "charge waived");
  await settleAndCancelReminders(row.tenancyId);
  await audit(landlordId, actor, "charge.waive", row.id, { reason, amountCents: row.amountCents });
}

export async function adjustCharge(
  chargeId: string,
  amountCents: number,
  reason: string,
  actor: string,
  landlordId: string,
): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error("Enter a valid amount");
  const db = getDb();
  const [row] = await db.select().from(charges).where(eq(charges.id, chargeId));
  if (!row) throw new Error("No such charge");

  await db
    .update(charges)
    .set({ amountCents, manuallyAdjusted: true })
    .where(eq(charges.id, chargeId));

  await stitch({
    tenancyId: row.tenancyId,
    kind: "charge",
    refId: row.id,
    summary: `Charge adjusted from ${formatMoney(row.amountCents)} to ${formatMoney(amountCents)}`,
    detail: reason,
    amountCents,
  });
  await syncChargeStatuses(row.tenancyId);
  await audit(landlordId, actor, "charge.adjust", row.id, { from: row.amountCents, to: amountCents, reason });
}

/* ------------------------------------------------------- portfolio queries --- */

export interface UnitRow {
  unitId: string;
  propertyId: string;
  address: string;
  city: string;
  state: string;
  label: string;
  rentCents: number;
  depositCents: number;
  unitStatus: string;
  tenancyId: string | null;
  tenantNames: string[];
  listingSlug: string | null;
  listingStatus: string | null;
  applicationCount: number;
}

/** Every unit a landlord owns, with just enough state for the home-screen rows. */
export async function landlordUnits(landlordId: string): Promise<UnitRow[]> {
  const db = getDb();
  const rows = await db.execute<{
    unit_id: string;
    property_id: string;
    address: string;
    city: string;
    state: string;
    label: string;
    rent_cents: number;
    deposit_cents: number;
    unit_status: string;
    tenancy_id: string | null;
    tenant_names: string[] | null;
    listing_slug: string | null;
    listing_status: string | null;
    application_count: string;
  }>(sql`
    select
      u.id as unit_id,
      p.id as property_id,
      p.address, p.city, p.state,
      u.label, u.rent_cents, u.deposit_cents, u.status as unit_status,
      t.id as tenancy_id, t.tenant_names,
      l.slug as listing_slug, l.status as listing_status,
      coalesce((select count(*) from applications a where a.listing_id = l.id), 0) as application_count
    from units u
    join properties p on p.id = u.property_id
    left join tenancies t on t.unit_id = u.id and t.status = 'active'
    left join listings l on l.unit_id = u.id and l.status <> 'closed'
    where p.landlord_id = ${landlordId}
    order by p.address asc, u.label asc
  `);

  return [...rows].map((r) => ({
    unitId: r.unit_id,
    propertyId: r.property_id,
    address: r.address,
    city: r.city,
    state: r.state,
    label: r.label,
    rentCents: r.rent_cents,
    depositCents: r.deposit_cents,
    unitStatus: r.unit_status,
    tenancyId: r.tenancy_id,
    tenantNames: r.tenant_names ?? [],
    listingSlug: r.listing_slug,
    listingStatus: r.listing_status,
    applicationCount: Number(r.application_count),
  }));
}

export async function countUnits(landlordId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: units.id })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(properties.landlordId, landlordId));
  return rows.length;
}

/** Tenancies a landlord owns, with their unit — used by every tenancy screen. */
export async function landlordTenancy(landlordId: string, tenancyId: string) {
  const db = getDb();
  const [row] = await db
    .select({ tenancy: tenancies, unit: units, property: properties })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(tenancies.id, tenancyId), eq(properties.landlordId, landlordId)));
  return row ?? null;
}

export async function landlordTenancies(landlordId: string) {
  const db = getDb();
  return db
    .select({ tenancy: tenancies, unit: units, property: properties })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(properties.landlordId, landlordId), ne(tenancies.status, "draft")))
    .orderBy(asc(properties.address), asc(units.label));
}

/** Charges that are due or past due across a portfolio — the Rent screen. */
export async function openChargesFor(tenancyIds: string[]) {
  if (tenancyIds.length === 0) return [];
  return getDb()
    .select()
    .from(charges)
    .where(and(inArray(charges.tenancyId, tenancyIds), isNull(charges.waivedAt), ne(charges.status, "paid")))
    .orderBy(asc(charges.dueOn));
}

export function currentPeriod(): Period {
  return periodOf(isoDateOf(new Date()));
}
