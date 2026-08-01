import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { IconShieldMark } from "@/components/TabBar";

export const metadata: Metadata = { title: "Start a trial" };

export default function SignupPage() {
  return (
    <main className="screen pt-10" style={{ paddingBottom: 40, maxWidth: 440 }}>
      <Link href="/" className="mb-10 inline-flex items-center gap-2 no-underline" style={{ color: "var(--color-ink)" }}>
        <span style={{ color: "var(--color-teal)" }}>
          <IconShieldMark size={22} />
        </span>
        <span className="t-title">FormForge</span>
      </Link>

      <h1 className="t-h2">Start a 14-day trial</h1>
      <p className="t-secondary mb-8 mt-2">
        No card. Your practice gets its own encryption key the moment this form is submitted —
        every patient field is written as ciphertext under it.
      </p>

      <AuthForm mode="signup" action={signupAction} />

      <p className="t-secondary mt-8" style={{ color: "var(--color-ink-3)" }}>
        FormForge is pre-launch software. Use test data, not real patient records — see the
        agreement you will be shown next.
      </p>
    </main>
  );
}
