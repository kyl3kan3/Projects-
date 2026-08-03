"use server";

/**
 * Auth server actions. Three exports, all three reachable by a form — nothing
 * here exists that nothing calls, because every exported "use server" function is
 * a public endpoint.
 */

import { redirect } from "next/navigation";
import { AuthError, clearSession, login, signup } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { requestMeta } from "@/lib/request";
import type { NoteFormat } from "@/db/schema";

export interface AuthState {
  error?: string;
}

function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function signupAction(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const meta = await requestMeta();
  try {
    await signup({
      practiceName: str(form, "practiceName"),
      name: str(form, "name"),
      credentials: str(form, "credentials"),
      email: str(form, "email"),
      password: str(form, "password"),
      defaultFormat: (str(form, "defaultFormat") || "soap") as NoteFormat,
      acceptedBaa: form.get("acceptedBaa") === "on",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[auth] signup failed", err);
    return { error: "Could not create the account. Try again." };
  }
  redirect("/today");
}

export async function loginAction(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const meta = await requestMeta();
  try {
    await login(str(form, "email"), str(form, "password"), meta);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error("[auth] login failed", err);
    return { error: "Could not sign in. Try again." };
  }
  redirect("/today");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    const meta = await requestMeta();
    await recordAudit({
      practiceId: session.practiceId,
      actorId: session.userId,
      action: "logout",
      targetKind: "practice",
      targetId: session.practiceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  await clearSession();
  redirect("/login");
}
