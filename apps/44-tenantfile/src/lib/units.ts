/**
 * Properties, units, and tenancies the landlord manages by hand.
 *
 * Two paths create a tenancy: approving an application (src/lib/applications.ts)
 * and `importTenancy` here. The second one matters more than it looks — ROADMAP
 * calls a mid-lease start "the common case", and a landlord with three occupied
 * units has nothing to gain from a product that only understands tenancies that
 * began inside it. Importing backdates the ledger honestly: charges are generated
 * from the real start date, and the landlord records what has already been paid.
 */

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  landlords,
  properties,
  tenancies,
  units,
  type Property,
  type Tenancy,
  type Unit,
} from "@/db/schema";
import { canAddUnit } from "@/lib/plans";
import { countUnits, ensureCharges, upsertLateFeeRule } from "@/lib/ledger";
import { stitch } from "@/lib/file-events";
import { newToken } from "@/lib/links";
import { audit } from "@/lib/audit";
import { formatMoney, isIsoDate, parseMoneyToCents, type IsoDate } from "@/lib/money";
import { STATE_LATE_FEE_RULES } from "@/lib/state-rules";

const STATES = Object.keys(STATE_LATE_FEE_RULES);

export const propertyInput = z.object({
  address: z.string().trim().min(5, "Enter the street address").max(200),
  city: z.string().trim().min(1, "Enter the city").max(80),
  state: z
    .string()
    .trim()
    .length(2, "Use the two-letter state code")
    .transform((s) => s.toUpperCase()),
  postalCode: z.string().trim().max(12).default(""),
  type: z.enum(["single", "multi"]).default("single"),
});

export const unitInput = z.object({
  label: z.string().trim().min(1, "Give the unit a label, like 2B or Whole house").max(40),
  beds: z.coerce.number().int().min(0).max(12),
  baths: z.coerce.number().int().min(0).max(12),
  sqft: z.coerce.number().int().min(0).max(20_000).optional(),
  rent: z.string().trim().min(1, "Enter the monthly rent"),
  deposit: z.string().trim().default("0"),
});

export type PropertyInput = z.infer<typeof propertyInput>;
export type UnitInput = z.infer<typeof unitInput>;

export function knownStates(): string[] {
  return STATES;
}

export async function createProperty(
  landlordId: string,
  input: PropertyInput,
  actor: string,
): Promise<Property> {
  const [property] = await getDb()
    .insert(properties)
    .values({ landlordId, ...input })
    .returning();
  await audit(landlordId, actor, "property.create", property.id, { address: property.address });
  return property;
}

export async function createUnit(
  landlordId: string,
  planId: Parameters<typeof canAddUnit>[0],
  propertyId: string,
  input: UnitInput,
  actor: string,
): Promise<Unit> {
  const db = getDb();
  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.landlordId, landlordId)));
  if (!property) throw new Error("No such property");

  const gate = canAddUnit(planId, await countUnits(landlordId));
  if (!gate.allowed) throw new Error(gate.reason ?? "Your plan is full");

  const [unit] = await db
    .insert(units)
    .values({
      propertyId,
      label: input.label,
      beds: input.beds,
      baths: input.baths,
      sqft: input.sqft ?? null,
      rentCents: parseMoneyToCents(input.rent),
      depositCents: input.deposit ? parseMoneyToCents(input.deposit) : 0,
      status: "vacant",
    })
    .returning();

  await audit(landlordId, actor, "unit.create", unit.id, { label: unit.label, rentCents: unit.rentCents });
  return unit;
}

export async function landlordProperties(landlordId: string) {
  const db = getDb();
  const props = await db
    .select()
    .from(properties)
    .where(eq(properties.landlordId, landlordId))
    .orderBy(asc(properties.address));
  if (props.length === 0) return [];
  const allUnits = await db.select().from(units).orderBy(asc(units.label));
  return props.map((property) => ({
    property,
    units: allUnits.filter((u) => u.propertyId === property.id),
  }));
}

export async function landlordUnit(landlordId: string, unitId: string) {
  const db = getDb();
  const [row] = await db
    .select({ unit: units, property: properties })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(units.id, unitId), eq(properties.landlordId, landlordId)));
  return row ?? null;
}

/* --------------------------------------------------------------- tenancies --- */

export const tenancyInput = z.object({
  tenantNames: z.string().trim().min(2, "Who is renting it?").max(200),
  tenantEmails: z.string().trim().default(""),
  tenantPhones: z.string().trim().default(""),
  startsOn: z.string().refine(isIsoDate, "Pick the date the tenancy started"),
  endsOn: z.string().default(""),
  rent: z.string().trim().min(1, "Enter the monthly rent"),
  deposit: z.string().trim().default("0"),
  rentDueDay: z.coerce.number().int().min(1).max(31).default(1),
  prorateFirstMonth: z.coerce.boolean().default(true),
  prorateLastMonth: z.coerce.boolean().default(true),
});

