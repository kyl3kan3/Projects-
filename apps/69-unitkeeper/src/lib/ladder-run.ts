/**
 * The late ladder, over the database: firing rungs, reversing them on payment, and
 * the delinquency board's read model.
 *
 * **Exactly-once, by claim-then-act.** A rung is claimed with an insert into
 * `ladder_events`, whose unique index on (tenancy, cycle, day, action) is the
 * guarantee. If the insert returns nothing, another run already has that rung and
 * this one stops. Only after the claim succeeds does anything happen — a card
 * retried, a fee posted, a gate code overlocked. The alternative (act, then
 * record) charges a second late fee every time a tick is retried.
 *
 * **Reversal is a stamp, not a delete.** Paying in full sets `reversed_on` on every
 * rung of the cycle, lifts the overlock, and resolves the lien case. The rows stay,
 * because the lien packet has to be able to print what happened *and* that it was
 * undone.
 */

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  facilities,
  ladderEvents,
  lienCases,
  owners,
  tenancies,
  tenants,
  units,
  type Facility,
  type LadderAction,
  type OwnerSettings,
  type Tenancy,
  type Tenant,
  type Unit,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { dueRungs, lienEligibleDay, nextRung, type LadderStep } from "@/lib/ladder";
import { delinquency, type Delinquency } from "@/lib/ledger-core";
import { entriesForMany, post, toCoreEntries } from "@/lib/ledger";
import { addDays, formatMoney, type IsoDate } from "@/lib/money";
import { rentPayments } from "@/lib/payments";
import { readSettings } from "@/lib/settings";
import { sendMail } from "@/lib/email";
import { renderLateNotice } from "@/lib/docs";
import { tenancyContext } from "@/lib/tenancy";

export interface DelinquentRow {
  owner: { id: string; name: string; email: string; settings: OwnerSettings };
  facility: Facility;
  unit: Unit;
  tenancy: Tenancy;
  tenant: Tenant;
  delinquency: Delinquency;
  firedRungs: Array<{ day: number; action: LadderAction; firedOn: IsoDate }>;
  nextRung: LadderStep | null;
  nextRungOn: IsoDate | null;
  lienEligible: boolean;
  lienCaseId: string | null;
}

/**
 * Every tenancy that owes money, with its ladder position. One pass over the
 * owner's units — the board is a screen an owner reloads all morning, so it must
 * not be N+1.
 */
export async function delinquentRows(ownerId: string, asOf: IsoDate): Promise<DelinquentRow[]> {
  const db = getDb();
  const rows = await db
    .select({ owner: owners, facility: facilities, unit: units, tenancy: tenancies, tenant: tenants })
    .from(tenancies)
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .innerJoin(owners, eq(facilities.ownerId, owners.id))
    .innerJoin(tenants, eq(tenancies.tenantId, tenants.id))
    .where(and(eq(facilities.ownerId, ownerId), isNull(tenancies.endedOn), ne(tenancies.status, "ended")));

  if (rows.length === 0) return [];

  const tenancyIds = rows.map((r) => r.tenancy.id);
  const ledgers = await entriesForMany(tenancyIds);
  const events = await db
    .select()
    .from(ladderEvents)
    .where(and(inArray(ladderEvents.tenancyId, tenancyIds), isNull(ladderEvents.reversedOn)));
  const cases = await db
    .select({ id: lienCases.id, tenancyId: lienCases.tenancyId })
    .from(lienCases)
    .where(
      and(
        inArray(lienCases.tenancyId, tenancyIds),
        inArray(lienCases.status, ["open", "paused", "sale_eligible"]),
      ),
    );
  const caseByTenancy = new Map(cases.map((c) => [c.tenancyId, c.id]));

  const out: DelinquentRow[] = [];
  for (const row of rows) {
    const settings = readSettings(row.owner.settings);
    const delq = delinquency(toCoreEntries(ledgers.get(row.tenancy.id) ?? []), asOf);
    if (delq.since === null || delq.outstandingCents <= 0) continue;

    const fired = events
      .filter((e) => e.tenancyId === row.tenancy.id && e.cycleKey === delq.cycleKey)
      .map((e) => ({ day: e.day, action: e.action, firedOn: e.firedOn }));
    const next = nextRung(settings.lateLadder, delq.daysLate);
    const eligibleDay = lienEligibleDay(settings.lateLadder);

    out.push({
      owner: {
        id: row.owner.id,
        name: row.owner.name,
        email: row.owner.email,
        settings,
      },
      facility: row.facility,
      unit: row.unit,
      tenancy: row.tenancy,
      tenant: row.tenant,
      delinquency: delq,
      firedRungs: fired.sort((a, b) => a.day - b.day),
      nextRung: next,
      nextRungOn: next ? addDays(delq.since, next.day) : null,
      lienEligible: eligibleDay !== null && delq.daysLate >= eligibleDay,
      lienCaseId: caseByTenancy.get(row.tenancy.id) ?? null,
    });
  }

  return out.sort((a, b) => b.delinquency.daysLate - a.delinquency.daysLate);
}

