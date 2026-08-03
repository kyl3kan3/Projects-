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
  // React resets the form after the action; these bring the typed values back.
  const kept = state.values ?? {};

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      {isSignup ? (
        <>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Company</span>
            <input
              className="field"
              name="orgName"
              defaultValue={kept.orgName ?? ""}
              placeholder="Northwind Labs"
              autoComplete="organization"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Your name</span>
            <input
              className="field"
              name="personName"
              defaultValue={kept.personName ?? ""}
              placeholder="Dana Whitlock"
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
          defaultValue={kept.email ?? ""}
          inputMode="email"
          placeholder="dana@northwind.dev"
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
          style={{ color: "var(--color-amber)", display: "flex", gap: 8, alignItems: "flex-start" }}
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? (isSignup ? "Setting up…" : "Signing in…") : isSignup ? "Watch my bill" : "Sign in"}
      </button>

      <p className="t-secondary" style={{ textAlign: "center" }}>
        {isSignup ? (
          <>
            Already watching?{" "}
            <Link href="/login" style={{ color: "var(--color-steel)", fontWeight: 600 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--color-steel)", fontWeight: 600 }}>
              Watch my bill
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
