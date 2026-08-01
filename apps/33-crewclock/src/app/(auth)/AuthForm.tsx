"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "./actions";

/**
 * Owner / office sign-in and sign-up. English only by design at this door: the
 * bilingual half of the product is the crew's, and the buyer arrived from an
 * English marketing page. A Spanish-speaking owner uses the same crew language
 * pill on their own profile.
 */
export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isSignup ? (
        <>
          <label className="field">
            <span className="t-label">Company name</span>
            <input
              className="input"
              name="company"
              required
              autoComplete="organization"
              placeholder="Hendricks Concrete"
            />
          </label>
          <label className="field">
            <span className="t-label">Your name</span>
            <input className="input" name="name" autoComplete="name" placeholder="Dale Hendricks" />
          </label>
          <label className="field">
            <span className="t-label">Timezone</span>
            <select className="input" name="timezone" defaultValue="America/Chicago">
              <option value="America/New_York">Eastern — New York</option>
              <option value="America/Chicago">Central — Chicago</option>
              <option value="America/Denver">Mountain — Denver</option>
              <option value="America/Phoenix">Mountain, no DST — Phoenix</option>
              <option value="America/Los_Angeles">Pacific — Los Angeles</option>
            </select>
          </label>
        </>
      ) : null}

      <label className="field">
        <span className="t-label">Email</span>
        <input
          className="input input-mono"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="dale@hendricksconcrete.com"
        />
      </label>

      <label className="field">
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

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "One moment…" : isSignup ? "Start the 30-day trial" : "Sign in"}
      </button>

      <p className="t-secondary text-center">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--accent)" }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" style={{ color: "var(--accent)" }}>
              Start the 30-day trial
            </Link>
          </>
        )}
      </p>
      <p className="t-secondary text-center">
        <Link href="/join" style={{ color: "var(--fg-2)" }}>
          Crew member? Join with your code.
        </Link>
      </p>
    </form>
  );
}
