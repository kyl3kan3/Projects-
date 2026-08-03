"use server";

/**
 * Auth actions. Two exported functions, both reachable from the sign-in and
 * sign-up forms — every exported `"use server"` function is a public endpoint,
 * so there is nothing here that nothing calls.
 */

import { redirect } from "next/navigation";
import { AuthError, login, signup } from "@/lib/auth";

import type { AuthState } from "@/lib/form-state";

function message(err: unknown): string {
  if (err instanceof AuthError) return err.message;
  // A database that is not reachable is not the user's fault, and "something
  // went wrong" tells them nothing they can act on.
  if (err instanceof Error && /DATABASE_URL|ECONNREFUSED|getaddrinfo/.test(err.message)) {
    return "The database is not reachable. Check DATABASE_URL and run npm run db:migrate.";
  }
  return "Could not complete that. Try again.";
}

export async function signupAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const organization = String(form.get("organization") ?? "").trim();
  try {
    await signup(email, password, organization || undefined);
  } catch (err) {
    return { error: message(err) };
  }
  redirect("/apis");
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  try {
    await login(email, password);
  } catch (err) {
    return { error: message(err) };
  }
  redirect("/apis");
}
