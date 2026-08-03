import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="gutter" style={{ maxWidth: 460, margin: "0 auto", padding: "56px 20px 80px" }}>
      <p className="t-label" style={{ marginBottom: 12, color: "var(--color-steel)" }}>
        CloudSpend
      </p>
      <h1 className="t-h2" style={{ marginBottom: 12 }}>
        Welcome back.
      </h1>
      <p className="t-body" style={{ color: "var(--color-text-2)", marginBottom: 32 }}>
        The watch has been running. Nothing has been missed.
      </p>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
