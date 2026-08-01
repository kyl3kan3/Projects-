/**
 * The delinquency ladder and the delinquency view.
 *
 * Neighbours are chasing neighbours here, so the default copy escalates in tone
 * but never in threat, and the 90+ bucket surfaces "export this history for your
 * attorney" rather than generating legal language itself (README risk #4:
 * collection and violation process is governed by state statute and the
 * association's own CC&Rs — software must not improvise it).
 *
 * Idempotency: the rung index is stored on the invoice, and
 * `ledger.nextReminderRung` only returns a rung strictly above it. A sweep that
 * fires twice in a day sends once.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assessmentSchedules,
  associations,
  autopayEnrollments,
  households,
  invoiceLines,
  invoices,
  members,
  type Association,
  type AssociationSettings,
  type Household,
  type Invoice,
  type Member,
} from "@/db/schema";
import { audit, SYSTEM, type Actor } from "@/lib/audit";
import { addMonths, formatIso, today, type IsoDate } from "@/lib/dates";
import { agingBucket, daysPastDue, NO_LATE_FEE, type AgingBucket } from "@/lib/dues";
import { associationBalances, loadInvoice, writeOffInvoice } from "@/lib/invoicing";
import { nextReminderRung } from "@/lib/ledger";
import { formatMoney, splitCents } from "@/lib/money";
import { sendEmail, sendSms } from "@/lib/notify";
import { firstName, renderTemplate } from "@/lib/text";
import { mintPortalToken, portalUrl } from "@/lib/portal";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { featureAllowed } from "@/lib/plans";

export interface SweepSummary {
  considered: number;
  sent: number;
  skipped: number;
}

/**
 * Walk every overdue invoice and send the rung it has newly crossed.
 *
 * An SMS rung on a plan without SMS falls back to email — the ladder must not go
 * silent because of a billing tier. That is a downgrade, not a cancellation.
 */
export async function reminderSweep(asOf: IsoDate = today()): Promise<SweepSummary> {
  const db = getDb();
  const summary: SweepSummary = { considered: 0, sent: 0, skipped: 0 };

  const rows = await db
    .select({ invoice: invoices, household: households, association: associations })
    .from(invoices)
    .innerJoin(households, eq(invoices.householdId, households.id))
    .innerJoin(associations, eq(invoices.associationId, associations.id))
    .where(
      and(
        inArray(invoices.status, ["sent", "partial", "overdue"]),
        sql`${invoices.dueOn} < ${asOf}`,
      ),
    )
    .limit(2000);

  for (const { invoice, household, association } of rows) {
    summary.considered += 1;
    const settings: AssociationSettings = { ...DEFAULT_SETTINGS, ...(association.settings ?? {}) };
    const rung = nextReminderRung(settings.reminderLadder, {
      dueOn: invoice.dueOn,
      asOf,
      rungSent: invoice.reminderRungSent,
    });
    if (rung === null) {
      summary.skipped += 1;
      continue;
    }

    const ledger = await loadInvoice(invoice.id);
    if (!ledger || ledger.balanceCents <= 0) {
      summary.skipped += 1;
      continue;
    }

    const sent = await sendRung(association, household, invoice, rung, settings, asOf);
    // The rung is recorded whether or not the provider accepted it: a bad
    // address must not make the ladder re-send the same rung every day forever.
    // The `deliveries` row carries the failure and the delivery report shows it.
    await db
      .update(invoices)
      .set({ reminderRungSent: rung, reminderRungSentAt: new Date() })
      .where(eq(invoices.id, invoice.id));
    if (sent) summary.sent += 1;
  }

  return summary;
}

