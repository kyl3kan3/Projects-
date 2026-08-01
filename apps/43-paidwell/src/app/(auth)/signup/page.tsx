import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Run your aging audit" };

export default function SignupPage() {
  return (
    <main className="gutter" style={{ maxWidth: 480, margin: "0 auto", padding: "56px 20px 80px" }}>
      <p className="t-label" style={{ marginBottom: 12 }}>PaidWell</p>
      <h1 className="t-display" style={{ marginBottom: 12 }}>
        See what you&rsquo;re owed, and what we&rsquo;d say about it.
      </h1>
      <p className="t-body" style={{ color: "var(--color-text-2)", marginBottom: 32 }}>
        Connect read-only and get your real DSO, your slowest payer, and the exact
        follow-ups we would send &mdash; before a single one goes out. New firms start
        in approval mode: nothing reaches a client until you tap Approve.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
