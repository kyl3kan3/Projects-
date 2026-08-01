"use server";

import { redirect } from "next/navigation";
import { AuthError, clearSession, login, signup } from "@/lib/auth";
import type { ActionState } from "@/components/ActionForm";

export async function signupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await signup({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      name: String(form.get("name") ?? "") || undefined,
      companyName: String(form.get("company") ?? "") || undefined,
    });
  } catch (err) {
    return { error: err instanceof AuthError ? err.message : "Could not create the account" };
  }
  redirect("/projects");
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  } catch (err) {
    return { error: err instanceof AuthError ? err.message : "Could not sign in" };
  }
  redirect("/projects");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
