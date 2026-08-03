import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "../AuthForm";
import { currentContext } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = { title: "Start free — 14 days" };

export default async function SignupPage() {
  const ctx = await currentContext();
  if (ctx) redirect(ctx.user.role === "driver" ? "/cab" : "/loads");

  return (
    <main className="screen" style={{ maxWidth: 420 }}>
      <Link href="/" className="t-placard" style={{ textDecoration: "none" }}>
        DispatchDeck
      </Link>
      <h1 className="t-h2 mt-6 mb-2">Start free — 14 days</h1>
      <p className="t-secondary mb-8">
        No card. {TRIAL_DAYS} days of the whole product — every truck, every seat, every export. Run
        one real load through it and you will know.
      </p>
      <SignupForm />
    </main>
  );
}
