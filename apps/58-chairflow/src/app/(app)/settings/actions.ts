"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { policies, services, stylists } from "@/db/schema";
import { requireStylist } from "@/lib/auth";
import { parseWorkingHours, type WorkingHours } from "@/lib/availability";
import { parseSettings } from "@/lib/cadence";
import { checkbox, dollarsToCents, failed, field, intInRange, succeeded, type FormState } from "@/lib/forms";
import { defaultPolicyText } from "@/lib/policy";
import { audit } from "@/server/audit";

/* ---- Services ---------------------------------------------------- */

export type ServiceValues = {
  id: string;
  name: string;
  durationMinutes: string;
  price: string;
  depositKind: string;
  depositValue: string;
};

/**
 * Add or edit a service.
 *
 * The price and the deposit are parsed into integer cents here, once, and refused rather
 * than coerced: a price that silently became zero is a service given away, and a deposit
 * that became NaN is a booking page that throws.
 */
export async function saveServiceAction(
  _prev: FormState<ServiceValues>,
  formData: FormData,
): Promise<FormState<ServiceValues>> {
  const { stylist } = await requireStylist();
  const values: ServiceValues = {
    id: field(formData, "id"),
    name: field(formData, "name"),
    durationMinutes: field(formData, "durationMinutes"),
    price: field(formData, "price"),
    depositKind: field(formData, "depositKind") || "none",
    depositValue: field(formData, "depositValue"),
  };

  if (values.name.length < 2) return failed("Give the service a name.", values);
  const minutes = intInRange(values.durationMinutes, 5, 600);
  if (minutes === null) return failed("How many minutes does it take? Between 5 and 600.", values);
  const priceCents = dollarsToCents(values.price);
  if (priceCents === null || priceCents <= 0) {
    return failed("What do you charge for it? A number like 45 or 45.00.", values);
  }

  let depositRule: Record<string, unknown> = { kind: "none" };
  if (values.depositKind === "flat") {
    const cents = dollarsToCents(values.depositValue);
    if (cents === null || cents <= 0) return failed("How much is the deposit, in dollars?", values);
    if (cents > priceCents) return failed("A deposit cannot be more than the service costs.", values);
    depositRule = { kind: "flat", cents };
  } else if (values.depositKind === "percent") {
    const percent = intInRange(values.depositValue, 1, 100);
    if (percent === null) return failed("The deposit percentage has to be between 1 and 100.", values);
    depositRule = { kind: "percent", percent };
  }

  const db = getDb();
  if (values.id) {
    const [existing] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, values.id), eq(services.stylistId, stylist.id)));
    if (!existing) return failed("That service is not yours.", values);
    await db
      .update(services)
      .set({
        name: values.name,
        durationMinutes: minutes,
        priceCents,
        depositRule,
        updatedAt: new Date(),
      })
      .where(eq(services.id, existing.id));
  } else {
    await db.insert(services).values({
      stylistId: stylist.id,
      name: values.name,
      durationMinutes: minutes,
      priceCents,
      depositRule,
    });
  }

  revalidatePath("/settings/services");
  revalidatePath("/page");
  return succeeded(values.id ? "Saved." : `${values.name} added.`, {
    id: "",
    name: "",
    durationMinutes: "",
    price: "",
    depositKind: "none",
    depositValue: "",
  });
}

export type ArchiveValues = Record<string, string>;

/**
 * Archive a service rather than deleting it.
 *
 * Appointments reference it, and a deleted service would take their history and their
 * cadence with it. Archived means "no longer bookable", which is what the stylist meant.
 */
export async function archiveServiceAction(
  _prev: FormState<ArchiveValues>,
  formData: FormData,
): Promise<FormState<ArchiveValues>> {
  const { stylist } = await requireStylist();
  const id = field(formData, "id");
  const db = getDb();
  await db
    .update(services)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(services.id, id), eq(services.stylistId, stylist.id)));
  revalidatePath("/settings/services");
  revalidatePath("/page");
  return succeeded("Archived. Its history and cadences stay.", {});
}

