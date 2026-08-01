"use server";

import { redirect } from "next/navigation";
import { login, signup } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/time";

export interface AuthState {
  error: string | null;
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const restaurantName = String(formData.get("restaurantName") ?? "");
  const timezone = String(formData.get("timezone") ?? "");

  try {
    await signup({
      email,
      password,
      name,
      restaurantName,
      timezone: isValidTimeZone(timezone) ? timezone : "America/New_York",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account" };
  }
  redirect("/menu");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign in" };
  }
  redirect("/menu");
}
