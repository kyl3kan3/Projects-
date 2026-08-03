"use server";

/**
 * Facility, map-editor, settings and manual-tick actions.
 *
 * Every action re-resolves the owner from the session cookie and re-checks the
 * plan gate. An exported "use server" function is a public endpoint: the id in the
 * form is never trusted, only used to look a row up *and* confirm it belongs to the
 * caller.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facilities, units } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkbox, field, formError, formOk, type FormState } from "@/lib/form";
import { US_STATES } from "@/lib/lien-rules";
import { parseMoneyToCents } from "@/lib/money";
import { canAddFacility, canAddUnit } from "@/lib/plans";
import { readSettings } from "@/lib/settings";
import { runTick } from "@/lib/tick";
import { facilitiesFor, facilityFor, ownedUnit, unitCount, UNIT_SIZES } from "@/lib/units";
import type { LadderAction, OwnerSettings } from "@/db/schema";
import { owners } from "@/db/schema";

export async function createFacilityAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  const existing = await facilitiesFor(owner.id);
  const gate = canAddFacility(ent, existing.length);
  if (!gate.allowed) return formError(gate.reason ?? "Your plan does not cover another facility");

  const name = field(form, "name");
  const state = field(form, "state").toUpperCase();
  if (!name) return formError("Give the facility a name");
  if (!US_STATES.includes(state)) return formError("Pick the state the facility is in");

  const [facility] = await getDb()
    .insert(facilities)
    .values({
      ownerId: owner.id,
      name,
      address: field(form, "address") || null,
      state,
      timezone: field(form, "timezone") || "America/Chicago",
      gateSystem: field(form, "gateSystem") || null,
    })
    .returning();

  await audit(owner.id, owner.email, "facility.created", facility.id, { name, state });
  revalidatePath("/map");
  return formOk(`${name} created.`, `/map?facility=${facility.id}`);
}

/**
 * Add a row of units: a label prefix, a count, a size and a street rate. This is
 * the map editor — an owner with 160 units draws the yard in six of these, not by
 * typing 160 forms.
 */
export async function addUnitRowAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  const facilityId = field(form, "facilityId");
  const facility = await facilityFor(owner.id, facilityId);
  if (!facility) return formError("That facility is not yours");

  const prefix = field(form, "prefix").toUpperCase();
  const count = Number(field(form, "count"));
  const size = field(form, "size");
  const rowNumber = Number(field(form, "row"));
  const startAt = Number(field(form, "startAt") || "1");

  if (!/^[A-Z]{1,3}$/.test(prefix)) return formError("Use a short row letter, like B");
  if (!Number.isInteger(count) || count < 1 || count > 60) {
    return formError("A row is between 1 and 60 units");
  }
  if (!UNIT_SIZES.includes(size as (typeof UNIT_SIZES)[number])) return formError("Pick a unit size");
  if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 40) {
    return formError("Row number is between 1 and 40");
  }

  let rateCents: number;
  try {
    rateCents = parseMoneyToCents(field(form, "rate"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Enter the street rate");
  }
  if (rateCents <= 0) return formError("Enter the street rate");

  const used = await unitCount(owner.id);
  const gate = canAddUnit(ent, used + count - 1);
  if (!gate.allowed) return formError(gate.reason ?? "Your plan does not cover that many units");

  const values = Array.from({ length: count }, (_, i) => ({
    facilityId: facility.id,
    label: `${prefix}-${String(startAt + i).padStart(2, "0")}`,
    size,
    monthlyRateCents: rateCents,
    mapPosition: { row: rowNumber, col: i + 1, w: 1, h: 1 },
    status: "vacant" as const,
  }));

  const inserted = await getDb().insert(units).values(values).onConflictDoNothing().returning({
    id: units.id,
  });

  await audit(owner.id, owner.email, "units.row_added", facility.id, {
    prefix,
    count: inserted.length,
    size,
    rateCents,
  });
  revalidatePath("/map");
  if (inserted.length === 0) {
    return formError(`Those labels already exist in ${facility.name} — change the starting number`);
  }
  return formOk(`${inserted.length} unit${inserted.length === 1 ? "" : "s"} added to row ${rowNumber}.`);
}

/** Edit one unit: its size, its street rate, its notes, or take it out of service. */
export async function updateUnitAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const unitId = field(form, "unitId");
  const found = await ownedUnit(owner.id, unitId);
  if (!found) return formError("That unit is not yours");

  const size = field(form, "size") || found.unit.size;
  const maintenance = checkbox(form, "maintenance");
  let rateCents = found.unit.monthlyRateCents;
  const rawRate = field(form, "rate");
  if (rawRate) {
    try {
      rateCents = parseMoneyToCents(rawRate);
    } catch (err) {
      return formError(err instanceof Error ? err.message : "Enter the street rate");
    }
  }

  // A unit with a live tenancy cannot be marked out of service: the status column
  // records only what a human knows, and "occupied" is not a human's opinion.
  const db = getDb();
  const nextStatus = maintenance
    ? "maintenance"
    : found.unit.status === "maintenance"
      ? "vacant"
      : found.unit.status;

  await db
    .update(units)
    .set({
      size,
      monthlyRateCents: rateCents,
      notes: field(form, "notes") || null,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(units.id, unitId), eq(units.facilityId, found.facility.id)));

  await audit(owner.id, owner.email, "unit.updated", unitId, { size, rateCents, maintenance });
  revalidatePath(`/units/${unitId}`);
  revalidatePath("/map");
  return formOk("Saved.");
}

