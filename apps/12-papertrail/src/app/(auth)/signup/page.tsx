import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Start free" };

export default async function SignupPage() {
  if (await getSession()) redirect("/chain");

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center pb-0">
      <Link href="/" className="t-label mb-8 no-underline">
        PaperTrail
      </Link>
      <h1 className="t-h2 mb-1">One thread from maybe to paid.</h1>
      <p className="t-secondary mb-8">
        Write the proposal. When it's accepted, the contract is already drafted; when it's
        signed, the deposit invoice is already sent. No card needed.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
