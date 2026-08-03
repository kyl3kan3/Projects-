"use server";

import { redirect } from "next/navigation";
import { clearSession, login, signup } from "@/lib/auth";
import { field, formError, type FormState } from "@/lib/form";

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  const password = field(form, "password");
  const name = field(form, "name");
  try {
    await signup(email, password, name);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not create the account");
  }
  redirect("/map");
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await login(field(form, "email"), field(form, "password"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not sign in");
  }
  redirect("/map");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
