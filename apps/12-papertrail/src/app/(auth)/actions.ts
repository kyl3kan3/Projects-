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
  const name = String(formData.get("name") ?? "").trim() || undefined;

  try {
    await signup(email, password, name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }
  // Straight into the first proposal: the fastest path to value is the chain.
  redirect("/documents/new?first=1");
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
  redirect("/chain");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
