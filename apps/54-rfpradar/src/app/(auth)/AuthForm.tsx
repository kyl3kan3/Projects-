"use client";

/**
 * The sign-up / sign-in / accept-invite form.
 *
 * `useActionState` keeps the typed values on a failed submit — retyping a firm
 * name because a password was eight characters instead of nine is the kind of
 * small insult that loses trials.
 *
 * The submit button sits at the bottom of the form in the thumb zone and is
 * full-width at 390px, per DESIGN_LANGUAGE's mobile rules.
 */

import { useActionState } from "react";
import type { AuthState } from "./actions";

export function AuthForm({
  action,
  mode,
  token,
  inviteEmail,
  firmName,
}: {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  mode: "signup" | "login" | "invite";
  token?: string;
  inviteEmail?: string;
  firmName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {token && <input type="hidden" name="token" value={token} />}
      {/* The firm's timezone decides when 6am is. Read it from the browser
          rather than asking, and let Settings correct it. */}
      {mode === "signup" && (
        <input
          type="hidden"
          name="timezone"
          value={Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"}
        />
      )}

      {mode === "signup" && (
        <label className="flex flex-col gap-2">
          <span className="t-label">Firm name</span>
          <input
            className="input"
            name="firmName"
            required
            autoComplete="organization"
            placeholder="Northgate IT Services"
          />
        </label>
      )}

      {mode !== "login" && (
        <label className="flex flex-col gap-2">
          <span className="t-label">Your name</span>
          <input
            className="input"
            name="name"
            required
            autoComplete="name"
            placeholder="M. Torres"
          />
        </label>
      )}

      {mode === "invite" ? (
        <div className="flex flex-col gap-2">
          <span className="t-label">Email</span>
          <p className="t-mono" style={{ color: "var(--color-ink-2)" }}>
            {inviteEmail}
          </p>
          {firmName && (
            <p className="t-secondary">
              You are joining <strong>{firmName}</strong>.
            </p>
          )}
        </div>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="t-label">Work email</span>
          <input
            className="input"
            name="email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder="you@firm.com"
          />
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="t-label">{mode === "login" ? "Password" : "Choose a password"}</span>
        <input
          className="input"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="At least 8 characters"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="t-secondary"
          style={{ color: "var(--color-red)" }}
        >
          {state.error}
        </p>
      )}

      <button className="btn btn-primary w-full mt-2" type="submit" disabled={pending}>
        {pending
          ? "Working…"
          : mode === "signup"
            ? "Start free — 14 days"
            : mode === "invite"
              ? "Set password and join"
              : "Sign in"}
      </button>

      {mode === "signup" && (
        <p className="t-secondary text-center">No card required.</p>
      )}
    </form>
  );
}
