"use server";

/**
 * Sign-up and sign-in.
 *
 * Every exported `"use server"` function is a public endpoint, so there are exactly
 * two here and each is called from a form on screen. Signing out lives with the
 * settings screen that offers it — a second copy here was an endpoint with no caller,
 * which is attack surface rather than dead code.
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
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  try {
    await signup(email, password, name);
  } catch (err) {
    return { error: safeMessage(err, "That account could not be created.") };
  }
  redirect("/connect");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return { error: safeMessage(err, "That sign-in could not be completed.") };
  }
  redirect("/reorder");
}
