import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { currentContext } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/plans";
import { RadarArc } from "@/components/icons";

export const metadata: Metadata = { title: "Start free — 14 days" };

export default async function SignupPage() {
  if (await currentContext()) redirect("/radar");

  return (
    <main className="screen pt-10" style={{ maxWidth: 480 }}>
      <Link href="/" className="flex items-center gap-2" style={{ color: "var(--color-ink)", textDecoration: "none" }}>
        <RadarArc size={22} />
        <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
          RFPRadar
        </span>
      </Link>

      <h1 className="t-h2 mt-8">Set up your capture desk</h1>
      <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
        {TRIAL_DAYS} days, no card. You will build a keyword profile next, and the
        first morning scan runs at 6am your time.
      </p>

      <div className="mt-8">
        <AuthForm action={signupAction} mode="signup" />
      </div>

      <p className="t-secondary mt-6">
        Already have a seat? <Link href="/login" className="btn-quiet">Sign in</Link>
      </p>
    </main>
  );
}