/* ------------------------------------------------------------------ firing --- */

export interface FiredRungResult {
  action: LadderAction;
  day: number;
  detail: string;
}

/** Claim a rung. Null means somebody else already has it. */
async function claimRung(
  tenancyId: string,
  cycleKey: string,
  step: LadderStep,
  asOf: IsoDate,
): Promise<string | null> {
  const [claimed] = await getDb()
    .insert(ladderEvents)
    .values({
      tenancyId,
      cycleKey,
      day: step.day,
      action: step.action,
      firedOn: asOf,
    })
    .onConflictDoNothing()
    .returning();
  return claimed?.id ?? null;
}

/**
 * Walk one tenancy's ladder. Fires every unfired rung it has crossed — a tick that
 * did not run for a week catches up rather than skipping to the last rung and going
 * quiet.
 */
export async function runLadderFor(
  row: DelinquentRow,
  asOf: IsoDate,
): Promise<FiredRungResult[]> {
  const db = getDb();
  const results: FiredRungResult[] = [];
  const steps = dueRungs(row.owner.settings.lateLadder, row.delinquency.daysLate, row.firedRungs);

  for (const step of steps) {
    const eventId = await claimRung(row.tenancy.id, row.delinquency.cycleKey ?? "", step, asOf);
    if (!eventId) continue;

    switch (step.action) {
      case "retry": {
        const outcome = await rentPayments().charge({
          stripeAccountId: null,
          customerId: row.tenant.stripeCustomerId,
          paymentMethodId: row.tenancy.stripePaymentMethodId,
          amountCents: row.delinquency.outstandingCents,
          description: `${row.facility.name} unit ${row.unit.label} — retry`,
          // The rung fires once, so the key only has to be stable across a crash.
          idempotencyKey: `retry:${row.tenancy.id}:${row.delinquency.cycleKey}:${step.day}`,
        });
        if (outcome.ok) {
          await post({
            tenancyId: row.tenancy.id,
            kind: "payment",
            amountCents: -row.delinquency.outstandingCents,
            description: `Retry collected${outcome.simulated ? " (simulated)" : ""}`,
            occurredOn: asOf,
            stripePaymentIntentId: outcome.paymentIntentId,
          });
          results.push({
            action: step.action,
            day: step.day,
            detail: `retry collected ${formatMoney(row.delinquency.outstandingCents)}`,
          });
        } else {
          results.push({ action: step.action, day: step.day, detail: `retry failed: ${outcome.code}` });
        }
        break;
      }

      case "late_fee": {
        const feeCents = step.feeCents ?? 0;
        if (feeCents > 0) {
          const posted = await post({
            tenancyId: row.tenancy.id,
            kind: "late_fee",
            amountCents: feeCents,
            description: `Late fee — day ${step.day} of ${row.delinquency.cycleKey}`,
            occurredOn: asOf,
            period: row.delinquency.cycleKey,
          });
          if (posted.entry) {
            await db
              .update(ladderEvents)
              .set({ ledgerEntryId: posted.entry.id })
              .where(eq(ladderEvents.id, eventId));
          }
          // The document, not just the email: a past-due notice belongs on the
          // tenant's file, and if this account ever reaches a lien sale the paper
          // trail has to start here.
          try {
            const ctx = await tenancyContext(row.tenancy.id);
            if (ctx) {
              await renderLateNotice(
                ctx,
                row.delinquency.outstandingCents + feeCents,
                row.delinquency.daysLate,
                asOf,
              );
            }
          } catch (err) {
            // A failed PDF must not un-charge the fee that is already on the ledger.
            console.error("[ladder] late notice failed", { tenancyId: row.tenancy.id, err });
          }
          await sendMail({
            to: row.tenant.email ?? "",
            subject: `${row.facility.name}: unit ${row.unit.label} is ${row.delinquency.daysLate} days past due`,
            text:
              `Unit ${row.unit.label} is ${row.delinquency.daysLate} days past due. ` +
              `A late fee of ${formatMoney(feeCents)} has been added, and the balance is now ` +
              `${formatMoney(row.delinquency.outstandingCents + feeCents)}.\n\n` +
              `Paying in full stops every remaining step and lifts any overlock the same day.`,
          });
          results.push({
            action: step.action,
            day: step.day,
            detail: `late fee ${formatMoney(feeCents)} posted`,
          });
        }
        break;
      }

      case "overlock": {
        await db
          .update(tenancies)
          .set({ gateCodeStatus: "overlocked", status: "delinquent", updatedAt: new Date() })
          .where(eq(tenancies.id, row.tenancy.id));
        await sendMail({
          to: row.tenant.email ?? "",
          subject: `${row.facility.name}: unit ${row.unit.label} has been overlocked`,
          text:
            `Unit ${row.unit.label} has been overlocked and the gate code has stopped working. ` +
            `The balance is ${formatMoney(row.delinquency.outstandingCents)}.\n\n` +
            `Paying in full restores access the same day.`,
        });
        results.push({ action: step.action, day: step.day, detail: "gate code overlocked" });
        break;
      }

      case "lien_eligible": {
        // Deliberately does nothing but record the date. Opening a lien case is a
        // decision with legal consequences and the owner makes it, on the board.
        results.push({
          action: step.action,
          day: step.day,
          detail: "flagged lien-eligible for the owner",
        });
        break;
      }
    }
  }

  if (results.length > 0) {
    await audit(row.owner.id, "system:ladder", "ladder.fired", row.tenancy.id, {
      cycle: row.delinquency.cycleKey,
      rungs: results,
    });
  }
  return results;
}

