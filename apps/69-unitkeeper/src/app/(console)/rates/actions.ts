"use server";

/**
 * Rate actions. A street-rate edit is bookkeeping; an existing tenant's increase is
 * a notice with a date, so it generates the letter and schedules the change rather
 * than applying it.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rateChanges } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { renderRateChangeLetter } from "@/lib/docs";
import { field, formError, formOk, type FormState } from "@/lib/form";
import { rateChangeNoticeDays } from "@/lib/lien-rules";
import { isIsoDate, isoDateOf, parseMoneyToCents } from "@/lib/money";
import { earliestEffectiveOn, RateNoticeError, scheduleRateChange, setStreetRate } from "@/lib/rates";
import { ownedTenancy } from "@/lib/tenancy";
import { facilityFor } from "@/lib/units";

export async function setStreetRateAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  if (ent.locked) return formError(ent.lockReason ?? "Your plan is not active");
  const facility = await facilityFor(owner.id, field(form, "facilityId"));
  if (!facility) return formError("That facility is not yours");
  const size = field(form, "size");

  let rateCents: number;
  try {
    rateCents = parseMoneyToCents(field(form, "rate"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Enter the street rate");
  }

  const updated = await setStreetRate(owner.id, owner.email, facility.id, size, rateCents);
  revalidatePath("/rates");
  revalidatePath("/map");
  return formOk(
    `${size} street rate set on ${updated} unit${updated === 1 ? "" : "s"}. Live tenancies keep the rate they signed.`,
  );
}

export async function scheduleRateChangeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  if (ent.locked) return formError(ent.lockReason ?? "Your plan is not active");
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");

  const asOf = isoDateOf(new Date());
  const effectiveOn = field(form, "effectiveOn") || earliestEffectiveOn(ctx.facility.state, asOf);
  if (!isIsoDate(effectiveOn)) return formError("Enter the effective date as YYYY-MM-DD");

  let newCents: number;
  try {
    newCents = parseMoneyToCents(field(form, "newRate"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Enter the new monthly rate");
  }

  const noticeDays = rateChangeNoticeDays(ctx.facility.state);
  try {
    // The letter first: a scheduled change with no letter is a change with no notice.
    const { noticeId } = await renderRateChangeLetter(
      ctx,
      ctx.tenancy.rateCents,
      newCents,
      effectiveOn,
      noticeDays,
    );
    const change = await scheduleRateChange(owner.id, owner.email, {
      unitId: ctx.unit.id,
      tenancyId: ctx.tenancy.id,
      state: ctx.facility.state,
      oldCents: ctx.tenancy.rateCents,
      newCents,
      effectiveOn,
      noticeId,
      asOf,
    });
    revalidatePath("/rates");
    return formOk(
      `Letter generated and the change is scheduled for ${change.effectiveOn}. It applies on that date, not today.`,
    );
  } catch (err) {
    if (err instanceof RateNoticeError) return formError(err.message);
    return formError(err instanceof Error ? err.message : "Could not schedule the change");
  }
}

/** Cancel a scheduled change that has not taken effect. */
export async function cancelRateChangeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { owner } = await requireOwner();
  const changeId = field(form, "changeId");
  const [change] = await getDb().select().from(rateChanges).where(eq(rateChanges.id, changeId));
  if (!change || !change.tenancyId) return formError("That change no longer exists");
  const ctx = await ownedTenancy(owner.id, change.tenancyId);
  if (!ctx) return formError("That change is not yours");
  if (change.status !== "noticed") return formError("That change has already been applied");

  await getDb().delete(rateChanges).where(eq(rateChanges.id, changeId));
  revalidatePath("/rates");
  return formOk("Scheduled change cancelled. The letter stays in the tenant's documents.");
}
