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
            <span className="t-label">Company name</span>
            <input
              className="field"
              name="companyName"
              placeholder="Deleon Mechanical"
              autoComplete="organization"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Your name</span>
            <input
              className="field"
              name="personName"
              placeholder="Ray Deleon"
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
          placeholder="ray@deleonmech.com"
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
            ? "Setting up your shop…"
            : "Signing in…"
          : isSignup
            ? "Start quoting free"
            : "Sign in"}
      </button>

      <p className="t-secondary" style={{ textAlign: "center" }}>
        {isSignup ? (
          <>
            Already set up?{" "}
            <Link href="/login" style={{ color: "var(--color-hi-vis)", fontWeight: 600 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--color-hi-vis)", fontWeight: 600 }}>
              Start quoting free
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
