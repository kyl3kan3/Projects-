"use client";

import { useActionState } from "react";
import Link from "next/link";
import { IconAlert } from "@/components/icons";
import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const isSignup = mode === "signup";

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      {isSignup ? (
        <>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Firm name</span>
            <input
              className="field"
              name="firmName"
              placeholder="Northbank Studio"
              autoComplete="organization"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Your name</span>
            <input
              className="field"
              name="personName"
              placeholder="Ana Reyes"
              autoComplete="name"
              required
            />
          </label>
        </>
      ) : null}

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Work email</span>
        <input
          className="field"
          type="email"
          name="email"
          inputMode="email"
          placeholder="ana@northbank.studio"
          autoComplete="email"
          required
        />
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Password</span>
        <input
          className="field"
          type="password"
          name="password"
          placeholder={isSignup ? "At least 8 characters" : "Your password"}
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8, alignItems: "flex-start" }}
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending
          ? isSignup
            ? "Creating your firm…"
            : "Signing in…"
          : isSignup
            ? "Run your aging audit"
            : "Sign in"}
      </button>

      <p className="t-secondary" style={{ textAlign: "center" }}>
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--color-banker)", fontWeight: 600 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--color-banker)", fontWeight: 600 }}>
              Run your aging audit
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
