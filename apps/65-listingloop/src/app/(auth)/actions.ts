"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import { logAudit } from "@/lib/activity";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface AuthState {
  error: string | null;
  /**
   * The values the visitor typed, echoed back.
   *
   * React 19 resets an uncontrolled form once its action returns, so without
   * this a mistyped password wipes the whole signup form and the visitor starts
   * again. Feeding these into `defaultValue` makes the reset restore what they
   * wrote. The password is deliberately not among them.
   */
  values?: Record<string, string>;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function signupAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const typed = {
    name: text(form, "name"),
    companyName: text(form, "companyName"),
    email: text(form, "email"),
    state: text(form, "state"),
    timezone: text(form, "timezone"),
  };
  try {
    const { accountId } = await signup({
      name: text(form, "name"),
      email: text(form, "email"),
      password: text(form, "password"),
      companyName: text(form, "companyName"),
      state: text(form, "state") || "TX",
      timezone: text(form, "timezone") || "America/Chicago",
    });
    await logAudit({
      accountId,
      actor: text(form, "email").trim().toLowerCase(),
      action: "account_created",
      target: text(form, "companyName"),
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not create the account",
      values: typed,
    };
  }
  redirect("/deals");
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = text(form, "email");
  try {
    await login(email, text(form, "password"));
    const [user] = await getDb()
      .select({ accountId: users.accountId })
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));
    if (user) {
      await logAudit({
        accountId: user.accountId,
        actor: email.trim().toLowerCase(),
        action: "signed_in",
        target: "console",
      });
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign in", values: { email } };
  }
  redirect("/deals");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
