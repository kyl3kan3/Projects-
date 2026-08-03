"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { loginAction, signupAction, type AuthState } from "./actions";

const INITIAL: AuthState = { error: null };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "signup" ? signupAction : loginAction;
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [timezone, setTimezone] = useState("America/New_York");

  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved) setTimezone(resolved);
    } catch {
      // Keep the default; Settings can change it.
    }
  }, []);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      {mode === "signup" ? (
        <>
          <input type="hidden" name="timezone" value={timezone} />
          <label className="flex flex-col gap-2">
            <span className="t-label">Company</span>
            <input
              className="input"
              name="companyName"
              placeholder="Ridgeline Mechanical"
              autoComplete="organization"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Your name</span>
            <input
              className="input"
              name="name"
              placeholder="Dale Hutchins"
              autoComplete="name"
            />
          </label>
        </>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="t-label">Email</span>
        <input
          className="input"
          type="email"
          name="email"
          placeholder="dale@ridgelinemech.com"
          autoComplete="email"
          required
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Password</span>
        <input
          className="input"
          type="password"
          name="password"
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={mode === "signup" ? 8 : undefined}
          required
        />
      </label>

      {state.error ? (
        <p className="t-secondary msg msg-error rule-t pt-3" role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending
          ? mode === "signup"
            ? "Creating your account…"
            : "Signing in…"
          : mode === "signup"
            ? "Start the 14-day trial"
            : "Sign in"}
      </button>

      {mode === "signup" ? (
        <p className="t-secondary">
          No card required. Fourteen days of the whole product: schedule a talk, collect
          real signatures at a real huddle, print the binder page.
        </p>
      ) : null}

      <p className="t-secondary rule-t pt-4">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="btn-quiet" style={{ minHeight: 0 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="btn-quiet" style={{ minHeight: 0 }}>
              Start a trial
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