export type TenancyInput = z.infer<typeof tenancyInput>;

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Bring an existing tenancy in. It starts **active** — there is nothing to sign,
 * the tenants already live there — and its charges are generated from the real
 * start date so the ledger matches what the landlord has been collecting.
 */
export async function importTenancy(
  landlordId: string,
  unitId: string,
  input: TenancyInput,
  actor: string,
): Promise<Tenancy> {
  const db = getDb();
  const owned = await landlordUnit(landlordId, unitId);
  if (!owned) throw new Error("No such unit");

  const active = await db
    .select()
    .from(tenancies)
    .where(and(eq(tenancies.unitId, unitId), eq(tenancies.status, "active")));
  if (active.length > 0) throw new Error("That unit already has an active tenancy");

  const endsOn = input.endsOn && isIsoDate(input.endsOn) ? input.endsOn : null;
  if (endsOn && endsOn <= input.startsOn) throw new Error("The end date has to be after the start date");

  const [tenancy] = await db
    .insert(tenancies)
    .values({
      unitId,
      tenantNames: splitList(input.tenantNames),
      tenantEmails: splitList(input.tenantEmails).map((e) => e.toLowerCase()),
      tenantPhones: splitList(input.tenantPhones),
      startsOn: input.startsOn,
      endsOn,
      rentCents: parseMoneyToCents(input.rent),
      depositCents: input.deposit ? parseMoneyToCents(input.deposit) : 0,
      rentDueDay: input.rentDueDay,
      prorateFirstMonth: input.prorateFirstMonth,
      prorateLastMonth: input.prorateLastMonth,
      status: "active",
      activatedAt: new Date(),
      portalToken: newToken(),
    })
    .returning();

  await db.update(units).set({ status: "occupied" }).where(eq(units.id, unitId));

  await stitch({
    tenancyId: tenancy.id,
    kind: "note",
    occurredAt: new Date(`${tenancy.startsOn}T12:00:00.000Z`),
    summary: `Tenancy started · ${tenancy.tenantNames.join(", ")}`,
    detail: `${formatMoney(tenancy.rentCents)}/month, imported into TenantFile on ${new Date().toISOString().slice(0, 10)}. Charges before that date were generated from the lease terms, not from bank records — check them against what was actually paid.`,
    dedupeKey: `tenancy-start:${tenancy.id}`,
  });

  // A default late-fee rule, disabled until the landlord has seen their state's
  // guidance and acknowledged it. Silently enabling a fee would be indefensible.
  await upsertLateFeeRule(tenancy.id, {
    graceDays: 5,
    kind: "flat",
    amount: 5_000,
    maxPerMonthCents: null,
    enabled: false,
    stateCapAck: false,
    stateCapNote: "",
  });

  await ensureCharges(tenancy);
  await audit(landlordId, actor, "tenancy.import", tenancy.id, { unitId, startsOn: tenancy.startsOn });
  return tenancy;
}

export async function endTenancy(
  landlordId: string,
  tenancyId: string,
  endsOn: IsoDate,
  actor: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ tenancy: tenancies, unit: units })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(tenancies.id, tenancyId), eq(properties.landlordId, landlordId)));
  if (!row) throw new Error("No such tenancy");

  await db
    .update(tenancies)
    .set({ status: "ended", endsOn, endedAt: new Date() })
    .where(eq(tenancies.id, tenancyId));
  await db.update(units).set({ status: "vacant" }).where(eq(units.id, row.unit.id));

  await stitch({
    tenancyId,
    kind: "note",
    summary: `Tenancy ended ${endsOn}`,
    detail: "The File stays exactly as it is. Nothing about a past tenancy is deleted.",
    dedupeKey: `tenancy-end:${tenancyId}`,
  });
  await audit(landlordId, actor, "tenancy.end", tenancyId, { endsOn });
}

export async function updateTenancyContacts(
  landlordId: string,
  tenancyId: string,
  emails: string,
  phones: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ tenancy: tenancies })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(tenancies.id, tenancyId), eq(properties.landlordId, landlordId)));
  if (!row) throw new Error("No such tenancy");
  await db
    .update(tenancies)
    .set({
      tenantEmails: splitList(emails).map((e) => e.toLowerCase()),
      tenantPhones: splitList(phones),
    })
    .where(eq(tenancies.id, tenancyId));
}

export async function landlordName(landlordId: string): Promise<string> {
  const [row] = await getDb().select().from(landlords).where(eq(landlords.id, landlordId));
  return row?.name ?? "Your landlord";
}
