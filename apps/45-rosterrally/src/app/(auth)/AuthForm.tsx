"use client";

import Link from "next/link";
import { ActionForm, type FormState } from "@/components/ActionForm";

/**
 * The two account screens. Split out as a client component because the shared
 * `ActionForm` owns pending state; the server pages stay thin.
 */

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const SPORTS = [
  ["soccer", "Soccer"],
  ["baseball", "Baseball"],
  ["softball", "Softball"],
  ["basketball", "Basketball"],
  ["hockey", "Hockey"],
  ["lacrosse", "Lacrosse"],
  ["swim", "Swim"],
] as const;

export function SignupForm({
  action,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  return (
    <ActionForm action={action} submitLabel="Open your season" pendingLabel="Opening…" full>
      <div className="field">
        <label className="t-label" htmlFor="clubName">
          Club name
        </label>
        <input
          id="clubName"
          name="clubName"
          className="input"
          placeholder="Millbrook Youth Soccer"
          required
        />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="sport">
          Sport
        </label>
        <select id="sport" name="sport" className="input" defaultValue="soccer">
          {SPORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="t-label" htmlFor="timezone">
          Club timezone
        </label>
        <select id="timezone" name="timezone" className="input" defaultValue="America/New_York">
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace("America/", "").replace("_", " ")}
            </option>
          ))}
        </select>
        <p className="t-secondary">
          Every game time you type is read in this zone. It is what makes the conflict checker
          right across a daylight-saving weekend.
        </p>
      </div>
      <div className="field">
        <label className="t-label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" placeholder="Dana Whitfield" required />
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
          placeholder="registrar@millbrooksoccer.org"
          autoComplete="email"
          required
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
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="t-secondary">At least 8 characters.</p>
      </div>
      <p className="t-secondary">
        Already set up? <Link href="/login">Sign in</Link>
      </p>
    </ActionForm>
  );
}

export function LoginForm({
  action,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  return (
    <ActionForm action={action} submitLabel="Sign in" pendingLabel="Signing in…" full>
      <div className="field">
        <label className="t-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          required
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
          autoComplete="current-password"
          required
        />
      </div>
      <p className="t-secondary">
        New club? <Link href="/signup">Open your season</Link>
      </p>
    </ActionForm>
  );
}
