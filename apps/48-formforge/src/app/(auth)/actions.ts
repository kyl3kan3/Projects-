"use server";

/**
 * Auth server actions.
 *
 * Every exported `"use server"` function is a public endpoint, so there are
 * exactly three here and each one is called from a form on a page in this group.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError, clearSession, login, signup } from "@/lib/auth";

async function clientIp(): Promise<string | null> {
  const h = await headers();
  // Vercel and most proxies set x-forwarded-for; take the first hop.
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

export interface AuthFormState {
  error: string | null;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await signup({
      practiceName: String(formData.get("practiceName") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[signup] failed", err);
    return { error: "Something went wrong creating that account. Try again." };
  }
  redirect("/settings/agreement");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await login(
      String(formData.get("email") ?? ""),
      String(formData.get("password") ?? ""),
      await clientIp(),
    );
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[login] failed", err);
    return { error: "Something went wrong signing in. Try again." };
  }
  redirect("/intakes");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
