"use server";

/**
 * Auth server actions.
 *
 * Every exported `"use server"` function is a public endpoint, so there are
 * exactly three here and each one validates its own input. There is no
 * "updateUser(anything)" convenience action sitting around as attack surface.
 */

import { redirect } from "next/navigation";
import { acceptInvite, clearSession, login, signup } from "@/lib/auth";

export interface AuthState {
  error: string | null;
}

function fieldOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await signup({
      email: fieldOf(formData, "email"),
      password: fieldOf(formData, "password"),
      name: fieldOf(formData, "name"),
      firmName: fieldOf(formData, "firmName"),
      timezone: fieldOf(formData, "timezone"),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create the account." };
  }
  redirect("/radar");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await login(fieldOf(formData, "email"), fieldOf(formData, "password"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not sign in." };
  }
  redirect("/radar");
}

export async function acceptInviteAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    await acceptInvite(
      fieldOf(formData, "token"),
      fieldOf(formData, "password"),
      fieldOf(formData, "name"),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not accept the invitation." };
  }
  redirect("/radar");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
