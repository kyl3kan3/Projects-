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
        <label className="flex flex-col gap-2">
          <span className="t-label">Your name</span>
          <input
            className="input"
            name="name"
            autoComplete="name"
            placeholder="Ada Mwangi"
          />
          <span className="t-secondary">This is the name that signs your contracts.</span>
        </label>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="t-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@studio.example"
        />
      </label>

      <label className="flex flex-col gap-2">
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
        <p className="t-secondary" style={{ color: "var(--color-vermilion)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "One moment…" : isSignup ? "Start free — 3 documents a month" : "Sign in"}
      </button>

      <p className="t-secondary text-center">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--color-fountain)" }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" style={{ color: "var(--color-fountain)" }}>
              Start free
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
