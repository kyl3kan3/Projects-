"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { schools } from "@/db/schema";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { addStaff, requireCan } from "@/lib/auth";
import { planPortal, startPlanCheckout } from "@/lib/billing";
import { mintDeviceToken, revokeDevice } from "@/lib/kiosk";
import type { PlanTier, UserRole } from "@/db/schema";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

export async function updateSchoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_staff");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const fraction = Number(formData.get("retentionBaselineFraction") ?? 0.4);
  const minDays = Number(formData.get("retentionMinDaysAbsent") ?? 10);
  const kioskPinEnabled = String(formData.get("kioskPinEnabled") ?? "") === "on";

  try {
    if (name.length < 2) throw new Error("The school needs a name");
    if (!timezone) throw new Error("Pick a timezone");
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    } catch {
      throw new Error(`“${timezone}” is not a timezone this system recognises`);
    }
    if (!(fraction > 0 && fraction < 1)) {
      throw new Error("The baseline fraction is a decimal between 0 and 1 — 0.4 means 40%");
    }
    if (!Number.isInteger(minDays) || minDays < 3 || minDays > 90) {
      throw new Error("Days away should be a whole number between 3 and 90");
    }

    const db = getDb();
    await db
      .update(schools)
      .set({
        name,
        timezone,
        settings: {
          ...school.settings,
          retentionBaselineFraction: fraction,
          retentionMinDaysAbsent: minDays,
          kioskPinEnabled,
        },
        updatedAt: new Date(),
      })
      .where(eq(schools.id, school.id));
    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "school.updated",
      target: school.id,
      metadata: { timezone, fraction, minDays },
    });
    revalidatePath("/settings");
    revalidatePath("/retention");
    return { ok: "Saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function addStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_staff");
  const role = String(formData.get("role") ?? "front_desk") as UserRole;
  try {
    if (!["owner", "instructor", "front_desk"].includes(role)) throw new Error("Pick a role");
    const staff = await addStaff({
      schoolId: school.id,
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
      role,
    });
    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "staff.added",
      target: staff.id,
      metadata: { role },
    });
    revalidatePath("/settings/staff");
    return { ok: `${staff.name} added. They sign in with the password you just set.` };
  } catch (err) {
    return fail(err);
  }
}

export async function mintKioskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_kiosk");
  try {
    const { token, device } = await mintDeviceToken({
      schoolId: school.id,
      name: String(formData.get("name") ?? ""),
      actorId: user.id,
    });
    revalidatePath("/settings/kiosk");
    return {
      ok: `${device.name}: open /kiosk/${token} on the tablet once and bookmark it. This link is shown only now — mint a new device if it is lost.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeKioskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_kiosk");
  try {
    await revokeDevice({
      deviceId: String(formData.get("deviceId") ?? ""),
      schoolId: school.id,
      actorId: user.id,
    });
    revalidatePath("/settings/kiosk");
    return { ok: "Revoked. That tablet is dead as of this moment, mid-session included." };
  } catch (err) {
    return fail(err);
  }
}

export async function choosePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_billing");
  const tier = String(formData.get("tier") ?? "dojo") as PlanTier;
  let url: string;
  try {
    if (!["dojo", "academy", "federation"].includes(tier)) throw new Error("Pick a plan");
    const session = await startPlanCheckout({
      schoolId: school.id,
      tier,
      email: user.email,
      actorId: user.id,
    });
    revalidatePath("/settings/plan");
    if (session.simulated) {
      return {
        ok: `Plan set to ${tier}. Stripe is not configured in this environment, so no checkout was opened — with STRIPE_SECRET_KEY and the price ids set, this opens Stripe Checkout.`,
      };
    }
    url = session.url;
  } catch (err) {
    return fail(err);
  }
  // Outside the try: `redirect()` throws by design.
  redirect(url);
}

export async function portalAction(_prev: FormState): Promise<FormState> {
  const { school } = await requireCan("manage_billing");
  let url: string;
  try {
    const session = await planPortal({ schoolId: school.id });
    if (session.simulated) {
      return { ok: "The customer portal needs a live Stripe key — nothing to open here." };
    }
    url = session.url;
  } catch (err) {
    return fail(err);
  }
  redirect(url);
}
