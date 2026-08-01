"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { volunteerClaims, volunteerSlots } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import { sendAnnouncement } from "@/lib/comms";
import { getCurrentSeason } from "@/lib/registration";
import { createSlot, deleteSlot, markNoShow, unfilledSlots } from "@/lib/volunteers";
import { wallTimeToInstant } from "@/lib/time";

function actorOf(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  return { kind: "user" as const, id: ctx.user.id, name: ctx.user.name };
}

export async function createSlotAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const season = await getCurrentSeason(ctx.club.id);
  if (!season) return { error: "Open a season first" };

  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date" };
  if (!/^\d{1,2}:\d{2}/.test(time)) return { error: "Pick a start time" };
  const capacity = Number(form.get("capacity") ?? 1);

  try {
    await createSlot({
      clubId: ctx.club.id,
      seasonId: season.id,
      gameId: String(form.get("gameId") ?? "") || null,
      eventLabel: String(form.get("eventLabel") ?? "") || null,
      startsAt: wallTimeToInstant(date, time, ctx.club.timezone),
      role: String(form.get("role") ?? ""),
      capacity: Number.isInteger(capacity) && capacity > 0 ? capacity : 1,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that slot" };
  }
  revalidatePath("/volunteers");
  return { ok: "Slot added. Families can claim it from their own page — no login." };
}

export async function deleteSlotAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const slotId = String(form.get("slotId") ?? "");
  const [slot] = await getDb().select().from(volunteerSlots).where(eq(volunteerSlots.id, slotId));
  if (!slot || slot.clubId !== ctx.club.id) return { error: "That slot is not in your club" };
  await deleteSlot(slotId);
  revalidatePath("/volunteers");
  return { ok: "Slot removed." };
}

export async function noShowAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const claimId = String(form.get("claimId") ?? "");
  const [row] = await getDb()
    .select({ claim: volunteerClaims, slot: volunteerSlots })
    .from(volunteerClaims)
    .innerJoin(volunteerSlots, eq(volunteerSlots.id, volunteerClaims.slotId))
    .where(and(eq(volunteerClaims.id, claimId), eq(volunteerSlots.clubId, ctx.club.id)));
  if (!row) return { error: "That claim is not in your club" };
  await markNoShow(claimId, actorOf(ctx), ctx.club.id);
  revalidatePath("/volunteers");
  return { ok: "Marked. It is on the record for next season's rota." };
}

/**
 * Nudge the families who have not volunteered at all this season about the slots
 * still open in the next week. Deliberately not everyone: the family who already
 * did three shifts should not be asked again first.
 */
export async function nudgeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("send_comms");
  const season = await getCurrentSeason(ctx.club.id);
  if (!season) return { error: "Open a season first" };
  void form;

  const open = await unfilledSlots(season.id);
  if (open.length === 0) return { error: "Every slot in the next week is filled — nothing to ask for" };

  try {
    const summary = await sendAnnouncement({
      clubId: ctx.club.id,
      seasonId: season.id,
      audience: { kind: "club" },
      subject: `${open.length} volunteer slot${open.length === 1 ? "" : "s"} still open this week`,
      body: [
        `We are short of hands for ${open.length} slot${open.length === 1 ? "" : "s"} this week:`,
        open
          .slice(0, 10)
          .map((s) => `· ${s.when} — ${s.label} (${s.spotsLeft} of ${s.slot.capacity} open)`)
          .join("\n"),
        "Open your family page and tap Claim. It takes one tap and there is nothing to install.",
      ].join("\n\n"),
      channels: ["email"],
      purpose: "volunteer_nudge",
      actor: actorOf(ctx),
      smsBudget: ctx.settings.smsMonthlyBudget,
    });
    revalidatePath("/comms");
    return {
      ok: `Asked ${summary.emailsSent} famil${summary.emailsSent === 1 ? "y" : "ies"}${summary.simulated ? " (simulated — DRY_RUN is on)" : ""}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the nudge" };
  }
}
