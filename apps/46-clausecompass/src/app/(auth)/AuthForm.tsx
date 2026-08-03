"use client";

/**
 * The shared sign-in / sign-up form.
 *
 * Fields are controlled, which is not decoration: React 19 resets an uncontrolled form
 * after a form action resolves, so a rejected sign-up would wipe the name and email
 * along with the bad password.
 *
 * The acknowledgment checkbox is the only thing here that is a product requirement
 * rather than plumbing. It is unticked by default, its label says what is being
 * acknowledged in full, and the server refuses the signup without it.
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import type { AuthFormState } from "./actions";
import { IconAlertTriangle } from "@/components/icons";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <form action={formAction} noValidate>
      {isSignup && (
        <label className="field">
          <span className="field-label">Your name</span>
          <input
            className="input"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Rae Whitcombe"
            required
          />
        </label>
      )}

      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@yourstudio.com"
          required
        />
      </label>

      <label className="field">
        <span className="field-label">Password</span>
        <input
          className="input"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
        />
        {isSignup && (
          <span className="field-help">
            At least 10 characters. Your contracts sit behind this password.
          </span>
        )}
      </label>

      {isSignup && (
        <label
          className="mb-6 flex items-start gap-3"
          style={{ minHeight: 44, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            name="acknowledged"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{ width: 20, height: 20, flex: "none", marginTop: 2, accentColor: "var(--color-oxblood)" }}
          />
          <span className="t-secondary" style={{ color: "var(--color-text-2)" }}>
            I understand that ClauseCompass is a reading tool, not a law firm, and that a
            review is not legal advice. It describes a document and flags what a careful
            reader would question.
          </span>
        </label>
      )}

      {state.error && (
        <p
          className="mb-5 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-oxblood)" }}
          role="alert"
        >
          <IconAlertTriangle size={18} />
          <span>{state.error}</span>
        </p>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Working…" : isSignup ? "Create your account" : "Sign in"}
      </button>

      <p className="t-secondary mt-5 text-center">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="btn-quiet btn-quiet-sm">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" className="btn-quiet btn-quiet-sm">
              Create one
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
