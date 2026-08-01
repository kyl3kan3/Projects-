"use server";

/**
 * Sign-up and sign-in. Two actions, both called by AuthForm — every exported
 * `"use server"` function is a public endpoint, so there is nothing here that is
 * not reached from a form.
 */

import { redirect } from "next/navigation";
import { login, signup } from "@/lib/auth";

export interface AuthState {
  error: string | null;
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function signupAction(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = field(form, "email");
  const password = field(form, "password");
  const name = field(form, "name");
  const orgName = field(form, "orgName");
  // The browser knows the visitor's zone; deadlines are dates in it, so capture
  // it at sign-up rather than defaulting everyone to New York and hoping.
  const timezone = field(form, "timezone");

  try {
    await signup({ email, password, name, orgName, timezone });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account" };
  }
  redirect("/onboarding");
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  try {
    await login(field(form, "email"), field(form, "password"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign in" };
  }
  redirect("/pipeline");
}
