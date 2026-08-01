/**
 * Reading the ledger out of the database.
 *
 * Split from ledger.ts so the reminder engine can re-derive a balance at send
 * time without importing the module that schedules reminders. Dependencies run
 * one way: ledger.ts → reminders.ts → ledger-read.ts → ledger-core.ts. No cycle,
 * which matters because a cycle here would be resolved differently by `tsx` and
 * by Next's bundler.
 */

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { charges, lateFeeRules, payments, type Charge, type LateFeeRule } from "@/db/schema";
import { computeLedger, type Ledger, type LedgerCharge, type LedgerPayment } from "@/lib/ledger-core";
import { isoDateOf, type IsoDate } from "@/lib/money";

export function toLedgerCharge(c: Charge): LedgerCharge {
  return {
    id: c.id,
    kind: c.kind,
    amountCents: c.amountCents,
    dueOn: c.dueOn as IsoDate,
    period: c.period,
    waived: c.waivedAt != null,
    memo: c.memo || undefined,
    prorated: c.prorated,
    sourceChargeId: c.sourceChargeId,
  };
}

export async function loadLedger(
  tenancyId: string,
  asOf: IsoDate = isoDateOf(new Date()),
): Promise<Ledger> {
  const db = getDb();
  const [chargeRows, paymentRows] = await Promise.all([
    db.select().from(charges).where(eq(charges.tenancyId, tenancyId)).orderBy(asc(charges.dueOn)),
    db.select().from(payments).where(eq(payments.tenancyId, tenancyId)).orderBy(asc(payments.paidAt)),
  ]);
  const ledgerPayments: LedgerPayment[] = paymentRows.map((p) => ({
    id: p.id,
    chargeId: p.chargeId,
    amountCents: p.amountCents,
    method: p.method,
    status: p.status,
    paidAt: p.paidAt,
    reference: p.reference,
    feeCents: p.feeCents,
  }));
  return computeLedger(chargeRows.map(toLedgerCharge), ledgerPayments, asOf);
}

export async function getLateFeeRule(tenancyId: string): Promise<LateFeeRule | null> {
  const [rule] = await getDb().select().from(lateFeeRules).where(eq(lateFeeRules.tenancyId, tenancyId));
  return rule ?? null;
}
