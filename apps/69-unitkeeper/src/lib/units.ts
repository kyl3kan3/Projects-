/**
 * Facilities, units, and the map's read model.
 *
 * The important decision in this file: **a unit's displayed status is derived, not
 * read from the column.** `units.status` records the two things only a human
 * knows — whether a unit is out for maintenance, and whether it has ever been
 * rented — and everything else (occupied / overdue / lien) is computed from the
 * live tenancy, the live ledger and today's date, every time the map is drawn.
 *
 * A stored status column that a nightly job reconciles is how a map ends up
 * showing "Occupied" on a unit 212 days delinquent: the job ran before the
 * payment failed, or did not run at all. The column would be a second source of
 * truth about a question the ledger already answers.
 */

import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  facilities,
  lienCases,
  tenancies,
  tenants,
  units,
  type Facility,
  type Tenancy,
  type Tenant,
  type Unit,
  type UnitStatus,
} from "@/db/schema";
import {
  readPosition,
  squareFeet,
  STATUS_LABEL,
  UNIT_SIZES,
  type MapPosition,
} from "@/lib/unit-shapes";
import { delinquency, type Delinquency } from "@/lib/ledger-core";
import { entriesForMany, toCoreEntries } from "@/lib/ledger";
import { type IsoDate } from "@/lib/money";

/**
 * Re-exported so server code has one import for "units", while client components
 * take the pure list straight from `lib/unit-shapes.ts` and never reach the db.
 */
export { readPosition, squareFeet, STATUS_LABEL, UNIT_SIZES };

/* ------------------------------------------------------------- facilities --- */

export async function facilitiesFor(ownerId: string): Promise<Facility[]> {
  return getDb()
    .select()
    .from(facilities)
    .where(eq(facilities.ownerId, ownerId))
    .orderBy(asc(facilities.createdAt));
}

export async function facilityFor(ownerId: string, facilityId: string): Promise<Facility | null> {
  const [row] = await getDb()
    .select()
    .from(facilities)
    .where(and(eq(facilities.id, facilityId), eq(facilities.ownerId, ownerId)));
  return row ?? null;
}

/* ------------------------------------------------------------------ units --- */

export async function unitsFor(facilityId: string): Promise<Unit[]> {
  return getDb()
    .select()
    .from(units)
    .where(eq(units.facilityId, facilityId))
    .orderBy(asc(units.label));
}

/** Every unit the owner has, across facilities — for plan gating and reports. */
export async function unitCount(ownerId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: units.id })
    .from(units)
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .where(eq(facilities.ownerId, ownerId));
  return rows.length;
}

/** The unit and its facility, scoped to the owner. Null when it is not theirs. */
export async function ownedUnit(
  ownerId: string,
  unitId: string,
): Promise<{ unit: Unit; facility: Facility } | null> {
  const [row] = await getDb()
    .select({ unit: units, facility: facilities })
    .from(units)
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .where(and(eq(units.id, unitId), eq(facilities.ownerId, ownerId)));
  return row ?? null;
}

/* --------------------------------------------------------- derived status --- */

export interface UnitCard {
  unit: Unit;
  position: MapPosition;
  /** Derived as of the moment the map was drawn. */
  status: UnitStatus;
  tenancy: Tenancy | null;
  tenant: Tenant | null;
  delinquency: Delinquency | null;
  /** A tenancy exists but the lease has not been signed yet. */
  awaitingSignature: boolean;
  hasOpenLienCase: boolean;
}

/**
 * The whole map in one pass: three queries, no N+1, and the status of every unit
 * computed from the ledger rather than trusted from a column.
 */
export async function mapCards(facilityId: string, asOf: IsoDate): Promise<UnitCard[]> {
  const db = getDb();
  const unitRows = await unitsFor(facilityId);
  if (unitRows.length === 0) return [];

  const tenancyRows = await db
    .select({ tenancy: tenancies, tenant: tenants })
    .from(tenancies)
    .innerJoin(tenants, eq(tenancies.tenantId, tenants.id))
    .where(
      and(
        inArray(
          tenancies.unitId,
          unitRows.map((u) => u.id),
        ),
        isNull(tenancies.endedOn),
        ne(tenancies.status, "ended"),
      ),
    );

  const byUnit = new Map(tenancyRows.map((r) => [r.tenancy.unitId, r]));
  const tenancyIds = tenancyRows.map((r) => r.tenancy.id);
  const ledgers = await entriesForMany(tenancyIds);
  const openCases = tenancyIds.length
    ? await db
        .select({ tenancyId: lienCases.tenancyId, status: lienCases.status })
        .from(lienCases)
        .where(
          and(
            inArray(lienCases.tenancyId, tenancyIds),
            inArray(lienCases.status, ["open", "paused", "sale_eligible"]),
          ),
        )
    : [];
  const lienTenancies = new Set(openCases.map((c) => c.tenancyId));

  return unitRows.map((unit) => {
    const found = byUnit.get(unit.id) ?? null;
    const tenancy = found?.tenancy ?? null;
    const tenant = found?.tenant ?? null;
    const delq = tenancy ? delinquency(toCoreEntries(ledgers.get(tenancy.id) ?? []), asOf) : null;
    const hasOpenLienCase = tenancy ? lienTenancies.has(tenancy.id) : false;

    let status: UnitStatus;
    if (unit.status === "maintenance") status = "maintenance";
    else if (!tenancy) status = "vacant";
    else if (hasOpenLienCase) status = "lien";
    else if (delq && delq.since !== null && delq.outstandingCents > 0) status = "overdue";
    else status = "occupied";

    return {
      unit,
      position: readPosition(unit.mapPosition),
      status,
      tenancy,
      tenant,
      delinquency: delq,
      awaitingSignature: Boolean(tenancy && !tenancy.signedAt),
      hasOpenLienCase,
    };
  });
}

/** The active tenancy on a unit, with its tenant. */
export async function activeTenancyForUnit(
  unitId: string,
): Promise<{ tenancy: Tenancy; tenant: Tenant } | null> {
  const [row] = await getDb()
    .select({ tenancy: tenancies, tenant: tenants })
    .from(tenancies)
    .innerJoin(tenants, eq(tenancies.tenantId, tenants.id))
    .where(
      and(eq(tenancies.unitId, unitId), isNull(tenancies.endedOn), ne(tenancies.status, "ended")),
    );
  return row ?? null;
}

