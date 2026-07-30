import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Start watching" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  const free = PLANS.free;

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center pb-0">
      <Link href="/" className="t-label mb-8 no-underline">
        PulseWatch
      </Link>
      <h1 className="t-h2 mb-1">Know before your users do.</h1>
      <p className="t-secondary mb-8">
        {free.monitors} monitors, {free.minIntervalSeconds / 60}-minute checks, a real status page.
        No card, no ads.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
