"use client";

import { useActionState } from "react";
import Link from "next/link";
import { IconGithub } from "@/components/icons";
import type { AuthFormState } from "./actions";

export function AuthForm({
  mode,
  action,
  githubEnabled,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  githubEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <div className="flex flex-col gap-6">
      {githubEnabled ? (
        <>
          <a href="/api/auth/github" className="btn btn-secondary btn-full no-underline">
            <IconGithub size={18} />
            Continue with GitHub
          </a>
          <div className="flex items-center gap-3">
            <span className="hairline-t flex-1" />
            <span className="t-label">or</span>
            <span className="hairline-t flex-1" />
          </div>
        </>
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        {isSignup ? (
          <label className="flex flex-col gap-2">
            <span className="t-label">Name</span>
            <input className="input" name="name" autoComplete="name" placeholder="Ada Okafor" />
          </label>
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
            placeholder="you@example.com"
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
          <p className="t-secondary" style={{ color: "var(--color-torch)" }} role="alert">
            {state.error}
          </p>
        ) : null}

        <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
          {pending ? "One moment…" : isSignup ? "Protect my database" : "Sign in"}
        </button>

        <p className="t-secondary text-center">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "var(--color-brass)" }}>
                Sign in
              </Link>
            </>
          ) : (
            <>
              No account yet?{" "}
              <Link href="/signup" style={{ color: "var(--color-brass)" }}>
                Protect my database
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
