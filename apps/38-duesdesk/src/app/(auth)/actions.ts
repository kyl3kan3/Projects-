"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import type { AssociationKind } from "@/db/schema";

export interface AuthFormState {
  error?: string;
}

const KINDS: AssociationKind[] = ["hoa", "condo", "club", "league"];

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const kindRaw = String(formData.get("kind") ?? "hoa");
  const kind = (KINDS as string[]).includes(kindRaw) ? (kindRaw as AssociationKind) : "hoa";

  try {
    await signup({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      associationName: String(formData.get("associationName") ?? ""),
      kind,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }
  // Straight to the first-run cards: import the roster, connect Stripe, create
  // the first assessment.
  redirect("/dues");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign you in" };
  }
  redirect("/dues");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