/* --------------------------------------------------------------- reversal --- */

export interface ReversalResult {
  reversedRungs: number;
  overlockLifted: boolean;
  lienCaseResolved: boolean;
}

/**
 * Called after any payment. If the balance is clear, the whole ladder for this
 * tenancy comes down: rungs stamped reversed, gate code restored, tenancy back to
 * active, and any open lien case resolved as paid.
 *
 * The test of "clear" is the balance, not the rent line. A tenant who paid the rent
 * and not the late fee still owes money, and lifting an overlock while a balance
 * stands is how a facility loses the fee it assessed.
 */
export async function reverseLadderIfPaid(
  tenancyId: string,
  asOf: IsoDate,
): Promise<ReversalResult> {
  const db = getDb();
  const ledgers = await entriesForMany([tenancyId]);
  const delq = delinquency(toCoreEntries(ledgers.get(tenancyId) ?? []), asOf);
  if (delq.outstandingCents > 0) {
    return { reversedRungs: 0, overlockLifted: false, lienCaseResolved: false };
  }

  const reversed = await db
    .update(ladderEvents)
    .set({ reversedOn: asOf, updatedAt: new Date() })
    .where(and(eq(ladderEvents.tenancyId, tenancyId), isNull(ladderEvents.reversedOn)))
    .returning({ id: ladderEvents.id });

  const [tenancy] = await db.select().from(tenancies).where(eq(tenancies.id, tenancyId));
  let overlockLifted = false;
  if (tenancy && !tenancy.endedOn) {
    const restoreCode = tenancy.gateCodeStatus === "overlocked" && Boolean(tenancy.gateCode);
    await db
      .update(tenancies)
      .set({
        status: "active",
        ...(restoreCode ? { gateCodeStatus: "active" as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenancies.id, tenancyId));
    overlockLifted = restoreCode;
  }

  const resolved = await db
    .update(lienCases)
    .set({ status: "resolved", resolvedReason: "paid", updatedAt: new Date() })
    .where(
      and(
        eq(lienCases.tenancyId, tenancyId),
        inArray(lienCases.status, ["open", "paused", "sale_eligible"]),
      ),
    )
    .returning({ id: lienCases.id });

  return {
    reversedRungs: reversed.length,
    overlockLifted,
    lienCaseResolved: resolved.length > 0,
  };
}

/** Rungs recorded against a tenancy, newest first — the unit file's ladder log. */
export async function ladderHistory(tenancyId: string) {
  return getDb()
    .select()
    .from(ladderEvents)
    .where(eq(ladderEvents.tenancyId, tenancyId))
    .orderBy(ladderEvents.firedOn, ladderEvents.day);
}
