"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "./actions";

const initial: AuthState = { error: null };

/** What the visitor typed, restored after React's post-action form reset. */
function kept(state: AuthState, key: string, fallback = ""): string {
  return state.values?.[key] ?? fallback;
}

const STATES = [
  ["TX", "Texas"],
  ["CO", "Colorado"],
  ["MA", "Massachusetts"],
  ["IL", "Illinois"],
  ["AZ", "Arizona"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["NC", "North Carolina"],
  ["TN", "Tennessee"],
  ["WA", "Washington"],
] as const;

const ZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona (no DST)"],
  ["America/Los_Angeles", "Pacific"],
] as const;

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initial);
  return (
    <form action={action} noValidate>
      <label className="field">
        <span className="field-label">Your name</span>
        <input
          className="input"
          name="name"
          autoComplete="name"
          required
          placeholder="Rita Bell"
          defaultValue={kept(state, "name")}
        />
      </label>
      <label className="field">
        <span className="field-label">Company</span>
        <input
          className="input"
          name="companyName"
          autoComplete="organization"
          required
          placeholder="Bell Transaction Coordination"
          defaultValue={kept(state, "companyName")}
        />
      </label>
      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@yourdesk.com"
          defaultValue={kept(state, "email")}
        />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="field-help">At least 8 characters.</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span className="field-label">State</span>
          <select className="input" name="state" defaultValue={kept(state, "state", "TX")}>
            {STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <span className="field-help">Sets the holiday calendar your date rules observe.</span>
        </label>
        <label className="field">
          <span className="field-label">Time zone</span>
          <select
            className="input"
            name="timezone"
            defaultValue={kept(state, "timezone", "America/Chicago")}
          >
            {ZONES.map(([tz, name]) => (
              <option key={tz} value={tz}>
                {name}
              </option>
            ))}
          </select>
          <span className="field-help">Decides which day &ldquo;today&rdquo; is on your timeline.</span>
        </label>
      </div>

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "Opening your desk…" : "Start free — 14 days"}
      </button>
      <p className="t-secondary mt-3 text-center">
        No card. Four starter checklists are waiting when you land.
      </p>
      <p className="t-secondary mt-6 text-center">
        Already have a desk?{" "}
        <Link href="/login" className="btn-quiet">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} noValidate>
      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={kept(state, "email")}
        />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
      <p className="t-secondary mt-6 text-center">
        New here?{" "}
        <Link href="/signup" className="btn-quiet">
          Start free — 14 days
        </Link>
      </p>
    </form>
  );
}
