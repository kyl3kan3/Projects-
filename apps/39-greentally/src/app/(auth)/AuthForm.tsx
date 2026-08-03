"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type AuthState } from "./actions";
import { TallyMark } from "@/components/icons";

/**
 * Sign-up and sign-in, one component. The primary action sits in the thumb zone and is
 * full-width at 390px; error text is rendered above the button where a thumb is not
 * covering it.
 */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "signup" ? signupAction : loginAction,
    {},
  );

  return (
    <div className="screen-plain pt-10">
      <Link href="/" className="inline-flex items-center gap-2" style={{ color: "var(--color-accent-text)" }}>
        <TallyMark size={22} />
        <span className="t-label" style={{ color: "var(--color-accent-text)" }}>
          GreenTally
        </span>
      </Link>

      <h1 className="t-h1 mt-8">
        {mode === "signup" ? "Answer the questionnaire" : "Sign in"}
      </h1>
      <p className="t-body mt-3" style={{ color: "var(--color-fg-2)", maxWidth: "38ch" }}>
        {mode === "signup"
          ? "Upload one electricity bill and see a real Scope 2 number with the factor it came from. No card."
          : "Your reporting year, your bills, your answers."}
      </p>

      <form action={action} className="mt-8 flex flex-col gap-5">
        {mode === "signup" && (
          <>
            <label className="field">
              <span className="t-label">Company name</span>
              <input
                name="companyName"
                className="input"
                required
                autoComplete="organization"
                placeholder="Meserole Precision LLC"
              />
            </label>
            <label className="field">
              <span className="t-label">Your name</span>
              <input
                name="name"
                className="input"
                required
                autoComplete="name"
                placeholder="Dana Whitfield"
              />
            </label>
          </>
        )}

        <label className="field">
          <span className="t-label">Work email</span>
          <input
            name="email"
            type="email"
            className="input"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="dana@meseroleprecision.com"
          />
        </label>

        <label className="field">
          <span className="t-label">Password</span>
          <input
            name="password"
            type="password"
            className="input"
            required
            minLength={mode === "signup" ? 10 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "At least 10 characters" : ""}
          />
        </label>

        {state.error && (
          <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending
            ? mode === "signup"
              ? "Creating your account…"
              : "Signing in…"
            : mode === "signup"
              ? "Start the footprint preview"
              : "Sign in"}
        </button>
      </form>

      <p className="t-secondary mt-6">
        {mode === "signup" ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup">Start the footprint preview</Link>
          </>
        )}
      </p>
    </div>
  );
}
