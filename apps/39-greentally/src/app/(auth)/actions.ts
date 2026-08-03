"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import { isRedirectError, safeMessage } from "@/lib/errors";

export interface AuthState {
  error?: string;
}

export async function signupAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  try {
    await signup({
      companyName: String(form.get("companyName") ?? ""),
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not create the account. Try again.") };
  }
  redirect("/onboarding");
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  try {
    await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not sign in. Try again.") };
  }
  redirect("/footprint");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
