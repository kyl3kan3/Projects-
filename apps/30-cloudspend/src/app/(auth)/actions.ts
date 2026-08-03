"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";

/**
 * React 19 resets an uncontrolled form once its action completes, so a rejected
 * submit would otherwise wipe the fields the person just typed — including their
 * email address, which they then have to type again to find out the password was
 * the problem. Echoing the submitted values back in the state, and using them as
 * `defaultValue`, is what makes the reset harmless.
 */
export interface AuthState {
  error?: string;
  values?: { email?: string; orgName?: string; personName?: string };
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("orgName") ?? "");
  const personName = String(formData.get("personName") ?? "");
  try {
    await signup(email, password, orgName, personName);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not create the account",
      values: { email, orgName, personName },
    };
  }
  redirect("/connect");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not sign in",
      values: { email },
    };
  }
  redirect("/watch");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
