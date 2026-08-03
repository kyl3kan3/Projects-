"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";

export interface AuthState {
  error: string | null;
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "");
  const orgName = String(formData.get("orgName") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const kind = String(formData.get("kind") ?? "property_mgmt");

  try {
    await signup({
      name,
      orgName,
      email,
      password,
      kind: kind === "gc" ? "gc" : kind === "other" ? "other" : "property_mgmt",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account." };
  }
  redirect("/dashboard");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign in." };
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
