/**
 * Occupancy and revenue — "plain numbers; no dashboard theater" (README).
 *
 * Three figures an owner actually uses: how full the yard is by size, what it
 * bills in a month, and how much of that is not arriving. Every one is computed
 * from the same live data the map draws from, so the header line on the map and the
 * report can never disagree.
 *
 * Monthly revenue is the sum of the *agreed* rates on live tenancies, not the
 * street rates and not last month's receipts. It is the answer to "what should
 * land this month", which is the number the delinquency total is subtracted from.
 */

import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { facilities, tenancies, units, type Facility } from "@/db/schema";
import { delinquency } from "@/lib/ledger-core";
import { entriesForMany, toCoreEntries } from "@/lib/ledger";
import { squareFeet } from "@/lib/units";
import type { IsoDate } from "@/lib/money";

export interface SizeRow {
  size: string;
  squareFeet: number;
  total: number;
  occupied: number;
  /** Percent, rounded once, for display only. */
  occupancyPct: number;
  monthlyRevenueCents: number;
}

export interface FacilityReport {
  facility: Facility;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  maintenanceUnits: number;
  occupancyPct: number;
  monthlyRevenueCents: number;
  /** What vacant units would add at their street rate. */
  vacantPotentialCents: number;
  delinquentUnits: number;
  delinquentCents: number;
  sizes: SizeRow[];
}

export async function facilityReport(facility: Facility, asOf: IsoDate): Promise<FacilityReport> {
  const db = getDb();
  const unitRows = await db.select().from(units).where(eq(units.facilityId, facility.id));
  const liveTenancies = await db
    .select()
    .from(tenancies)
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .where(
      and(eq(units.facilityId, facility.id), isNull(tenancies.endedOn), ne(tenancies.status, "ended")),
    );

  const tenancyByUnit = new Map(liveTenancies.map((r) => [r.tenancies.unitId, r.tenancies]));
  const ledgers = await entriesForMany(liveTenancies.map((r) => r.tenancies.id));

  const sizes = new Map<string, SizeRow>();
  let occupied = 0;
  let maintenance = 0;
  let monthlyRevenueCents = 0;
  let vacantPotentialCents = 0;
  let delinquentUnits = 0;
  let delinquentCents = 0;

  for (const unit of unitRows) {
    const row =
      sizes.get(unit.size) ??
      {
        size: unit.size,
        squareFeet: squareFeet(unit.size),
        total: 0,
        occupied: 0,
        occupancyPct: 0,
        monthlyRevenueCents: 0,
      };
    row.total += 1;

    const tenancy = tenancyByUnit.get(unit.id);
    if (tenancy) {
      occupied += 1;
      row.occupied += 1;
      row.monthlyRevenueCents += tenancy.rateCents;
      monthlyRevenueCents += tenancy.rateCents;
      const delq = delinquency(toCoreEntries(ledgers.get(tenancy.id) ?? []), asOf);
      if (delq.since !== null && delq.outstandingCents > 0) {
        delinquentUnits += 1;
        delinquentCents += delq.outstandingCents;
      }
    } else if (unit.status === "maintenance") {
      maintenance += 1;
    } else {
      vacantPotentialCents += unit.monthlyRateCents;
    }
    sizes.set(unit.size, row);
  }

  for (const row of sizes.values()) {
    row.occupancyPct = row.total === 0 ? 0 : Math.round((row.occupied / row.total) * 100);
  }

  const rentable = unitRows.length - maintenance;
  return {
    facility,
    totalUnits: unitRows.length,
    occupiedUnits: occupied,
    vacantUnits: unitRows.length - occupied - maintenance,
    maintenanceUnits: maintenance,
    occupancyPct: rentable === 0 ? 0 : Math.round((occupied / rentable) * 100),
    monthlyRevenueCents,
    vacantPotentialCents,
    delinquentUnits,
    delinquentCents,
    sizes: [...sizes.values()].sort(
      (a, b) => a.squareFeet - b.squareFeet || a.size.localeCompare(b.size),
    ),
  };
}

export async function reportsFor(ownerId: string, asOf: IsoDate): Promise<FacilityReport[]> {
  const facilityRows = await getDb()
    .select()
    .from(facilities)
    .where(eq(facilities.ownerId, ownerId))
    .orderBy(facilities.createdAt);
  const out: FacilityReport[] = [];
  for (const facility of facilityRows) out.push(await facilityReport(facility, asOf));
  return out;
}

/** The map header line: "142 of 160 — $18,420/mo". */
export function occupancyLine(report: {
  occupiedUnits: number;
  totalUnits: number;
  monthlyRevenueCents: number;
}): { left: string; right: string } {
  const dollars = Math.round(report.monthlyRevenueCents / 100).toLocaleString("en-US");
  return {
    left: `${report.occupiedUnits} of ${report.totalUnits}`,
    right: `$${dollars}/mo`,
  };
}
