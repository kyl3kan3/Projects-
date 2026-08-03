import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <main className="screen-plain">
      <header className="pt-10 pb-8">
        <Link href="/" className="t-label" style={{ color: "var(--color-ledger)" }}>
          LedgerLens
        </Link>
        <h1 className="t-h2 mt-4">Start closing your books</h1>
        <p className="t-secondary mt-2">
          14 days, no card. You get a forwarding address and a camera; your accountant
          gets a close package.
        </p>
      </header>
      <AuthForm mode="signup" />
      <p className="t-secondary mt-8" style={{ color: "var(--color-fg-3)" }}>
        LedgerLens prepares your books to Schedule&nbsp;C categories. A professional
        still files the return — nothing here is tax advice.
      </p>
    </main>
  );
}
