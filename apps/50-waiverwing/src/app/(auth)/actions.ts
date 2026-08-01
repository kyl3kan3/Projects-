"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import { createWaiver, publish } from "@/lib/waivers";
import { TEMPLATES } from "@/lib/templates";
import { DEFAULT_MINOR_RULE } from "@/db/schema";

export interface AuthFormState {
  error?: string;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const businessName = String(formData.get("businessName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || undefined;
  const templateKey = String(formData.get("template") ?? "climbing");

  let accountId: string;
  try {
    ({ accountId } = await signup(email, password, businessName, name));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }

  // Nobody should land in an empty product. Seed and publish the chosen
  // template so the QR poster works and the first signature can be taken
  // immediately — the ROADMAP's "signature on a phone in under 15 minutes,
  // unassisted" only happens if the first screen is already useful.
  try {
    const template = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0];
    const waiver = await createWaiver({
      accountId,
      title: `${businessName} — ${template.name.toLowerCase()} waiver`,
      expiryRule: template.expiryRule,
      minorRule: { ...DEFAULT_MINOR_RULE, ageOfMajority: template.ageOfMajority },
      activityTags: template.activityTags,
      draftBlocks: template.blocks,
    });
    await publish(waiver.id, accountId);
  } catch (err) {
    console.error("[signup] could not seed the starter waiver", err);
  }

  redirect("/checkin?welcome=1");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign you in" };
  }
  redirect("/checkin");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
