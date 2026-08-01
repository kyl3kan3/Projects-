"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";

export interface AuthState {
  error?: string;
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const firmName = String(formData.get("firmName") ?? "");
  const personName = String(formData.get("personName") ?? "");
  try {
    await signup(email, password, firmName, personName);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account" };
  }
  redirect("/connect");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign in" };
  }
  redirect("/aging");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
