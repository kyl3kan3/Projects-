"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ActionMessage, Field, SubmitButton, type ActionState } from "@/components/form";
import { loginAction, signupAction } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState<ActionState | null, FormData>(loginAction, null);
  return (
    <form action={action} noValidate>
      <ActionMessage state={state} />
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@yourcompany.com"
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <p className="t-secondary mt-6">
        No account yet?{" "}
        <Link href="/signup" style={{ color: "var(--fg)" }}>
          Start free — 14 days
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState<ActionState | null, FormData>(signupAction, null);
  return (
    <form action={action} noValidate>
      <ActionMessage state={state} />
      <Field label="Company name" htmlFor="carrierName" hint="However it reads on your authority.">
        <input
          id="carrierName"
          name="carrierName"
          required
          autoComplete="organization"
          placeholder="Bishop Hauling LLC"
        />
      </Field>
      <Field label="MC number" htmlFor="mcNumber" hint="Optional. It prints on your invoices.">
        <input id="mcNumber" name="mcNumber" inputMode="numeric" placeholder="812445" />
      </Field>
      <Field label="Your name" htmlFor="name">
        <input id="name" name="name" required autoComplete="name" placeholder="Ray Bishop" />
      </Field>
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="ray@bishophauling.com"
        />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <SubmitButton pendingLabel="Setting up…">Start free — 14 days</SubmitButton>
      <p className="t-secondary mt-6">
        Already running loads here?{" "}
        <Link href="/login" style={{ color: "var(--fg)" }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
