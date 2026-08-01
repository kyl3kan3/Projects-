"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";

export interface AuthFormState {
  error?: string;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const agency = String(formData.get("agency") ?? "").trim() || undefined;
  const name = String(formData.get("name") ?? "").trim() || undefined;

  try {
    await signup(email, password, agency, name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }

  // Straight to building the first portal: an agency that lands on an empty
  // dashboard has nothing to react to.
  redirect("/portals/new?first=1");
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
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
