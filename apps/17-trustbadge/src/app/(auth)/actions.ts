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
  const storeName = String(formData.get("storeName") ?? "").trim() || undefined;
  const domain = String(formData.get("domain") ?? "").trim() || undefined;

  try {
    await signup(email, password, { storeName, domain, name: storeName });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }

  // Straight to the install screen: the snippet is the first thing worth seeing,
  // and a merchant with no widget on their storefront has bought nothing yet.
  redirect("/settings/install?first=1");
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
  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
