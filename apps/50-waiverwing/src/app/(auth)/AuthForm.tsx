"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthFormState } from "./actions";
import { IconBlaze } from "@/components/icons";
import { TEMPLATES } from "@/lib/templates";

const initial: AuthFormState = {};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    initial,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-5 pb-10 pt-12">
      <Link href="/" className="mb-10 flex items-center gap-2 no-underline">
        <IconBlaze size={22} style={{ color: "var(--color-trail)" }} />
        <span className="t-title">WaiverWing</span>
      </Link>

      <h1 className="t-h2">
        {mode === "signup" ? "Start taking signed waivers" : "Sign in"}
      </h1>
      <p className="t-secondary mt-2">
        {mode === "signup"
          ? "14 days, every feature, no card. Your starter waiver is published as soon as you finish this form."
          : "Staff sign in here. Customers never need an account."}
      </p>

      <form action={action} className="mt-8 flex flex-col gap-4">
        {mode === "signup" ? (
          <>
            <label className="flex flex-col gap-2">
              <span className="t-label">Business name</span>
              <input
                name="businessName"
                className="input"
                required
                placeholder="Granite Works Climbing"
                autoComplete="organization"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Your name</span>
              <input
                name="name"
                className="input"
                placeholder="Dana Reyes"
                autoComplete="name"
              />
            </label>
          </>
        ) : null}

        <label className="flex flex-col gap-2">
          <span className="t-label">Email</span>
          <input
            name="email"
            type="email"
            className="input"
            required
            placeholder="dana@graniteworks.com"
            autoComplete="email"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Password</span>
          <input
            name="password"
            type="password"
            className="input"
            required
            minLength={8}
            placeholder={mode === "signup" ? "At least 8 characters" : ""}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>

        {mode === "signup" ? (
          <label className="flex flex-col gap-2">
            <span className="t-label">Starter waiver</span>
            <select name="template" className="input" defaultValue="climbing">
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="t-secondary">
              A starting point, not legal advice — have your attorney review the language
              before you take a real signature on it. You can edit every clause.
            </span>
          </label>
        ) : null}

        {state.error ? (
          <p className="t-secondary" style={{ color: "var(--color-ember)" }} role="alert">
            {state.error}
          </p>
        ) : null}

        <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
          {pending
            ? mode === "signup"
              ? "Setting up…"
              : "Signing in…"
            : mode === "signup"
              ? "Create the account"
              : "Sign in"}
        </button>
      </form>

      <p className="t-secondary mt-8">
        {mode === "signup" ? (
          <>
            Already set up? <Link href="/login" className="btn-quiet">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup" className="btn-quiet">Start a trial</Link>
          </>
        )}
      </p>
    </main>
  );
}
