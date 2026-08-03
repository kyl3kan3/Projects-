/**
 * Tenancies: the move-in flow, the move-out flow, and the context every document
 * and every screen needs.
 *
 * The move-in is four writes, in an order chosen so no step can leave a mess:
 *
 *   1. `startMoveIn`  — tenant + tenancy rows, lease rendered, link minted. The
 *      unit is taken from this moment: an unsigned tenancy still holds the unit,
 *      because two people signing for B-14 is worse than a unit that reads
 *      occupied for an hour.
 *   2. `signLease`    — signature captured, the PDF re-rendered with the signature
 *      block, sha256 taken over the bytes that were signed.
 *   3. `savePaymentMethod` — the vaulted card/ACH on the owner's Connect account.
 *   4. `completeMoveIn` — the prorated first charge posted, collected, and only
 *      then the gate code issued. The code is the last thing, because a gate code
 *      is access and access follows payment.
 *
 * Move-out reverses it: prorate credit, final balance, code revoked, unit vacant,
 * make-ready checklist stored on the tenancy for the next turn.
 */

import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  facilities,
  ledgerEntries,
  lienCases,
  owners,
  tenancies,
  tenants,
  units,
  type Facility,
  type Owner,
  type OwnerSettings,
  type Tenancy,
  type Tenant,
  type Unit,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { issueGateCode, setGateCodeStatus } from "@/lib/gate";
import { balance, post } from "@/lib/ledger";
import { readSettings } from "@/lib/settings";
import {
  formatMoney,
  isoDateOf,
  periodOf,
  prorateFirstMonth,
  prorateLastMonth,
  type IsoDate,
} from "@/lib/money";
import { autopayIdempotencyKey, rentPayments } from "@/lib/payments";

export interface TenancyContext {
  owner: Owner;
  settings: OwnerSettings;
  facility: Facility;
  unit: Unit;
  tenancy: Tenancy;
  tenant: Tenant;
}

/** Everything a document or a tenant page needs, in one query. */
export async function tenancyContext(tenancyId: string): Promise<TenancyContext | null> {
  const [row] = await getDb()
    .select({ owner: owners, facility: facilities, unit: units, tenancy: tenancies, tenant: tenants })
    .from(tenancies)
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .innerJoin(owners, eq(facilities.ownerId, owners.id))
    .innerJoin(tenants, eq(tenancies.tenantId, tenants.id))
    .where(eq(tenancies.id, tenancyId));
  if (!row) return null;
  return { ...row, settings: readSettings(row.owner.settings) };
}

/** The same, but only if it belongs to this owner. */
export async function ownedTenancy(
  ownerId: string,
  tenancyId: string,
): Promise<TenancyContext | null> {
  const ctx = await tenancyContext(tenancyId);
  return ctx && ctx.owner.id === ownerId ? ctx : null;
}

/* ---------------------------------------------------------------- move-in --- */

export interface MoveInInput {
  tenantName: string;
  email: string;
  phone: string;
  /** The legal notice address. Lien mail goes here, so it is required. */
  address: string;
  alternateContact: string;
  rateCents: number;
  startedOn: IsoDate;
}

export class MoveInError extends Error {}

export async function startMoveIn(
  ownerId: string,
  actor: string,
  unit: Unit,
  input: MoveInInput,
): Promise<{ tenancyId: string; tenantId: string }> {
  if (!input.tenantName.trim()) throw new MoveInError("Enter the tenant's name");
  if (!input.address.trim()) {
    throw new MoveInError(
      "A legal notice address is required — every lien notice is mailed to it, and a lien sale without one is not defensible",
    );
  }
  if (!Number.isInteger(input.rateCents) || input.rateCents <= 0) {
    throw new MoveInError("Enter the agreed monthly rate");
  }

  const db = getDb();
  const existing = await db
    .select({ id: tenancies.id })
    .from(tenancies)
    .where(and(eq(tenancies.unitId, unit.id), isNull(tenancies.endedOn), ne(tenancies.status, "ended")));
  if (existing.length > 0) throw new MoveInError("That unit already has a live tenancy");

  const [tenant] = await db
    .insert(tenants)
    .values({
      ownerId,
      name: input.tenantName.trim(),
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      address: input.address.trim(),
      alternateContact: input.alternateContact.trim()
        ? { note: input.alternateContact.trim() }
        : null,
    })
    .returning();

  const [tenancy] = await db
    .insert(tenancies)
    .values({
      unitId: unit.id,
      tenantId: tenant.id,
      rateCents: input.rateCents,
      startedOn: input.startedOn,
      status: "active",
      autopay: true,
    })
    .returning();

  // The unit is taken the moment the paperwork starts.
  await db
    .update(units)
    .set({ status: "occupied", updatedAt: new Date() })
    .where(eq(units.id, unit.id));

  await audit(ownerId, actor, "movein.started", tenancy.id, {
    unit: unit.label,
    tenant: tenant.name,
    rateCents: input.rateCents,
  });

  return { tenancyId: tenancy.id, tenantId: tenant.id };
}

export async function savePaymentMethod(
  tenancyId: string,
  paymentMethodId: string,
): Promise<void> {
  await getDb()
    .update(tenancies)
    .set({ stripePaymentMethodId: paymentMethodId, autopay: true, updatedAt: new Date() })
    .where(eq(tenancies.id, tenancyId));
}

export interface FirstPayment {
  amountCents: number;
  period: string;
  charged: boolean;
  gateCode: string | null;
  message: string;
}

/**
 * The prorated first charge, the collection attempt, and the gate code — in that
 * order, and the code only if the money landed. `method` lets the owner record
 * cash at the counter, which is how half of these move-ins actually happen.
 */
