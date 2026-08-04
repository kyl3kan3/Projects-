/**
 * src/server/ledger.ts
 *
 * Reading the protection ledger. The arithmetic lives in `lib/ledger.ts` (pure, tested);
 * this is the query that feeds it.
 *
 * Rows are selected by the month they *occurred* in the stylist's own timezone, because
 * "protected this month" has to mean the month the stylist is living in. The window is
 * widened by a day at each end and then narrowed in JS, which is cheaper than teaching
 * Postgres about the tenant's clock and avoids interpolating a timezone into raw SQL.
 *
 * Deposits that went towards a service the client actually turned up for are **not** listed.
 * A `deposit` row with status `charged` is service money: real, but not protection. Showing it
 * as a "deposit kept · +$10.00" line would read as money the policy saved, which is exactly
 * the overstatement the ledger exists to avoid.
 */

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, charges, clients, services } from "@/db/schema";
import { dayOfInstant, firstOfMonth, firstOfNextMonth, todayInTimezone } from "@/lib/dates";
import type { ChargeKind, ChargeStatus, LedgerRow } from "@/lib/ledger";

export interface LedgerQuery {
  stylistId: string;
  timezone: string;
  /** Any calendar day inside the month wanted. Defaults to today. */
  month?: string;
  now?: Date;
}

export async function ledgerRows(query: LedgerQuery): Promise<LedgerRow[]> {
  const db = getDb();
  const now = query.now ?? new Date();
  const anchor = query.month ?? todayInTimezone(query.timezone, now);
  const from = firstOfMonth(anchor);
  const to = firstOfNextMonth(anchor);

  const rows = await db
    .select({ charge: charges, appointment: appointments, client: clients, service: services })
    .from(charges)
    .innerJoin(appointments, eq(appointments.id, charges.appointmentId))
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.stylistId, query.stylistId),
        gte(charges.occurredAt, new Date(Date.parse(`${from}T00:00:00.000Z`) - 86_400_000)),
        lte(charges.occurredAt, new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000)),
      ),
    )
    .orderBy(desc(charges.occurredAt));

  return rows
    .filter((r) => {
      const day = dayOfInstant(query.timezone, r.charge.occurredAt);
      return day >= from && day < to && isProtectionEvent(r.charge);
    })
    .map((r) => toLedgerRow(r, query.timezone));
}

/** Every row, ignoring the month — the "all time" total on the dashboard. */
export async function allLedgerRows(stylistId: string, timezone: string): Promise<LedgerRow[]> {
  const db = getDb();
  const rows = await db
    .select({ charge: charges, appointment: appointments, client: clients, service: services })
    .from(charges)
    .innerJoin(appointments, eq(appointments.id, charges.appointmentId))
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(appointments.stylistId, stylistId))
    .orderBy(desc(charges.occurredAt));
  return rows.filter((r) => isProtectionEvent(r.charge)).map((r) => toLedgerRow(r, timezone));
}

/**
 * Is this charge row a protection event?
 *
 * A deposit only becomes one when the appointment did not happen and it was kept
 * (`captured`) or handed back (`refunded`). `charged` and `held` deposits belong to services,
 * not to the policy.
 */
function isProtectionEvent(charge: typeof charges.$inferSelect): boolean {
  if (charge.kind !== "deposit") return true;
  return charge.status === "captured" || charge.status === "refunded";
}

function toLedgerRow(
  r: {
    charge: typeof charges.$inferSelect;
    appointment: typeof appointments.$inferSelect;
    client: typeof clients.$inferSelect;
    service: typeof services.$inferSelect;
  },
  timezone: string,
): LedgerRow {
  return {
    id: r.charge.id,
    kind: r.charge.kind as ChargeKind,
    status: r.charge.status as ChargeStatus,
    amountCents: r.charge.amountCents,
    depositAppliedCents: r.charge.depositAppliedCents,
    policyVersion: r.charge.policyVersion,
    policyAgreedOn: dayOfInstant(timezone, r.appointment.policyAgreedAt),
    occurredOn: dayOfInstant(timezone, r.charge.occurredAt),
    clientName: `${r.client.firstName} ${r.client.lastName ?? ""}`.trim(),
    serviceName: r.service.name,
    failureReason: r.charge.failureReason,
    simulated: r.charge.simulated,
  };
}

/** The failed fees a stylist may still want to chase, newest first. */
export async function failedFees(stylistId: string) {
  const db = getDb();
  return db
    .select({ charge: charges, appointment: appointments, client: clients, service: services })
    .from(charges)
    .innerJoin(appointments, eq(appointments.id, charges.appointmentId))
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.stylistId, stylistId),
        eq(charges.status, "failed"),
        inArray(charges.kind, ["no_show_fee", "late_cancel_fee"]),
      ),
    )
    .orderBy(desc(charges.occurredAt));
}
