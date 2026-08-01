"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { loginAction, signupAction, type AuthState } from "./actions";

const INITIAL: AuthState = { error: null };

/**
 * One form for both modes. The timezone is filled in from the browser on sign-up
 * — a grant deadline is a date in the org's own zone, and asking someone to pick
 * an IANA identifier from a list of 400 on their first screen is a worse question
 * than one their browser already knows the answer to.
 */
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
            <span className="t-label">Organization</span>
            <input
              className="input"
              name="orgName"
              placeholder="Riverside Youth Collective"
              autoComplete="organization"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Your name</span>
            <input
              className="input"
              name="name"
              placeholder="Dana Whitfield"
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
          placeholder="dana@riversideyouth.org"
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
        <p
          className="t-secondary rule-t pt-3"
          role="alert"
          style={{ color: "var(--color-brick-text)" }}
        >
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary mt-2 w-full" type="submit" disabled={pending}>
        {pending
          ? mode === "signup"
            ? "Creating your account…"
            : "Signing in…"
          : mode === "signup"
            ? "Start the 14-day trial"
            : "Sign in"}
      </button>

      {mode === "signup" ? (
        <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          No card required. Your trial runs the full product for 14 days, then drops
          to Seed unless you choose a plan — nothing in your pipeline is deleted.
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