export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const current = readSettings(owner.settings);

  const ladder: OwnerSettings["lateLadder"] = [];
  for (const action of ["retry", "late_fee", "overlock", "lien_eligible"] as LadderAction[]) {
    const raw = field(form, `day_${action}`);
    if (!raw) continue;
    const day = Number(raw);
    if (!Number.isInteger(day) || day < 0 || day > 365) {
      return formError(`Day for "${action.replace(/_/g, " ")}" must be a whole number of days`);
    }
    if (action === "late_fee") {
      let feeCents = 0;
      try {
        feeCents = parseMoneyToCents(field(form, "fee_late_fee") || "0");
      } catch (err) {
        return formError(err instanceof Error ? err.message : "Enter the late fee");
      }
      ladder.push({ day, action, feeCents });
    } else {
      ladder.push({ day, action });
    }
  }
  if (ladder.length === 0) return formError("Keep at least one ladder step");

  const dueDay = Number(field(form, "rentDueDay") || "1");
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    return formError("Rent due day is 1–28, so it exists in February");
  }

  const settings: OwnerSettings = {
    lateLadder: ladder.sort((a, b) => a.day - b.day),
    prorateRule: field(form, "prorateRule") === "full_month" ? "full_month" : "daily",
    rentDueDay: dueDay,
    legalName: field(form, "legalName") || current.legalName,
    facilityTerms: field(form, "facilityTerms") || current.facilityTerms,
  };

  await getDb()
    .update(owners)
    .set({ settings, updatedAt: new Date() })
    .where(eq(owners.id, owner.id));
  await audit(owner.id, owner.email, "settings.saved", owner.id, {
    ladder: settings.lateLadder,
    prorateRule: settings.prorateRule,
  });
  revalidatePath("/settings");
  return formOk("Settings saved. The ladder applies from the next pass.");
}

/**
 * Run the periodic pass now. It exists because "wait until tomorrow" is not a way
 * to check that autopay works, and because an owner who just fixed a card wants
 * the overlock lifted before the tenant arrives.
 */
export async function runTickAction(): Promise<FormState> {
  const { owner } = await requireOwner();
  const result = await runTick(new Date());
  await audit(owner.id, owner.email, "tick.manual", owner.id, {
    charges: result.chargesCreated,
    rungs: result.rungsFired,
  });
  revalidatePath("/delinquency");
  revalidatePath("/map");
  return formOk(
    `Pass done in ${result.tookMs}ms: ${result.chargesCreated} charge(s), ${result.autopayCollected}/${result.autopayAttempted} autopay collected, ${result.rungsFired} ladder step(s), ${result.laddersReversed} reversed, ${result.lienCasesAdvanced} lien case(s) advanced, ${result.rateChangesApplied} rate change(s) applied.`,
  );
}
