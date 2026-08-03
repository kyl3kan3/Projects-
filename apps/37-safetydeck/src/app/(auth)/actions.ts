"use server";

/**
 * Sign-up, sign-in, sign-out. Three actions, all three reached from a form —
 * every exported `"use server"` function is a public endpoint, so there is
 * nothing here that nothing calls.
 */

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";

export interface AuthState {
  error: string | null;
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function signupAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  try {
    await signup({
      email: field(form, "email"),
      password: field(form, "password"),
      name: field(form, "name"),
      companyName: field(form, "companyName"),
      // The browser knows the zone. A cert expiring "on the 14th" has to mean
      // the 14th where the crew is, and asking someone to pick an IANA
      // identifier on their first screen is a worse question than one the
      // browser already answered.
      timezone: field(form, "timezone"),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account" };
  }
  redirect("/talks");
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  try {
    await login(field(form, "email"), field(form, "password"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign in" };
  }
  redirect("/talks");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
