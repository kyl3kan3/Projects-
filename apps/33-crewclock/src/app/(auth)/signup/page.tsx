import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Start the trial" };

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect(session.role === "crew" ? "/clock" : "/jobs");

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center pb-0">
      <Link href="/" className="t-label mb-8 no-underline">
        CrewClock
      </Link>
      <h1 className="t-h2 mb-1">Stop guessing at Friday.</h1>
      <p className="t-secondary mb-8">
        Set up your company, add a job site, and your crew can punch in this afternoon. Thirty days,
        no card.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