/* ---- Working hours ----------------------------------------------- */

export type HoursValues = Record<string, string>;

export async function saveHoursAction(
  _prev: FormState<HoursValues>,
  formData: FormData,
): Promise<FormState<HoursValues>> {
  const { stylist } = await requireStylist();
  const current = parseWorkingHours(stylist.workingHours);
  const next: WorkingHours = { ...current };

  for (let day = 0; day < 7; day++) {
    const key = String(day);
    const open = field(formData, `open-${day}`) || current[key].open;
    const close = field(formData, `close-${day}`) || current[key].close;
    const off = checkbox(formData, `off-${day}`);
    if (!off) {
      const [oh, om] = open.split(":").map(Number);
      const [ch, cm] = close.split(":").map(Number);
      if (!Number.isFinite(oh) || !Number.isFinite(ch)) {
        return failed(`Those times on ${key} are not readable.`, {});
      }
      if (ch * 60 + cm <= oh * 60 + om) {
        return failed("A day has to close after it opens.", {});
      }
    }
    next[key] = { open, close, off };
  }

  const minNotice = intInRange(field(formData, "minNoticeMinutes"), 0, 10_080);
  if (minNotice === null) {
    return failed("Minimum notice has to be a number of minutes, up to a week.", {});
  }

  const db = getDb();
  const settings = parseSettings(stylist.settings);
  await db
    .update(stylists)
    .set({
      workingHours: next,
      settings: { ...settings, minNoticeMinutes: minNotice },
      updatedAt: new Date(),
    })
    .where(eq(stylists.id, stylist.id));
  revalidatePath("/settings/hours");
  revalidatePath("/today");
  return succeeded("Your week is saved.", {});
}

/* ---- Reminders and quiet hours ----------------------------------- */

export type NotifyValues = Record<string, string>;

export async function saveNotifyAction(
  _prev: FormState<NotifyValues>,
  formData: FormData,
): Promise<FormState<NotifyValues>> {
  const { stylist } = await requireStylist();
  const settings = parseSettings(stylist.settings);
  const grace = intInRange(field(formData, "nudgeGraceDays"), 0, 60);
  const quietStart = intInRange(field(formData, "quietStartHour"), 0, 23);
  const quietEnd = intInRange(field(formData, "quietEndHour"), 0, 23);
  if (grace === null) return failed("Nudge grace has to be a number of days, 0 to 60.", {});
  if (quietStart === null || quietEnd === null) {
    return failed("Quiet hours have to be whole hours, 0 to 23.", {});
  }

  const db = getDb();
  await db
    .update(stylists)
    .set({
      settings: {
        ...settings,
        reminder48h: checkbox(formData, "reminder48h"),
        reminder2h: checkbox(formData, "reminder2h"),
        nudgeGraceDays: grace,
        quietStartHour: quietStart,
        quietEndHour: quietEnd,
      },
      updatedAt: new Date(),
    })
    .where(eq(stylists.id, stylist.id));
  revalidatePath("/settings");
  return succeeded("Saved.", {});
}

/* ---- Policy ------------------------------------------------------ */

export type PolicyValues = {
  cancelWindowHours: string;
  lateCancelFeePercent: string;
  noShowFeePercent: string;
  policyText: string;
};

/**
 * Edit the policy — which means appending version N+1, never updating N.
 *
 * Every appointment already booked keeps pointing at the version it was booked under, and
 * every fee is computed from that. This is the one table in the product that must be
 * append-only: rewriting a policy in place would rewrite what past clients agreed to, which
 * is precisely the evidence a dispute turns on.
 */
