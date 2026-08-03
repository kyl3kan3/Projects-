"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type AuthState } from "./actions";

const INITIAL: AuthState = { error: null };

/**
 * One form for both modes.
 *
 * Two things here are deliberate, and were both bugs first:
 *
 * 1. **The inputs are controlled.** React resets an uncontrolled form when a
 *    server action returns, so a rejected signup wiped the restaurant name, the
 *    owner's name and their email — making them retype everything to fix a
 *    password. Holding the values in state keeps them.
 *
 * 2. **The timezone is read after mount, not during render.** `Intl` in a client
 *    component's body also runs during the server render, where the server's zone
 *    is UTC, and React keeps that server value for the hidden input. Every
 *    restaurant was being saved as UTC — which throws off dayparts, "tonight" on
 *    the 86 board, and nightly auto-restore by however far the restaurant is from
 *    Greenwich. An effect gets the phone's real zone; the server falls back to a
 *    sane default if JavaScript never runs, and Settings can correct it either way.
 */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    INITIAL,
  );

  const [fields, setFields] = useState({
    restaurantName: "",
    name: "",
    email: "",
    password: "",
  });
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch {
      setTimezone("");
    }
  }, []);

  // The value is read *before* the updater runs. React clears `currentTarget`
  // once the event has been handled, and a functional updater runs later — so
  // reading it inside the updater throws "Cannot read properties of null".
  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.currentTarget;
    setFields((prev) => ({ ...prev, [key]: value }));
  };

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
              value={fields.restaurantName}
              onChange={set("restaurantName")}
            />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">Your name</span>
            <input
              className="input"
              name="name"
              autoComplete="name"
              placeholder="Dana Rossi"
              value={fields.name}
              onChange={set("name")}
            />
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
          value={fields.email}
          onChange={set("email")}
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
          value={fields.password}
          onChange={set("password")}
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
            Already set up?{" "}
            <Link href="/login" style={{ color: "#c05a3e" }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" style={{ color: "#c05a3e" }}>
              Start a trial
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
