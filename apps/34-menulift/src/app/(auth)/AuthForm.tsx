"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type AuthState } from "./actions";

const INITIAL: AuthState = { error: null };

/**
 * One form for both modes. The timezone is read from the browser rather than
 * asked for: a restaurant's service day, dayparts, and nightly auto-restore all
 * hang off it, and the owner filling this in is standing in the restaurant.
 */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    INITIAL,
  );

  const timezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  return (
    <form action={action} style={{ display: "grid", gap: 16 }}>
      {mode === "signup" ? (
        <>
          <input type="hidden" name="timezone" value={timezone} />
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Restaurant name</span>
            <input
              className="input"
              name="restaurantName"
              required
              autoComplete="organization"
              placeholder="Rossi &amp; Co"
            />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Your name</span>
            <input className="input" name="name" autoComplete="name" placeholder="Dana Rossi" />
          </label>
        </>
      ) : null}

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Email</span>
        <input
          className="input"
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="dana@rossiandco.com"
        />
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Password</span>
        <input
          className="input"
          type="password"
          name="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : ""}
        />
      </label>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "#c05a3e", margin: 0 }}>
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending
          ? mode === "signup"
            ? "Creating…"
            : "Signing in…"
          : mode === "signup"
            ? "Start the 14-day trial"
            : "Sign in"}
      </button>

      <p className="t-secondary" style={{ margin: 0, textAlign: "center" }}>
        {mode === "signup" ? (
          <>
            Already set up? <Link href="/login" style={{ color: "#c05a3e" }}>Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup" style={{ color: "#c05a3e" }}>Start a trial</Link>
          </>
        )}
      </p>
    </form>
  );
}
