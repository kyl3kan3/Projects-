"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import { ensureDefaultEmailChannel } from "@/lib/alerts";

export interface AuthFormState {
  error?: string;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || undefined;

  let teamId: string;
  try {
    ({ teamId } = await signup(email, password, name));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }

  // Nobody should finish signup with no way to be alerted. Seed their own
  // address as the first channel; they can add Slack later.
  try {
    await ensureDefaultEmailChannel(teamId);
  } catch (err) {
    console.error("[signup] could not seed default email channel", err);
  }

  redirect("/monitors/new?first=1");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign you in" };
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
