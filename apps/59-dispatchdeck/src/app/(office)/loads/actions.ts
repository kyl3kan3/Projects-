"use server";

/**
 * Server actions for the board and the load detail screen.
 *
 * Every exported function here is a public endpoint, so there is nothing in this
 * file that no screen calls. Each one re-derives the carrier from the session and
 * scopes its query by it — a load id in a form body proves nothing.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { loads, stops, trucks, users } from "@/db/schema";
import type { ActionState } from "@/components/form";
import { requireOffice } from "@/lib/auth";
import { addAccessorial, assignLoad, cancelLoad, createLoad, decideAccessorial } from "@/lib/loads";
import { parseDollarsToCents } from "@/lib/money";
import { planState } from "@/lib/plans";
import { wallTimeToInstant } from "@/lib/tz";
import { isJurisdiction } from "@/lib/jurisdictions";

function fail(message: string): ActionState {
  return { ok: false, message };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

function intOrNull(formData: FormData, key: string): number | null {
  const value = text(formData, key);
  if (value === "") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export async function createLoadAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const { user, carrier } = await requireOffice();
  const state = planState(carrier);
  if (state.readOnly) return fail(state.readOnlyReason ?? "This account is read-only.");

  const rateCents = parseDollarsToCents(text(formData, "rate"));
  if (rateCents === null || rateCents <= 0) {
    return fail("Enter the rate as a dollar figure, e.g. 1850 or 1,850.00.");
  }

  const stopCount = Math.min(6, Math.max(2, Number(formData.get("stopCount") ?? 2)));
  const parsedStops: Parameters<typeof createLoad>[0]["stops"] = [];
  for (let i = 0; i < stopCount; i++) {
    const city = text(formData, `stop${i}City`);
    const stateCode = text(formData, `stop${i}State`).toUpperCase();
    if (city === "" && stateCode === "") continue;
    if (city === "" || stateCode === "") return fail(`Stop ${i + 1} needs a city and a state.`);
    if (!isJurisdiction(stateCode)) {
      return fail(`"${stateCode}" is not a US jurisdiction DispatchDeck knows. Use a two-letter code.`);
    }
    const windowStartRaw = text(formData, `stop${i}WindowStart`);
    const windowEndRaw = text(formData, `stop${i}WindowEnd`);
    parsedStops.push({
      kind: text(formData, `stop${i}Kind`) === "delivery" ? "delivery" : "pickup",
      facility: optional(formData, `stop${i}Facility`),
      address: optional(formData, `stop${i}Address`),
      city,
      state: stateCode,
      windowStart: windowStartRaw ? wallTimeToInstant(windowStartRaw, carrier.timezone) : null,
      windowEnd: windowEndRaw ? wallTimeToInstant(windowEndRaw, carrier.timezone) : null,
      appointmentRef: optional(formData, `stop${i}Ref`),
    });
  }

  let loadId: string;
  try {
    const load = await createLoad(
      {
        carrierId: carrier.id,
        brokerId: optional(formData, "brokerId"),
        truckId: optional(formData, "truckId"),
        driverUserId: optional(formData, "driverUserId"),
        reference: optional(formData, "reference"),
        rateCents,
        totalMiles: intOrNull(formData, "totalMiles"),
        deadheadMiles: intOrNull(formData, "deadheadMiles"),
        equipment: (["van", "reefer", "flatbed", "other"] as const).includes(
          text(formData, "equipment") as "van",
        )
          ? (text(formData, "equipment") as "van")
          : "van",
        notes: optional(formData, "notes"),
        stops: parsedStops,
      },
      user.email,
    );
    loadId = load.id;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create the load.");
  }

  revalidatePath("/loads");
  redirect(`/loads/${loadId}`);
}

export async function assignLoadAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const { user, carrier } = await requireOffice();
  const loadId = text(formData, "loadId");
  const truckId = optional(formData, "truckId");
  const driverUserId = optional(formData, "driverUserId");

  const db = getDb();
  if (truckId) {
    const [truck] = await db
      .select({ id: trucks.id })
      .from(trucks)
      .where(and(eq(trucks.id, truckId), eq(trucks.carrierId, carrier.id)));
    if (!truck) return fail("That truck is not on this account.");
  }
  if (driverUserId) {
    const [driver] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, driverUserId), eq(users.carrierId, carrier.id)));
    if (!driver) return fail("That driver is not on this account.");
  }

  await assignLoad({ carrierId: carrier.id, loadId, truckId, driverUserId, actor: user.email });
  revalidatePath(`/loads/${loadId}`);
  return { ok: true, message: "Assignment saved." };
}

export async function cancelLoadAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const { user, carrier } = await requireOffice();
  const loadId = text(formData, "loadId");
  try {
    await cancelLoad({ carrierId: carrier.id, loadId, actor: user.email });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not cancel the load.");
  }
  revalidatePath(`/loads/${loadId}`);
  revalidatePath("/loads");
  return { ok: true, message: "Load cancelled." };
}

export async function decideAccessorialAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const { user, carrier } = await requireOffice();
  const decision = text(formData, "decision") === "rejected" ? "rejected" : "billed";
  try {
    await decideAccessorial({
      carrierId: carrier.id,
      lineId: text(formData, "lineId"),
      decision,
      actor: user.email,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the line.");
  }
  revalidatePath(`/loads/${text(formData, "loadId")}`);
  return {
    ok: true,
    message:
      decision === "billed"
        ? "Confirmed — it goes on the invoice with its timestamps."
        : "Dismissed. It stays on the record but never reaches the broker.",
  };
}

export async function addAccessorialAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const { user, carrier } = await requireOffice();
  const state = planState(carrier);
  if (state.readOnly) return fail(state.readOnlyReason ?? "This account is read-only.");

  const amountCents = parseDollarsToCents(text(formData, "amount"));
  if (amountCents === null || amountCents <= 0) return fail("Enter the amount as a dollar figure.");
  const kindRaw = text(formData, "kind");
  const kind = (["lumper", "tonu", "layover", "other"] as const).includes(kindRaw as "lumper")
    ? (kindRaw as "lumper")
    : "other";

  const loadId = text(formData, "loadId");
  try {
    await addAccessorial({
      carrierId: carrier.id,
      loadId,
      kind,
      description: text(formData, "description"),
      amountCents,
      actor: user.email,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not add the charge.");
  }
  revalidatePath(`/loads/${loadId}`);
  return { ok: true, message: "Charge added and billable." };
}

/**
 * Correct a stop's stamps from the office. A driver who tapped "arrived" from
 * the truck stop rather than the dock creates a detention figure that would be
 * indefensible in front of a broker, so the office can fix it — and the audit log
 * records who changed what.
 */
