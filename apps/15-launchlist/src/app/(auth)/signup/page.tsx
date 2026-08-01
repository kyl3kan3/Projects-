import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";
import { Wordmark } from "@/components/icons";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Start a waitlist" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <main
      className="page-column"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 420 }}
    >
      <Link href="/" style={{ marginBottom: 32 }}>
        <Wordmark />
      </Link>
      <h1 className="t-h2" style={{ marginBottom: 4 }}>
        Turn &ldquo;coming soon&rdquo; into a queue.
      </h1>
      <p className="t-secondary" style={{ marginBottom: 32 }}>
        A launch page, an email capture and working referral mechanics in about two minutes. Free
        for your first {PLANS.free.signupsPerList} signups — no card.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
