"use server";

/**
 * Sign-up and sign-in. Two exported actions, both called from AuthForm — every
 * exported "use server" function is a public endpoint, so there are exactly as
 * many here as the forms use.
 */

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";

export interface AuthFormState {
  error: string | null;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const timezone = String(formData.get("timezone") ?? "");
  try {
    await signup({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      practiceName: String(formData.get("practiceName") ?? ""),
      locationName: String(formData.get("locationName") ?? ""),
      timezone: TIMEZONES.includes(timezone) ? timezone : "America/Chicago",
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create that account." };
  }
  redirect("/imports?first=1");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not sign in." };
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
