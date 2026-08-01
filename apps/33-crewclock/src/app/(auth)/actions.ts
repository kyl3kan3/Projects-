"use server";

import { redirect } from "next/navigation";
import {
  claimCrewProfile,
  crewLogin,
  login,
  lookupCrewCode,
  normalizeCrewCode,
  signup,
} from "@/lib/auth";
import { normalizeLocale, t } from "@/lib/i18n";
import type { Locale } from "@/db/schema";

export interface AuthFormState {
  error?: string;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await signup({
      companyName: String(formData.get("company") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      timezone: String(formData.get("timezone") ?? "") || undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create your account" };
  }
  // Straight to the first thing that has to exist: a site to punch into.
  redirect("/sites?first=1");
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  try {
    await login(String(formData.get("email") ?? "").trim(), String(formData.get("password") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sign you in" };
  }
  redirect("/jobs");
}

/* ------------------------------------------------------------ crew join --- */

export interface JoinState {
  step: "code" | "set-pin" | "enter-pin";
  code?: string;
  name?: string;
  error?: string;
}

/** Step one: the code the foreman handed over. */
export async function crewCodeAction(prev: JoinState, formData: FormData): Promise<JoinState> {
  const locale: Locale = normalizeLocale(String(formData.get("locale") ?? ""));
  const code = normalizeCrewCode(String(formData.get("code") ?? ""));
  const found = await lookupCrewCode(code);

  if (found.kind === "unknown") {
    return { step: "code", error: t(locale, "join.error.badCode") };
  }
  if (found.kind === "inactive") {
    return { step: "code", error: t(locale, "join.error.inactive") };
  }
  void prev;
  return {
    step: found.kind === "unclaimed" ? "set-pin" : "enter-pin",
    code,
    name: found.user.name,
  };
}

/** Step two: set the PIN (first time) or enter it (every time after). */
export async function crewPinAction(prev: JoinState, formData: FormData): Promise<JoinState> {
  const locale: Locale = normalizeLocale(String(formData.get("locale") ?? ""));
  const code = String(formData.get("code") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const mode = String(formData.get("mode") ?? "enter-pin");

  if (!/^\d{4}$/.test(pin)) {
    return { ...prev, error: t(locale, "join.error.pinFormat") };
  }

  if (mode === "set-pin") {
    if (pin !== String(formData.get("pinConfirm") ?? "")) {
      return { ...prev, error: t(locale, "join.error.pinMismatch") };
    }
    try {
      await claimCrewProfile(code, pin);
    } catch (err) {
      const message = err instanceof Error ? err.message : "BAD_CODE";
      if (message === "ALREADY_CLAIMED") {
        return { step: "enter-pin", code, name: prev.name, error: t(locale, "join.error.badPin") };
      }
      return { step: "code", error: t(locale, "join.error.badCode") };
    }
  } else {
    try {
      await crewLogin(code, pin);
    } catch (err) {
      const message = err instanceof Error ? err.message : "BAD_PIN";
      if (message === "NOT_CLAIMED") {
        return { step: "set-pin", code, name: prev.name };
      }
      if (message === "INACTIVE") {
        return { step: "code", error: t(locale, "join.error.inactive") };
      }
      if (message === "BAD_CODE") {
        return { step: "code", error: t(locale, "join.error.badCode") };
      }
      return { ...prev, step: "enter-pin", code, error: t(locale, "join.error.badPin") };
    }
  }

  redirect("/clock");
}
