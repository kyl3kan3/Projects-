"use client";

import Link from "next/link";
import { ActionForm, type ActionState } from "@/components/ActionForm";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const isSignup = mode === "signup";
  return (
    <div className="stack" style={{ gap: "var(--s6)" }}>
      <ActionForm action={action} submitLabel={isSignup ? "Start bidding" : "Sign in"}>
        {isSignup ? (
          <>
            <label className="field">
              <span className="t-label">Company</span>
              <input
                className="input"
                name="company"
                required
                autoComplete="organization"
                placeholder="Fulton Build Group"
              />
            </label>
            <label className="field">
              <span className="t-label">Your name</span>
              <input
                className="input"
                name="name"
                autoComplete="name"
                placeholder="Kyle Ferrand"
              />
            </label>
          </>
        ) : null}
        <label className="field">
          <span className="t-label">Work email</span>
          <input
            className="input"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@fultonbuild.com"
          />
        </label>
        <label className="field">
          <span className="t-label">Password</span>
          <input
            className="input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder={isSignup ? "At least 8 characters" : ""}
          />
        </label>
      </ActionForm>

      <div className="stack" style={{ gap: "var(--s1)" }}>
        <p className="t-secondary">
          {isSignup ? "Already running bids here?" : "First package to put out?"}
        </p>
        <Link className="link link-block" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </div>
    </div>
  );
}