async function sendRung(
  association: Association,
  household: Household,
  invoice: Invoice,
  rungIndex: number,
  settings: AssociationSettings,
  asOf: IsoDate,
): Promise<boolean> {
  const db = getDb();
  const rung = settings.reminderLadder[rungIndex];
  if (!rung) return false;
  const ledger = await loadInvoice(invoice.id);
  if (!ledger) return false;

  const contacts = await db.select().from(members).where(eq(members.householdId, household.id));
  const recipients = contacts.filter((m) => m.email || m.phone);
  if (recipients.length === 0) return false;

  let anySent = false;
  for (const member of recipients) {
    const link = portalUrl(await mintPortalToken(member.id));
    const vars: Record<string, string> = {
      name: firstName(member.name),
      unit: household.unitLabel,
      association: association.name,
      period: invoice.periodLabel,
      balance: formatMoney(ledger.balanceCents),
      dueDate: formatIso(invoice.dueOn),
      daysLate: String(daysPastDue(invoice.dueOn, asOf)),
      portalLink: link,
    };
    const subject = renderTemplate(rung.subject, vars);
    const body = renderTemplate(rung.body, vars);
    const ctx = {
      associationId: association.id,
      memberId: member.id,
      purpose: `reminder_rung_${rungIndex}`,
      invoiceId: invoice.id,
    };

    if (rung.channel === "sms" && featureAllowed(association.plan, "sms")) {
      const res = await sendSms(ctx, member, body);
      if (res.status === "sent" || res.status === "delivered") anySent = true;
      // Someone with a phone but no email is done here.
      if (!member.email) continue;
    }

    if (member.email) {
      const res = await sendEmail(ctx, { to: member.email, subject, text: body });
      if (res.status === "sent" || res.status === "delivered") anySent = true;
    }
  }

  await audit(
    association.id,
    SYSTEM,
    "sent_reminder",
    `unit ${household.unitLabel} · ${invoice.periodLabel}`,
    { invoiceId: invoice.id, rung: rungIndex, tone: rung.tone, amountCents: ledger.balanceCents },
  );
  return anySent;
}

/* --------------------------------------------------------- delinquency view --- */

export interface DelinquentRow {
  household: Household;
  primary: Member | null;
  balanceCents: number;
  pendingCents: number;
  creditCents: number;
  oldestDueOn: IsoDate | null;
  daysLate: number;
  bucket: AgingBucket;
  openInvoices: number;
  autopay: { method: "card" | "ach"; status: string } | null;
}

export interface AgingSummary {
  rows: DelinquentRow[];
  buckets: Record<AgingBucket, { count: number; amountCents: number }>;
  totalOutstandingCents: number;
  householdsOutstanding: number;
}

export async function agingSummary(
  associationId: string,
  asOf: IsoDate = today(),
): Promise<AgingSummary> {
  const db = getDb();
  const balances = await associationBalances(associationId);

  const rows = await db
    .select()
    .from(households)
    .where(eq(households.associationId, associationId))
    .orderBy(households.unitLabel);

  const memberRows = await db
    .select({ member: members })
    .from(members)
    .innerJoin(households, eq(members.householdId, households.id))
    .where(eq(households.associationId, associationId));

  const enrollmentRows = await db
    .select({ enrollment: autopayEnrollments })
    .from(autopayEnrollments)
    .innerJoin(households, eq(autopayEnrollments.householdId, households.id))
    .where(eq(households.associationId, associationId));

  const primaryByHousehold = new Map<string, Member>();
  for (const { member } of memberRows) {
    const held = primaryByHousehold.get(member.householdId);
    if (!held || (member.isPrimary && !held.isPrimary)) {
      primaryByHousehold.set(member.householdId, member);
    }
  }
  const autopayByHousehold = new Map(
    enrollmentRows.map(({ enrollment }) => [
      enrollment.householdId,
      { method: enrollment.method, status: enrollment.status as string },
    ]),
  );

  const buckets: AgingSummary["buckets"] = {
    current: { count: 0, amountCents: 0 },
    "30": { count: 0, amountCents: 0 },
    "60": { count: 0, amountCents: 0 },
    "90": { count: 0, amountCents: 0 },
  };

  const out: DelinquentRow[] = [];
  for (const household of rows) {
    const balance = balances.get(household.id);
    const balanceCents = balance?.balanceCents ?? 0;
    const oldestDueOn = balance?.oldestDueOn ?? null;
    const bucket = oldestDueOn ? agingBucket(oldestDueOn, asOf) : "current";
    out.push({
      household,
      primary: primaryByHousehold.get(household.id) ?? null,
      balanceCents,
      pendingCents: balance?.pendingCents ?? 0,
      creditCents: balance?.creditCents ?? 0,
      oldestDueOn,
      daysLate: oldestDueOn ? Math.max(0, daysPastDue(oldestDueOn, asOf)) : 0,
      bucket,
      openInvoices: balance?.openInvoices ?? 0,
      autopay: autopayByHousehold.get(household.id) ?? null,
    });
    if (balanceCents > 0) {
      buckets[bucket].count += 1;
      buckets[bucket].amountCents += balanceCents;
    }
  }

  const outstanding = out.filter((r) => r.balanceCents > 0);
  return {
    rows: out,
    buckets,
    totalOutstandingCents: outstanding.reduce((s, r) => s + r.balanceCents, 0),
    householdsOutstanding: outstanding.length,
  };
}

