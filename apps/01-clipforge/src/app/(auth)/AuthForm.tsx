"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type AuthState } from "./actions";
import { BrandMark } from "@/components/icons";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "signup" ? signupAction : loginAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 flex items-center gap-2 font-display text-lg font-bold">
        <BrandMark size={24} />
        ClipForge
      </Link>
      <div className="card p-8">
        <h1 className="t-h2 font-display">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {mode === "signup"
            ? "Start free — 2 uploads, no card."
            : "Log in to your ClipForge workspace."}
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="t-label mb-1.5 block">Name</label>
              <input name="name" className="input" placeholder="Jane Creator" />
            </div>
          )}
          <div>
            <label className="t-label mb-1.5 block">Email</label>
            <input
              name="email"
              type="email"
              required
              className="input"
              placeholder="you@studio.com"
            />
          </div>
          <div>
            <label className="t-label mb-1.5 block">Password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="input"
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p className="rounded-[10px] px-3 py-2 text-sm" style={{ background: "rgba(242,109,109,0.08)", color: "var(--color-danger)" }}>
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn btn-primary btn-block">
            {pending ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-[var(--color-brand)]">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="text-[var(--color-brand)]">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
