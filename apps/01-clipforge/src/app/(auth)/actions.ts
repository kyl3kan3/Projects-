"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, signup } from "@/lib/auth";

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

export type AuthState = { error?: string };

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await signup(parsed.data.email, parsed.data.password, parsed.data.name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Signup failed" };
  }
  redirect("/dashboard");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credsSchema
    .pick({ email: true, password: true })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    return { error: "Enter a valid email and password" };
  }
  try {
    await login(parsed.data.email, parsed.data.password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Login failed" };
  }
  redirect("/dashboard");
}