/** Active households with anything outstanding — the "checks to chase" number. */
export async function checksToChase(associationId: string): Promise<number> {
  const db = getDb();
  const balances = await associationBalances(associationId);
  const active = await db
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.associationId, associationId), isNull(households.leftOn)));
  return active.filter((h) => (balances.get(h.id)?.balanceCents ?? 0) > 0).length;
}

/* ------------------------------------------------------------ payment plans --- */

export interface PlanInstalment {
  amountCents: number;
  dueOn: IsoDate;
  label: string;
}

/**
 * The instalment split, as a pure function so the confirm sheet can show the
 * exact schedule before anything is written. `splitCents` guarantees the parts
 * sum back to the balance to the cent — no unpayable one-cent tail.
 */
export function planInstalments(
  balanceCents: number,
  parts: number,
  startOn: IsoDate,
): PlanInstalment[] {
  return splitCents(balanceCents, parts).map((amountCents, i) => ({
    amountCents,
    dueOn: addMonths(startOn, i),
    label: `Payment plan ${i + 1} of ${parts}`,
  }));
}

/**
 * Turn a household's outstanding balance into scheduled instalments.
 *
 * The original invoices are written off with the plan named as the reason and
 * replaced by plan invoices, so the total owed is unchanged, the ledger never
 * double-counts, and the history says exactly what the board agreed to.
 */
export async function createPaymentPlan(
  householdId: string,
  parts: number,
  startOn: IsoDate,
  actor: Actor,
): Promise<{ instalments: PlanInstalment[]; scheduleId: string }> {
  if (parts < 2 || parts > 12) throw new Error("A payment plan runs between 2 and 12 instalments");
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  if (!household) throw new Error("No such household");

  const balances = await associationBalances(household.associationId);
  const balanceCents = balances.get(householdId)?.balanceCents ?? 0;
  if (balanceCents <= 0) throw new Error("This household has nothing outstanding to split");

  const open = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.householdId, householdId),
        inArray(invoices.status, ["sent", "partial", "overdue", "draft"]),
      ),
    );

  const instalments = planInstalments(balanceCents, parts, startOn);
  const [schedule] = await db
    .insert(assessmentSchedules)
    .values({
      associationId: household.associationId,
      name: `Payment plan — unit ${household.unitLabel}`,
      cadence: "monthly",
      amountCents: instalments[0].amountCents,
      dueDay: Number(startOn.slice(8, 10)),
      startsOn: startOn,
      endsOn: instalments.at(-1)!.dueOn,
      prorate: false,
      // A plan the board agreed to does not accrue new late fees while it runs.
      lateFeePolicy: NO_LATE_FEE,
      archivedAt: new Date(), // Not part of the ordinary cron rotation.
    })
    .returning();

  for (const instalment of instalments) {
    const [invoice] = await db
      .insert(invoices)
      .values({
        associationId: household.associationId,
        householdId,
        assessmentScheduleId: schedule.id,
        periodLabel: instalment.label,
        periodStart: instalment.dueOn,
        periodEnd: instalment.dueOn,
        dueOn: instalment.dueOn,
        status: "sent",
        lateFeePolicy: NO_LATE_FEE,
        prorationNote: `Part of a ${parts}-instalment payment plan agreed with the board.`,
        sentAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!invoice) continue;
    await db.insert(invoiceLines).values({
      invoiceId: invoice.id,
      kind: "assessment",
      description: instalment.label,
      amountCents: instalment.amountCents,
    });
  }

  for (const row of open) {
    await writeOffInvoice(row.id, `Rolled into a ${parts}-instalment payment plan`, actor);
  }

  await audit(
    household.associationId,
    actor,
    "created_payment_plan",
    `unit ${household.unitLabel}`,
    { householdId, parts, amountCents: balanceCents },
  );

  return { instalments, scheduleId: schedule.id };
}
