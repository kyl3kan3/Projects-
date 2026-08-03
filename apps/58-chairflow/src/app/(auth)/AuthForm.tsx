"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, signupAction, type AuthValues } from "@/app/(auth)/actions";
import { FormError } from "@/components/ui";
import { emptyState, type FormState } from "@/lib/forms";
import { normalizeHandle } from "@/lib/format";

/**
 * Sign in / sign up.
 *
 * The handle preview is the point of the signup screen: a stylist is claiming the URL
 * that will sit in their Instagram bio, and seeing `chairflow.app/b/deecuts` appear as
 * they type is what makes the account worth creating. It is computed with the same pure
 * function the server validates against, so the preview cannot promise a handle the
 * server would refuse.
 */
const INITIAL: FormState<AuthValues> = emptyState({ email: "", name: "", handle: "" });

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    INITIAL,
  );
  const [handle, setHandle] = useState(state.values.handle);
  const slug = normalizeHandle(handle);

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <FormError message={state.error} />

      {mode === "signup" && (
        <>
          <label className="field">
            <span className="t-label">The name your clients know you by</span>
            <input
              className="input"
              name="name"
              autoComplete="name"
              required
              defaultValue={state.values.name}
              placeholder="Dee Nakamura"
            />
          </label>

          <label className="field">
            <span className="t-label">Your booking page</span>
            <input
              className="input"
              name="handle"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={state.values.handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="deecuts"
            />
            <span className="t-mono" style={{ color: slug ? "var(--color-cobalt)" : "var(--color-ink-2)" }}>
              {slug
                ? `chairflow.app/b/${slug}`
                : "3-30 characters: letters, numbers and dashes"}
            </span>
          </label>
        </>
      )}

      <label className="field">
        <span className="t-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={state.values.email}
          placeholder="dee@example.com"
        />
      </label>

      <label className="field">
        <span className="t-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder={mode === "signup" ? "At least 8 characters" : ""}
        />
      </label>

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending
          ? mode === "signup"
            ? "Claiming your page…"
            : "Signing in…"
          : mode === "signup"
            ? "Claim your booking page"
            : "Sign in"}
      </button>

      <p className="t-secondary" style={{ margin: 0 }}>
        {mode === "signup" ? (
          <>
            14 days free, no card. Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--color-cobalt)", fontWeight: 700 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" style={{ color: "var(--color-cobalt)", fontWeight: 700 }}>
              Claim your booking page
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
