"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "./actions";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isSignup ? (
        <>
          <label className="field">
            <span className="t-label">Association name</span>
            <input
              className="input"
              name="associationName"
              required
              placeholder="Maple Ridge Homeowners Association"
            />
          </label>
          <label className="field">
            <span className="t-label">What kind</span>
            <select className="input" name="kind" defaultValue="hoa">
              <option value="hoa">Homeowners association</option>
              <option value="condo">Condominium association</option>
              <option value="club">Swim, tennis, or social club</option>
              <option value="league">Youth sports or rec league</option>
            </select>
          </label>
          <label className="field">
            <span className="t-label">Your name</span>
            <input
              className="input"
              name="name"
              autoComplete="name"
              required
              placeholder="Dana Whitfield"
            />
            <span className="t-secondary">
              Members see this on invoices and notices, so use the name they know.
            </span>
          </label>
        </>
      ) : null}

      <label className="field">
        <span className="t-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="treasurer@mapleridge.org"
        />
      </label>

      <label className="field">
        <span className="t-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder={isSignup ? "At least 8 characters" : ""}
        />
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "One moment…" : isSignup ? "Set up the association" : "Sign in"}
      </button>

      <p className="t-secondary text-center">
        {isSignup ? (
          <>
            Already set up? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New board? <Link href="/signup">Set up the association</Link>
          </>
        )}
      </p>
    </form>
  );
}
