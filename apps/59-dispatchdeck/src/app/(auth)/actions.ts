"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import type { ActionState } from "@/components/form";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export async function signupAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  try {
    await signup({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      carrierName: String(formData.get("carrierName") ?? ""),
      mcNumber: String(formData.get("mcNumber") ?? ""),
    });
  } catch (error) {
    return { ok: false, message: message(error) };
  }
  redirect("/loads");
}

export async function loginAction(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  let role: "owner" | "dispatcher" | "driver";
  try {
    role = await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (error) {
    return { ok: false, message: message(error) };
  }
  // A driver's home is the cab card; the office board would be a wall of
  // paperwork they cannot act on.
  redirect(role === "driver" ? "/cab" : "/loads");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
