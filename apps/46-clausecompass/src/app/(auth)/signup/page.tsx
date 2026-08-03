import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="t-display mb-3">Know what you&rsquo;re signing.</h1>
      <p className="t-body mb-8" style={{ color: "var(--color-text-2)" }}>
        Upload a contract and get every clause quoted, scored against a playbook, and
        explained in plain English. Reviews are $19 each, or 5 a month on Freelancer.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </>
  );
}