export async function correctStampsAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const { user, carrier } = await requireOffice();
  const stopId = text(formData, "stopId");
  const loadId = text(formData, "loadId");

  const db = getDb();
  const [row] = await db
    .select({ stopId: stops.id })
    .from(stops)
    .innerJoin(loads, eq(stops.loadId, loads.id))
    .where(and(eq(stops.id, stopId), eq(loads.carrierId, carrier.id)));
  if (!row) return fail("That stop is not on this account.");

  const arrivedRaw = text(formData, "arrivedAt");
  const departedRaw = text(formData, "departedAt");
  const arrivedAt = arrivedRaw ? wallTimeToInstant(arrivedRaw, carrier.timezone) : null;
  const departedAt = departedRaw ? wallTimeToInstant(departedRaw, carrier.timezone) : null;
  if (arrivedRaw && !arrivedAt) return fail("That arrival time could not be read.");
  if (departedRaw && !departedAt) return fail("That departure time could not be read.");
  if (arrivedAt && departedAt && departedAt < arrivedAt) {
    return fail("The departure cannot be before the arrival.");
  }

  await db.update(stops).set({ arrivedAt, departedAt, updatedAt: new Date() }).where(eq(stops.id, stopId));

  // The detention line is recomputed from the corrected stamps straight away.
  const { settleDetentionForStop } = await import("@/lib/detention");
  await settleDetentionForStop(stopId);

  const { audit } = await import("@/lib/audit");
  await audit({
    carrierId: carrier.id,
    actor: user.email,
    action: "stop.stamps_corrected",
    target: stopId,
    metadata: { arrivedAt: arrivedAt?.toISOString() ?? null, departedAt: departedAt?.toISOString() ?? null },
  });

  revalidatePath(`/loads/${loadId}`);
  return { ok: true, message: "Stamps corrected. The detention figure was recalculated." };
}
