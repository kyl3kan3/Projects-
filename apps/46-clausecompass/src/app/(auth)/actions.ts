"use server";

/**
 * Auth server actions.
 *
 * Every exported `"use server"` function is a public endpoint, so there are exactly
 * three here and each one is called from a form in this route group.
 */

import { redirect } from "next/navigation";
import { AuthError, clearSession, login, signup } from "@/lib/auth";

export interface AuthFormState {
  error: string | null;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await signup({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      // The acknowledgment is validated server-side. A disclaimer a client could skip
      // by deleting a checkbox is decoration, not a compliance posture.
      acknowledged: formData.get("acknowledged") === "on",
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[signup] failed", err);
    return { error: "Something went wrong creating that account. Try again." };
  }
  redirect("/contracts");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[login] failed", err);
    return { error: "Something went wrong signing in. Try again." };
  }
  redirect("/contracts");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
