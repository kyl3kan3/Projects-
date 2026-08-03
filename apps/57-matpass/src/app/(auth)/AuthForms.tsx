"use client";

import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { loginAction, signupAction } from "./actions";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Dublin",
  "Australia/Sydney",
];

export function SignupForm() {
  return (
    <ActionForm action={signupAction} submitLabel="Start free — 14 days" pendingLabel="Setting up…" full>
      <div className="field">
        <label className="t-label" htmlFor="schoolName">
          School name
        </label>
        <input
          id="schoolName"
          name="schoolName"
          className="input"
          required
          autoComplete="organization"
          placeholder="Northgate Jiu-Jitsu"
        />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          name="name"
          className="input"
          required
          autoComplete="name"
          placeholder="Danielle Reyes"
        />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          required
          autoComplete="email"
          placeholder="you@yourdojo.com"
        />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="timezone">
          Timezone
        </label>
        <select id="timezone" name="timezone" className="input" defaultValue="America/Chicago">
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace("_", " ")}
            </option>
          ))}
        </select>
        <p className="t-secondary fg-3">
          Class times, days-in-rank and the nightly retention scan all run on this clock.
        </p>
      </div>
      <p className="t-secondary fg-3">
        No card required. Import your students in an evening.
      </p>
      <p className="t-secondary">
        Already set up? <Link href="/login">Sign in</Link>
      </p>
    </ActionForm>
  );
}

export function LoginForm() {
  return (
    <ActionForm action={loginAction} submitLabel="Sign in" pendingLabel="Signing in…" full>
      <div className="field">
        <label className="t-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          required
          autoComplete="email"
          placeholder="you@yourdojo.com"
        />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          required
          autoComplete="current-password"
        />
      </div>
      <p className="t-secondary">
        New here? <Link href="/signup">Start free — 14 days</Link>
      </p>
    </ActionForm>
  );
}
