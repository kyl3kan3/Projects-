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
          <label className="flex flex-col gap-2">
            <span className="t-label">Store name</span>
            <input className="input" name="storeName" autoComplete="organization" placeholder="Harbor Goods" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Store domain</span>
            <input
              className="input input-mono"
              name="domain"
              autoComplete="url"
              placeholder="harborgoods.com"
            />
          </label>
        </>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="t-label">Email</span>
        <input
          className="input input-mono"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@harborgoods.com"
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
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "One moment…" : isSignup ? "Start collecting — free" : "Sign in"}
      </button>

      <p className="t-secondary text-center">
        {isSignup ? (
          <>
            Already collecting?{" "}
            <Link href="/login" style={{ color: "var(--color-gold)" }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" style={{ color: "var(--color-gold)" }}>
              Start collecting — free
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
