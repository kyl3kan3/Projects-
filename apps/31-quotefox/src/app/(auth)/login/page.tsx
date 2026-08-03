import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="gutter" style={{ maxWidth: 460, margin: "0 auto", paddingBottom: 56 }}>
      <Link
        href="/"
        className="t-label"
        style={{ display: "inline-flex", minHeight: 44, alignItems: "center", color: "var(--color-hi-vis)" }}
      >
        QuoteFox
      </Link>
      <h1 className="t-h2" style={{ marginTop: 8 }}>
        Sign in
      </h1>
      <p className="t-secondary" style={{ marginTop: 8, marginBottom: 32 }}>
        Pick up where the last walkthrough left off.
      </p>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
