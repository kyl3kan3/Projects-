/**
 * Rate management.
 *
 * Two different things share this file because owners think of them together:
 *
 *  - **Street rates** — what a size is advertised at. Editing one changes the rate
 *    a *new* move-in is quoted; it never touches a live tenancy, because a rate on
 *    a signed agreement is a term of that agreement.
 *  - **Existing-tenant increases** — which need notice. The effective date is
 *    validated against the state's notice period, the letter is generated, and the
 *    change is only applied on the effective date by the nightly pass. A rate
 *    increase applied the day it was entered is an increase with no notice, which
 *    is the thing this feature exists to prevent.
 */

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  facilities,
  rateChanges,
  tenancies,
  units,
  type RateChange,
  type Unit,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { rateChangeNoticeDays } from "@/lib/lien-rules";
import { addDays, type IsoDate } from "@/lib/money";
import { squareFeet } from "@/lib/units";

export interface StreetRateRow {
  size: string;
  squareFeet: number;
  unitCount: number;
  vacantCount: number;
  /** The street rate: what vacant units of this size are set to. */
  streetRateCents: number | null;
  /** Range of rates actually being paid by live tenancies of this size. */
  occupiedLowCents: number | null;
  occupiedHighCents: number | null;
}

export async function streetRateRows(facilityId: string): Promise<StreetRateRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      unit: units,
      tenancyRate: tenancies.rateCents,
      tenancyEnded: tenancies.endedOn,
    })
    .from(units)
    .leftJoin(tenancies, and(eq(tenancies.unitId, units.id), eq(tenancies.status, "active")))
    .where(eq(units.facilityId, facilityId))
    .orderBy(asc(units.label));

  const bySize = new Map<string, StreetRateRow>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.unit.id) && !row.tenancyRate) continue;
    seen.add(row.unit.id);
    const size = row.unit.size;
    let entry = bySize.get(size);
    if (!entry) {
      entry = {
        size,
        squareFeet: squareFeet(size),
        unitCount: 0,
        vacantCount: 0,
        streetRateCents: null,
        occupiedLowCents: null,
        occupiedHighCents: null,
      };
      bySize.set(size, entry);
    }
    entry.unitCount += 1;
    const live = row.tenancyRate !== null && row.tenancyEnded === null;
    if (live) {
      entry.occupiedLowCents =
        entry.occupiedLowCents === null
          ? row.tenancyRate
          : Math.min(entry.occupiedLowCents, row.tenancyRate!);
      entry.occupiedHighCents =
        entry.occupiedHighCents === null
          ? row.tenancyRate
          : Math.max(entry.occupiedHighCents, row.tenancyRate!);
    } else {
      entry.vacantCount += 1;
      entry.streetRateCents =
        entry.streetRateCents === null
          ? row.unit.monthlyRateCents
          : Math.max(entry.streetRateCents, row.unit.monthlyRateCents);
    }
  }

  return [...bySize.values()].sort((a, b) => a.squareFeet - b.squareFeet || a.size.localeCompare(b.size));
}

/** Set the street rate for one size. Live tenancies are untouched, by design. */
export async function setStreetRate(
  ownerId: string,
  actor: string,
  facilityId: string,
  size: string,
  rateCents: number,
): Promise<number> {
  if (!Number.isInteger(rateCents) || rateCents <= 0) throw new Error("Enter a monthly rate");
  const updated = await getDb()
    .update(units)
    .set({ monthlyRateCents: rateCents, updatedAt: new Date() })
    .where(and(eq(units.facilityId, facilityId), eq(units.size, size)))
    .returning({ id: units.id });
  await audit(ownerId, actor, "rates.street_rate_set", facilityId, { size, rateCents });
  return updated.length;
}

export class RateNoticeError extends Error {}

export interface ProposedChange {
  unit: Unit;
  tenancyId: string;
  oldCents: number;
  newCents: number;
  effectiveOn: IsoDate;
  noticeDays: number;
  earliestEffectiveOn: IsoDate;
}

/**
 * The earliest date an increase may take effect: today plus the state's notice
 * period. Computed here so the form, the validation and the letter all agree.
 */
export function earliestEffectiveOn(state: string, asOf: IsoDate): IsoDate {
  return addDays(asOf, rateChangeNoticeDays(state));
}

export async function scheduleRateChange(
  ownerId: string,
  actor: string,
  input: {
    unitId: string;
    tenancyId: string;
    state: string;
    oldCents: number;
    newCents: number;
    effectiveOn: IsoDate;
    noticeId: string | null;
    asOf: IsoDate;
  },
): Promise<RateChange> {
  const noticeDays = rateChangeNoticeDays(input.state);
  const earliest = earliestEffectiveOn(input.state, input.asOf);
  if (input.newCents <= 0) throw new RateNoticeError("Enter the new monthly rate");
  if (input.newCents === input.oldCents) throw new RateNoticeError("That is the current rate");
  if (input.newCents > input.oldCents && input.effectiveOn < earliest) {
    throw new RateNoticeError(
      `${input.state.toUpperCase()} needs ${noticeDays} days' notice for an increase — the earliest effective date is ${earliest}.`,
    );
  }
  const [row] = await getDb()
    .insert(rateChanges)
    .values({
      unitId: input.unitId,
      tenancyId: input.tenancyId,
      oldCents: input.oldCents,
      newCents: input.newCents,
      effectiveOn: input.effectiveOn,
      noticeId: input.noticeId,
      status: "noticed",
    })
    .returning();
  await audit(ownerId, actor, "rates.change_noticed", input.tenancyId, {
    oldCents: input.oldCents,
    newCents: input.newCents,
    effectiveOn: input.effectiveOn,
    noticeDays,
  });
  return row;
}

/**
 * Apply every noticed change whose effective date has arrived. Idempotent: the
 * status moves to `applied` in the same statement that reads it, so a second run
 * finds nothing.
 */
export async function applyDueRateChanges(asOf: IsoDate): Promise<number> {
  const db = getDb();
  const due = await db
    .select()
    .from(rateChanges)
    .where(and(eq(rateChanges.status, "noticed"), lte(rateChanges.effectiveOn, asOf)));

  let applied = 0;
  for (const change of due) {
    if (!change.tenancyId) continue;
    const [claimed] = await db
      .update(rateChanges)
      .set({ status: "applied", updatedAt: new Date() })
      .where(and(eq(rateChanges.id, change.id), eq(rateChanges.status, "noticed")))
      .returning({ id: rateChanges.id });
    if (!claimed) continue;
    await db
      .update(tenancies)
      .set({ rateCents: change.newCents, updatedAt: new Date() })
      .where(eq(tenancies.id, change.tenancyId));
    applied += 1;
  }
  return applied;
}

export async function rateChangesFor(ownerId: string): Promise<
  Array<{ change: RateChange; unitLabel: string }>
> {
  const rows = await getDb()
    .select({ change: rateChanges, unitLabel: units.label })
    .from(rateChanges)
    .innerJoin(units, eq(rateChanges.unitId, units.id))
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .where(eq(facilities.ownerId, ownerId))
    .orderBy(asc(rateChanges.effectiveOn));
  return rows;
}

export async function rateChangesForTenancy(tenancyIds: readonly string[]): Promise<RateChange[]> {
  if (tenancyIds.length === 0) return [];
  return getDb()
    .select()
    .from(rateChanges)
    .where(inArray(rateChanges.tenancyId, [...tenancyIds]));
}
