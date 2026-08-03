"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import { failed, field, type FormState } from "@/lib/forms";

/**
 * Auth actions. Every field the user typed comes back in `values` on failure: React 19
 * resets an uncontrolled form once a server action returns, so without the echo a
 * rejected handle would also wipe the name, the email and the password.
 */
export type AuthValues = { email: string; name: string; handle: string };

export async function signupAction(
  _prev: FormState<AuthValues>,
  formData: FormData,
): Promise<FormState<AuthValues>> {
  const values: AuthValues = {
    email: field(formData, "email"),
    name: field(formData, "name"),
    handle: field(formData, "handle"),
  };
  const password = String(formData.get("password") ?? "");

  try {
    await signup({ ...values, password });
  } catch (err) {
    return failed(err instanceof Error ? err.message : "Could not create the account", values);
  }
  redirect("/setup");
}

export async function loginAction(
  _prev: FormState<AuthValues>,
  formData: FormData,
): Promise<FormState<AuthValues>> {
  const values: AuthValues = { email: field(formData, "email"), name: "", handle: "" };
  try {
    await login(values.email, String(formData.get("password") ?? ""));
  } catch (err) {
    return failed(err instanceof Error ? err.message : "Could not sign in", values);
  }
  redirect("/today");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
