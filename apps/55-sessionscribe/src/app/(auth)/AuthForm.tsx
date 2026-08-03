"use client";

/**
 * Sign in / sign up. One client component for both, because the difference is
 * four fields and a consent checkbox, not a different screen.
 *
 * Mobile-first: the submit button is full-width in the thumb zone, fields are
 * 48px with 16px text (which is also what stops iOS zooming on focus), and the
 * whole form fits above the keyboard at 390×844.
 */

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type AuthState } from "./actions";
import { IconMark } from "@/components/icons";

const initial: AuthState = {};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    initial,
  );

  return (
    <main className="mx-auto w-full max-w-[420px] px-5 pb-16 pt-12">
      <div className="mb-8 flex items-center gap-2">
        <span style={{ color: "var(--color-sage)" }}>
          <IconMark size={22} />
        </span>
        <span className="t-title">SessionScribe</span>
      </div>

      <h1 className="t-h2 mb-2">
        {mode === "signup" ? "Set up your practice" : "Sign in"}
      </h1>
      <p className="t-secondary mb-6">
        {mode === "signup"
          ? "Fourteen days, every feature, no card. Your signed notes are yours whatever you decide at the end."
          : "Your notes are where you left them."}
      </p>

      <form action={action} noValidate>
        {mode === "signup" && (
          <>
            <label className="field">
              <span className="field-label">Practice name</span>
              <input
                className="input"
                name="practiceName"
                autoComplete="organization"
                placeholder="Bayview Counseling"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Your name</span>
              <input
                className="input"
                name="name"
                autoComplete="name"
                placeholder="Dana Alvarez"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Credentials</span>
              <input
                className="input"
                name="credentials"
                placeholder="LMFT #114382"
                required
              />
              <span className="field-help">
                These appear on every signature you write. You can change them later.
              </span>
            </label>
            <label className="field">
              <span className="field-label">Default note format</span>
              <select className="input" name="defaultFormat" defaultValue="soap">
                <option value="soap">SOAP — Subjective, Objective, Assessment, Plan</option>
                <option value="dap">DAP — Data, Assessment, Plan</option>
              </select>
            </label>
          </>
        )}

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="input"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@practice.com"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />
          {mode === "signup" && (
            <span className="field-help">
              At least 10 characters — this account can open clinical records.
            </span>
          )}
        </label>

        {mode === "signup" && (
          <label className="mb-5 flex items-start gap-3">
            <input
              type="checkbox"
              name="acceptedBaa"
              className="mt-1 h-5 w-5 flex-none"
              style={{ accentColor: "var(--color-sage)" }}
              required
            />
            <span className="t-secondary">
              I accept the Business Associate Agreement and confirm I am responsible
              for obtaining recording consent from clients before recording a session.
            </span>
          </label>
        )}

        {state.error && (
          <p className="field-error mb-4" role="alert">
            {state.error}
          </p>
        )}

        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending
            ? "One moment…"
            : mode === "signup"
              ? "Start free — 14 days"
              : "Sign in"}
        </button>
      </form>

      <p className="t-secondary mt-6">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link className="btn-quiet" href="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="btn-quiet" href="/signup">
              Set up your practice
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
