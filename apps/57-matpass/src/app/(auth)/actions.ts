"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import type { FormState } from "@/components/ActionForm";

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await signup({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      schoolName: String(formData.get("schoolName") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }
  // Straight to the three setup cards — a curriculum, a roster, a kiosk.
  redirect("/setup");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign you in" };
  }
  redirect("/roster");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
