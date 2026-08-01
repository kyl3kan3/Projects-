"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import { DEFAULT_TIMEZONE } from "@/lib/tz";

export interface AuthFormState {
  error?: string;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const timezone = String(formData.get("timezone") ?? "") || DEFAULT_TIMEZONE;

  try {
    await signup(email, password, timezone);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }
  // Straight to the import: the first file is the whole product.
  redirect("/import?first=1");
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
