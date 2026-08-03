"use client";

/**
 * One form, two modes. The fields and the copy are the only difference, and
 * duplicating a password input is how two screens drift apart.
 */

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthFormState } from "./actions";
import { TRADE_LABEL } from "@/lib/taxonomy";

const initial: AuthFormState = { error: null };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    initial,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {mode === "signup" && (
        <>
          <label className="block">
            <span className="t-label">Company</span>
            <input
              className="input mt-2"
              name="companyName"
              required
              autoComplete="organization"
              placeholder="Ridgeline Mechanical"
            />
          </label>

          <label className="block">
            <span className="t-label">Your name</span>
            <input className="input mt-2" name="name" autoComplete="name" placeholder="Ray Contreras" />
          </label>

          <label className="block">
            <span className="t-label">Trade focus</span>
            <select className="input mt-2" name="tradeFocus" defaultValue="hvac">
              {Object.entries(TRADE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="block">
        <span className="t-label">Email</span>
        <input
          className="input mt-2"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourcompany.com"
        />
      </label>

      <label className="block">
        <span className="t-label">Password</span>
        <input
          className="input mt-2"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : ""}
        />
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-full mt-2" disabled={pending}>
        {pending ? "One moment…" : mode === "signup" ? "Start the 14-day trial" : "Sign in"}
      </button>

      <p className="t-secondary text-center">
        {mode === "signup" ? (
          <>
            Already set up? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup">Start a trial</Link>
          </>
        )}
      </p>
    </form>
  );
}
