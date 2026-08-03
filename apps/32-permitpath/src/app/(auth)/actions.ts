"use server";

/**
 * Sign-up and sign-in. Two endpoints, each called from a form on screen.
 *
 * Signing out lives with the settings screen that offers it — a copy here would
 * be an endpoint with no caller, which is attack surface rather than dead code.
 */

import { redirect } from "next/navigation";
import { login, signup } from "@/lib/auth";
import { safeMessage } from "@/lib/errors";

export interface AuthFormState {
  error: string | null;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await signup({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      companyName: String(formData.get("companyName") ?? ""),
      tradeFocus: String(formData.get("tradeFocus") ?? ""),
    });
  } catch (err) {
    return { error: safeMessage(err, "That account could not be created.") };
  }
  redirect("/jurisdictions");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (err) {
    return { error: safeMessage(err, "That sign-in could not be completed.") };
  }
  redirect("/jobs");
}
