"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { clearSession, login, signup } from "@/lib/auth";
import type { Sport } from "@/db/schema";

const SPORTS: Sport[] = [
  "soccer",
  "baseball",
  "softball",
  "basketball",
  "hockey",
  "lacrosse",
  "swim",
];

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const sport = String(form.get("sport") ?? "soccer") as Sport;
  try {
    await signup({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      name: String(form.get("name") ?? ""),
      clubName: String(form.get("clubName") ?? ""),
      sport: SPORTS.includes(sport) ? sport : "soccer",
      timezone: String(form.get("timezone") ?? "America/New_York"),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the club" };
  }
  redirect("/season");
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign in" };
  }
  redirect("/season");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
