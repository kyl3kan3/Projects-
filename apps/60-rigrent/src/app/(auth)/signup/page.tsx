import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = { title: "Start free" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "56px 20px" }}>
      <p className="t-placard tone-dim">RigRent</p>
      <h1 className="t-h2" style={{ marginTop: 8 }}>
        Kill the whiteboard
      </h1>
      <p className="t-secondary" style={{ marginTop: 8, marginBottom: 32 }}>
        {TRIAL_DAYS} days of everything, no card. Add the thing you own the most of and quote against
        it in five minutes.
      </p>
      <AuthForm mode="signup" action={signupAction} />
      <p className="t-secondary" style={{ marginTop: 24 }}>
        Already set up? <Link href="/login" className="btn-quiet">Sign in</Link>
      </p>
    </main>
  );
}
