"use server";

/**
 * Sign-up and sign-in.
 *
 * Every exported `"use server"` function is a public endpoint, so there are exactly
 * three here and each is called from a form on screen.
 */

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
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

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
