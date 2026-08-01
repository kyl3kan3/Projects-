import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Open your season" };

export default async function SignupPage() {
  if (await getSession()) redirect("/season");
  return (
    <main className="screen-narrow world-night min-h-dvh">
      <div className="pt-12 pb-8">
        <Link href="/" className="t-label" style={{ color: "var(--fg-3)" }}>
          RosterRally
        </Link>
        <h1 className="t-h2 mt-3">Open your season</h1>
        <p className="t-secondary mt-2">
          Two minutes to a registration link you can post. No card, and nothing to install for the
          parents on the other end.
        </p>
      </div>
      <SignupForm action={signupAction} />
    </main>
  );
}
