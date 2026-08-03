import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { TRIAL_DAYS, TRIAL_QUOTE_LIMIT } from "@/lib/plans";

export const metadata: Metadata = { title: "Start quoting free" };

export default function SignupPage() {
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
        Send the bid from the driveway
      </h1>
      <p className="t-secondary" style={{ marginTop: 8, marginBottom: 32 }}>
        {TRIAL_DAYS} days, no card, {TRIAL_QUOTE_LIMIT} AI-drafted quotes — enough to win one real
        job. Your price book, your numbers.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
