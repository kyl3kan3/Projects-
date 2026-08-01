import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Start free" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center pb-0">
      <Link href="/" className="t-label mb-8 no-underline">
        TradeLog
      </Link>
      <h1 className="t-h2 mb-1">See your leaks free.</h1>
      <p className="t-secondary mb-8">
        One account, 30 trades a month, and your biggest leak named with a dollar figure. No card.
      </p>
      <AuthForm mode="signup" action={signupAction} cta="See your leaks free" />
    </main>
  );
}
