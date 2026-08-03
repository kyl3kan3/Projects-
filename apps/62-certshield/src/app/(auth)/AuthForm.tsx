"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "./actions";
import { IconShield } from "@/components/icons";

const INITIAL: AuthState = { error: null };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    INITIAL,
  );

  return (
    <main
      className="mx-auto px-5 pb-16 pt-10"
      style={{ maxWidth: 440, paddingLeft: "var(--gutter)", paddingRight: "var(--gutter)" }}
    >
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 no-underline"
        style={{ color: "var(--color-ink)" }}
      >
        <span style={{ color: "var(--color-seal)" }}>
          <IconShield size={20} />
        </span>
        <span className="t-title" style={{ fontWeight: 600 }}>
          CertShield
        </span>
      </Link>

      <h1 className="t-display" style={{ marginBottom: 8 }}>
        {mode === "signup" ? "Start free — 14 days" : "Sign in"}
      </h1>
      <p className="t-secondary" style={{ marginBottom: 24 }}>
        {mode === "signup"
          ? "No card. Import your vendors, send upload links, and see the first verdict the same afternoon."
          : "The compliance console for your vendor certificates."}
      </p>

      <form action={action} noValidate>
        {mode === "signup" && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="name">
                Your name
              </label>
              <input
                id="name"
                name="name"
                className="input"
                autoComplete="name"
                required
                placeholder="Dana Whitlock"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="orgName">
                Company
              </label>
              <input
                id="orgName"
                name="orgName"
                className="input"
                autoComplete="organization"
                required
                placeholder="Harbor Ridge Management"
              />
              <p className="field-help">
                This is the name your vendors&apos; certificates have to list as the certificate
                holder. You can change the exact wording in settings.
              </p>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="kind">
                What you manage
              </label>
              <select id="kind" name="kind" className="input" defaultValue="property_mgmt">
                <option value="property_mgmt">Properties (property management)</option>
                <option value="gc">Projects (general contractor)</option>
                <option value="other">Something else</option>
              </select>
            </div>
          </>
        )}

        <div className="field">
          <label className="field-label" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="email"
            required
            placeholder="dana@harborridge.com"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
          />
          {mode === "signup" && <p className="field-help">At least 8 characters.</p>}
        </div>

        {state.error && (
          <p className="field-error" role="alert" style={{ marginBottom: 16 }}>
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending
            ? mode === "signup"
              ? "Creating your file…"
              : "Signing in…"
            : mode === "signup"
              ? "Start free — 14 days"
              : "Sign in"}
        </button>
      </form>

      <p className="t-secondary" style={{ marginTop: 20 }}>
        {mode === "signup" ? (
          <>
            Already have an account? <Link href="/login" className="btn-quiet">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup" className="btn-quiet">Start free — 14 days</Link>
          </>
        )}
      </p>
    </main>
  );
}