export async function savePolicyAction(
  _prev: FormState<PolicyValues>,
  formData: FormData,
): Promise<FormState<PolicyValues>> {
  const { user, stylist } = await requireStylist();
  const values: PolicyValues = {
    cancelWindowHours: field(formData, "cancelWindowHours"),
    lateCancelFeePercent: field(formData, "lateCancelFeePercent"),
    noShowFeePercent: field(formData, "noShowFeePercent"),
    policyText: String(formData.get("policyText") ?? "").trim(),
  };

  const window = intInRange(values.cancelWindowHours, 0, 336);
  const lateCancel = intInRange(values.lateCancelFeePercent, 0, 100);
  const noShow = intInRange(values.noShowFeePercent, 0, 100);
  if (window === null) return failed("The cancellation window is a number of hours, 0 to 336.", values);
  if (lateCancel === null) return failed("The late-cancel fee is a percentage, 0 to 100.", values);
  if (noShow === null) return failed("The no-show fee is a percentage, 0 to 100.", values);
  if (values.policyText.length < 40) {
    return failed(
      "The policy text is what clients agree to and what a fee receipt quotes — write at least a couple of sentences.",
      values,
    );
  }

  const db = getDb();
  const [latest] = await db
    .select()
    .from(policies)
    .where(eq(policies.stylistId, stylist.id))
    .orderBy(desc(policies.version))
    .limit(1);

  const unchanged =
    latest &&
    latest.cancelWindowHours === window &&
    latest.lateCancelFeePercent === lateCancel &&
    latest.noShowFeePercent === noShow &&
    latest.policyText === values.policyText;
  if (unchanged) return succeeded("Nothing changed, so no new version was created.", values);

  const version = (latest?.version ?? 0) + 1;
  await db.insert(policies).values({
    stylistId: stylist.id,
    version,
    cancelWindowHours: window,
    lateCancelFeePercent: lateCancel,
    noShowFeePercent: noShow,
    policyText: values.policyText,
  });
  await audit({
    actor: { kind: "user", userId: user.id },
    action: "policy.version_created",
    target: `${stylist.id}:v${version}`,
    stylistId: stylist.id,
    metadata: { version, cancelWindowHours: window, lateCancel, noShow },
  });

  revalidatePath("/settings/policy");
  revalidatePath("/page");
  return succeeded(
    `Saved as version ${version}. Appointments already booked keep the version they agreed to.`,
    values,
  );
}

/** Regenerate the prose from the numbers, for the "start again" button. */
export async function templatePolicyAction(
  _prev: FormState<PolicyValues>,
  formData: FormData,
): Promise<FormState<PolicyValues>> {
  await requireStylist();
  const window = intInRange(field(formData, "cancelWindowHours"), 0, 336) ?? 24;
  const lateCancel = intInRange(field(formData, "lateCancelFeePercent"), 0, 100) ?? 25;
  const noShow = intInRange(field(formData, "noShowFeePercent"), 0, 100) ?? 50;
  return succeeded("Rewritten from your numbers — edit it into your own words.", {
    cancelWindowHours: String(window),
    lateCancelFeePercent: String(lateCancel),
    noShowFeePercent: String(noShow),
    policyText: defaultPolicyText({
      cancelWindowHours: window,
      lateCancelFeePercent: lateCancel,
      noShowFeePercent: noShow,
    }),
  });
}

/* ---- Profile ----------------------------------------------------- */

export type ProfileValues = { displayName: string; chairLocation: string; bio: string; timezone: string };

export async function saveProfileAction(
  _prev: FormState<ProfileValues>,
  formData: FormData,
): Promise<FormState<ProfileValues>> {
  const { stylist } = await requireStylist();
  const values: ProfileValues = {
    displayName: field(formData, "displayName"),
    chairLocation: field(formData, "chairLocation"),
    bio: String(formData.get("bio") ?? "").trim(),
    timezone: field(formData, "timezone"),
  };
  if (values.displayName.length < 2) return failed("Clients need a name to recognise.", values);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: values.timezone });
  } catch {
    return failed(`"${values.timezone}" is not a timezone we know.`, values);
  }

  const db = getDb();
  await db
    .update(stylists)
    .set({
      displayName: values.displayName,
      chairLocation: values.chairLocation || null,
      bio: values.bio || null,
      timezone: values.timezone,
      updatedAt: new Date(),
    })
    .where(eq(stylists.id, stylist.id));
  revalidatePath("/settings");
  revalidatePath("/today");
  return succeeded("Saved.", values);
}
