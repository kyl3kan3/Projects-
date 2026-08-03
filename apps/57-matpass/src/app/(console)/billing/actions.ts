"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { requireCan } from "@/lib/auth";
import {
  archiveMembershipPlan,
  connectOnboarding,
  createMembershipPlan,
  pauseFamilySubscription,
  subscribeFamily,
} from "@/lib/billing";
import { dollarsToCents } from "@/lib/parse";
import { createFamily } from "@/lib/roster";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

export async function connectAction(_prev: FormState): Promise<FormState> {
  const { school, user } = await requireCan("manage_billing");
  let url: string;
  try {
    const result = await connectOnboarding({ schoolId: school.id, actorId: user.id });
    revalidatePath("/billing");
    if (result.simulated) {
      return {
        ok: "Stripe is not configured in this environment, so a simulated connected account was recorded. With STRIPE_SECRET_KEY set, this button opens Stripe's real onboarding.",
      };
    }
    url = result.url;
  } catch (err) {
    return fail(err);
  }
  // Outside the try: `redirect()` throws by design.
  redirect(url);
}

export async function createPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_billing");
  try {
    const amountCents = dollarsToCents(String(formData.get("amount") ?? ""));
    const plan = await createMembershipPlan({
      schoolId: school.id,
      name: String(formData.get("name") ?? ""),
      amountCents,
      interval: String(formData.get("interval") ?? "month") === "year" ? "year" : "month",
      kind: String(formData.get("kind") ?? "per_student") === "family_flat" ? "family_flat" : "per_student",
      actorId: user.id,
    });
    revalidatePath("/billing");
    return { ok: `${plan.name} created.` };
  } catch (err) {
    return fail(err);
  }
}

export async function archivePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_billing");
  try {
    await archiveMembershipPlan({
      schoolId: school.id,
      planId: String(formData.get("planId") ?? ""),
      actorId: user.id,
    });
    revalidatePath("/billing");
    return { ok: "Archived. Families already on it keep billing until you change them." };
  } catch (err) {
    return fail(err);
  }
}

export async function subscribeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_billing");
  try {
    const result = await subscribeFamily({
      schoolId: school.id,
      familyId: String(formData.get("familyId") ?? ""),
      membershipPlanId: String(formData.get("membershipPlanId") ?? ""),
      studentIds: formData.getAll("studentIds").map(String).filter(Boolean),
      actorId: user.id,
    });
    revalidatePath("/billing");
    return {
      ok: `Payment-method link sent to the household${result.simulated ? " (simulated — no Stripe key configured)" : ""}: ${result.paymentLinkUrl}`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function pauseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_billing");
  const resume = String(formData.get("resume") ?? "") === "1";
  try {
    await pauseFamilySubscription({
      schoolId: school.id,
      subscriptionId: String(formData.get("subscriptionId") ?? ""),
      actorId: user.id,
      resume,
    });
    revalidatePath("/billing");
    revalidatePath("/roster");
    return {
      ok: resume
        ? "Resumed — billing restarts and the students are active again."
        : "Paused. Billing stops, the students are marked paused, and the retention scan leaves them alone.",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function addFamilyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireCan("edit_roster");
  try {
    const family = await createFamily({
      schoolId: school.id,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
    });
    revalidatePath("/billing");
    return { ok: `${family.name} added.` };
  } catch (err) {
    return fail(err);
  }
}
