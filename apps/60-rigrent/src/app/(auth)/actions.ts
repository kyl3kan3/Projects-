"use server";

import { redirect } from "next/navigation";
import { login, signup } from "@/lib/auth";
import { field, formError, snapshot, type FormState } from "@/lib/form";

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  delete values.password;
  try {
    await signup({
      email: field(form, "email"),
      password: String(form.get("password") ?? ""),
      name: field(form, "name"),
      yardName: field(form, "yardName"),
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not create the account.", values);
  }
  redirect("/dashboard");
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  delete values.password;
  try {
    await login(field(form, "email"), String(form.get("password") ?? ""));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not sign in.", values);
  }
  redirect("/dashboard");
}
