"use client";

/**
 * The shared sign-in / sign-up form. One client component for both, because the
 * only difference is two extra fields and the action it posts to.
 *
 * The fields are controlled, which is not decoration: React 19 resets an
 * uncontrolled form after a form action resolves, so a rejected sign-up would wipe
 * the practice name, the user's name and the email along with the bad password.
 * Found in the browser, not by the type checker.
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import type { AuthFormState } from "./actions";
import { IconAlert } from "@/components/icons";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const isSignup = mode === "signup";

  const [practiceName, setPracticeName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} noValidate>
      {isSignup && (
        <>
          <label className="field">
            <span className="field-label">Practice name</span>
            <input
              className="input"
              name="practiceName"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
              autoComplete="organization"
              placeholder="Riverbend Counseling"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Your name</span>
            <input
              className="input"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Adaeze Osei"
              required
            />
          </label>
        </>
      )}

      <label className="field">
        <span className="field-label">Work email</span>
        <input
          className="input"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@riverbendcounseling.com"
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
            At least 10 characters. This account can open patient records, so it is worth a
            password manager entry.
          </span>
        )}
      </label>

      {state.error && (
        <p
          className="mb-5 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-clay)" }}
          role="alert"
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Working…" : isSignup ? "Create the practice" : "Sign in"}
      </button>

      <p className="t-secondary mt-5 text-center">
        {isSignup ? (
          <>
            Already set up? <Link href="/login" className="btn-quiet">Sign in</Link>
          </>
        ) : (
          <>
            New practice? <Link href="/signup" className="btn-quiet">Start a 14-day trial</Link>
          </>
        )}
      </p>
    </form>
  );
}
