import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="gutter" style={{ maxWidth: 480, margin: "0 auto", padding: "56px 20px 80px" }}>
      <p className="t-label" style={{ marginBottom: 12 }}>PaidWell</p>
      <h1 className="t-display" style={{ marginBottom: 12 }}>Welcome back.</h1>
      <p className="t-body" style={{ color: "var(--color-text-2)", marginBottom: 32 }}>
        Your ladder has been running. Nothing left without your say-so.
      </p>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
