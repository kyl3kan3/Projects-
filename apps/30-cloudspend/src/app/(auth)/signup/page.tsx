import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Watch my bill" };

export default function SignupPage() {
  return (
    <main className="gutter" style={{ maxWidth: 460, margin: "0 auto", padding: "56px 20px 80px" }}>
      <p className="t-label" style={{ marginBottom: 12, color: "var(--color-steel)" }}>
        CloudSpend
      </p>
      <h1 className="t-h2" style={{ marginBottom: 12 }}>
        Two weeks on Startup. No card.
      </h1>
      <p className="t-body" style={{ color: "var(--color-text-2)", marginBottom: 32 }}>
        Connect a read-only role, and the next spike arrives in Slack with the
        deploy that caused it attached.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
