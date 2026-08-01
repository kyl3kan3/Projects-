"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "./actions";
import { TIMEZONES } from "@/lib/tz";

export function AuthForm({
  mode,
  action,
  cta,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  cta: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Email</span>
        <input
          className="input input-mono"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder={isSignup ? "At least 8 characters" : ""}
        />
      </label>

      {isSignup ? (
        <label className="flex flex-col gap-2">
          <span className="t-label">Your trading timezone</span>
          <select className="input" name="timezone" defaultValue="America/New_York">
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <span className="t-secondary">
            Every time-of-day finding is measured on this clock. Change it any time in settings.
          </span>
        </label>
      ) : null}

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-loss)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "One moment…" : cta}
      </button>

      <p className="t-secondary text-center">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--color-blue)" }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" style={{ color: "var(--color-blue)" }}>
              {cta === "Sign in" ? "See your leaks free" : cta}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
