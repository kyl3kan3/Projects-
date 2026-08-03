"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import type { AuthFormState } from "./actions";

const TIMEZONES: [string, string][] = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
];

export function AuthForm({
  mode,
  action,
}: {
  mode: "signup" | "login";
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const isSignup = mode === "signup";

  return (
    <main className="screen" style={{ paddingTop: 32, paddingBottom: 40, maxWidth: 460 }}>
      <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icon name="chair-side" size={22} />
        <span className="t-title" style={{ fontWeight: 700 }}>
          RecallDesk
        </span>
      </Link>

      <h1 className="t-h2" style={{ marginTop: 32, marginBottom: 8 }}>
        {isSignup ? "Start your 14-day trial" : "Sign in"}
      </h1>
      <p className="t-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
        {isSignup
          ? "No card. The trial ends with your own overdue list and its dollar total on screen."
          : "Your roster, your queue, your ledger."}
      </p>

      <form action={formAction} style={{ display: "grid", gap: 16 }}>
        {isSignup && (
          <>
            <Field label="Your name" name="name" autoComplete="name" required placeholder="Dana Whitfield" />
            <Field
              label="Practice name"
              name="practiceName"
              required
              placeholder="Cedar Hollow Dental"
            />
            <Field
              label="First location"
              name="locationName"
              placeholder="Cedar Hollow — Maple St"
              hint="Leave blank to use the practice name."
            />
            <label style={{ display: "grid", gap: 6 }}>
              <span className="t-label">Time zone</span>
              <select className="input" name="timezone" defaultValue="America/Chicago">
                {TIMEZONES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="t-secondary">Quiet hours and the daily queue follow this.</span>
            </label>
          </>
        )}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="dana@cedarhollowdental.com"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          hint={isSignup ? "At least 8 characters." : undefined}
        />

        {state.error && (
          <p
            className="t-secondary"
            role="alert"
            style={{ color: "var(--color-red)", display: "flex", gap: 8, alignItems: "flex-start" }}
          >
            <Icon name="alert" size={18} style={{ flex: "none", marginTop: 1 }} />
            {state.error}
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "One moment…" : isSignup ? "See your overdue list" : "Sign in"}
        </button>
      </form>

      <p className="t-secondary" style={{ marginTop: 24 }}>
        {isSignup ? (
          <>
            Already have an account? <Link href="/login" style={{ color: "var(--color-aqua-text)", fontWeight: 700 }}>Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup" style={{ color: "var(--color-aqua-text)", fontWeight: 700 }}>Start a trial</Link>
          </>
        )}
      </p>
    </main>
  );
}

function Field({
  label,
  name,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span className="t-label">{label}</span>
      <input className="input" name={name} {...rest} />
      {hint && <span className="t-secondary">{hint}</span>}
    </label>
  );
}
