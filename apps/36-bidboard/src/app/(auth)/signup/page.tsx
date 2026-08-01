import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { currentContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage() {
  if (await currentContext()) redirect("/projects");
  return (
    <main className="gutter" style={{ paddingBlock: "var(--s9)", maxWidth: 460, margin: "0 auto" }}>
      <Link href="/" className="t-label" style={{ letterSpacing: "0.16em" }}>
        BIDBOARD
      </Link>
      <h1 className="t-h2" style={{ marginTop: "var(--s6)" }}>
        Put your next package out to bid
      </h1>
      <p className="t-secondary" style={{ marginTop: "var(--s2)", marginBottom: "var(--s6)" }}>
        14 days, no card. Your subs never create an account — they get a link that works in a truck.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
