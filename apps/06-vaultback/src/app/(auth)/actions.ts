"use server";

import { redirect } from "next/navigation";
import { AuthError, clearSession, login, signup } from "@/lib/auth";

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
    if (err instanceof AuthError) return { error: err.message };
    console.error("[signup] failed", err);
    return { error: "Could not create your account" };
  }

  // Straight to the one screen that matters: connecting a database.
  redirect("/vault/new?first=1");
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
    if (err instanceof AuthError) return { error: err.message };
    console.error("[login] failed", err);
    return { error: "Could not sign you in" };
  }
  redirect("/vault");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