export async function completeMoveIn(
  ctx: TenancyContext,
  actor: string,
  method: "saved" | "cash",
): Promise<FirstPayment> {
  const { tenancy, unit, facility, settings } = ctx;
  if (!tenancy.signedAt) throw new MoveInError("The lease is not signed yet");
  if (tenancy.gateCode) {
    return {
      amountCents: 0,
      period: periodOf(tenancy.startedOn),
      charged: true,
      gateCode: tenancy.gateCode,
      message: "This move-in is already complete.",
    };
  }

  const period = periodOf(tenancy.startedOn);
  const amountCents = prorateFirstMonth(tenancy.rateCents, tenancy.startedOn, settings.prorateRule);

  await post({
    tenancyId: tenancy.id,
    kind: "rent",
    amountCents,
    description:
      settings.prorateRule === "daily"
        ? `Rent ${period} (prorated from ${tenancy.startedOn})`
        : `Rent ${period}`,
    occurredOn: tenancy.startedOn,
    period,
  });

  let collected = false;
  let message: string;
  if (method === "cash") {
    await post({
      tenancyId: tenancy.id,
      kind: "payment",
      amountCents: -amountCents,
      description: `Payment received at the counter — first month`,
      occurredOn: tenancy.startedOn,
    });
    collected = true;
    message = `${formatMoney(amountCents)} recorded as paid at the counter.`;
  } else {
    const outcome = await rentPayments().charge({
      stripeAccountId: ctx.owner.stripeAccountId,
      customerId: ctx.tenant.stripeCustomerId,
      paymentMethodId: tenancy.stripePaymentMethodId,
      amountCents,
      description: `${facility.name} unit ${unit.label} — first month`,
      idempotencyKey: autopayIdempotencyKey(tenancy.id, period),
    });
    if (outcome.ok) {
      await post({
        tenancyId: tenancy.id,
        kind: "payment",
        amountCents: -amountCents,
        description: `Autopay — first month${outcome.simulated ? " (simulated)" : ""}`,
        occurredOn: tenancy.startedOn,
        stripePaymentIntentId: outcome.paymentIntentId,
      });
      collected = true;
      message = `${formatMoney(amountCents)} collected.`;
    } else {
      message = outcome.message;
    }
  }

  if (!collected) {
    return { amountCents, period, charged: false, gateCode: null, message };
  }

  const gateCode = await issueGateCode(facility.id);
  await getDb()
    .update(tenancies)
    .set({ gateCode, gateCodeStatus: "active", paidThrough: period, updatedAt: new Date() })
    .where(eq(tenancies.id, tenancy.id));
  await audit(ctx.owner.id, actor, "movein.completed", tenancy.id, {
    unit: unit.label,
    amountCents,
    gateCode,
  });

  return { amountCents, period, charged: true, gateCode, message };
}

/* --------------------------------------------------------------- move-out --- */

export interface MoveOutResult {
  creditCents: number;
  finalBalanceCents: number;
  refundDueCents: number;
  owedCents: number;
}

/**
 * Final maths, then the unit goes back to vacant.
 *
 * The prorate credit is the part of the last month the tenant paid for and did not
 * use — computed once, posted as a ledger row, never applied as a silent
 * adjustment to an existing charge. A `full_month` facility credits nothing, which
 * is what its lease says.
 */
export async function moveOut(
  ctx: TenancyContext,
  actor: string,
  endedOn: IsoDate,
  makeReady: Record<string, boolean>,
): Promise<MoveOutResult> {
  const { tenancy, unit, settings } = ctx;
  if (tenancy.endedOn) throw new MoveInError("This tenancy has already ended");
  if (endedOn < tenancy.startedOn) throw new MoveInError("Move-out cannot precede move-in");

  const db = getDb();
  const period = periodOf(endedOn);
  const chargedThisPeriod = await db
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenancyId, tenancy.id),
        eq(ledgerEntries.kind, "rent"),
        eq(ledgerEntries.period, period),
      ),
    );

  let creditCents = 0;
  if (chargedThisPeriod.length > 0 && settings.prorateRule === "daily") {
    const used = prorateLastMonth(tenancy.rateCents, endedOn, "daily");
    creditCents = Math.max(0, tenancy.rateCents - used);
    if (creditCents > 0) {
      await post({
        tenancyId: tenancy.id,
        kind: "credit",
        amountCents: -creditCents,
        description: `Move-out credit — unused days after ${endedOn}`,
        occurredOn: endedOn,
      });
    }
  }

  const finalBalanceCents = await balance(tenancy.id);

  await db
    .update(tenancies)
    .set({
      endedOn,
      status: "ended",
      gateCodeStatus: "revoked",
      autopay: false,
      makeReady,
      updatedAt: new Date(),
    })
    .where(eq(tenancies.id, tenancy.id));

  // Any lien case dies with the tenancy: the tenant vacated.
  await db
    .update(lienCases)
    .set({ status: "closed", resolvedReason: "vacated", updatedAt: new Date() })
    .where(and(eq(lienCases.tenancyId, tenancy.id), ne(lienCases.status, "closed")));

  await db
    .update(units)
    .set({ status: "vacant", updatedAt: new Date() })
    .where(eq(units.id, unit.id));

  await setGateCodeStatus(ctx.owner.id, actor, tenancy.id, "revoked");
  await audit(ctx.owner.id, actor, "moveout.completed", tenancy.id, {
    unit: unit.label,
    endedOn,
    creditCents,
    finalBalanceCents,
  });

  return {
    creditCents,
    finalBalanceCents,
    refundDueCents: finalBalanceCents < 0 ? -finalBalanceCents : 0,
    owedCents: finalBalanceCents > 0 ? finalBalanceCents : 0,
  };
}
