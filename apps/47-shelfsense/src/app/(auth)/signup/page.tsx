import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <main className="screen" style={{ paddingBottom: 40 }}>
      <header className="pt-10 pb-8">
        <Link href="/" className="t-label" style={{ color: "var(--color-kraft)" }}>
          ShelfSense
        </Link>
        <h1 className="t-h2 mt-4">Start the 14-day trial</h1>
        <p className="t-secondary mt-2">
          Connect Shopify next. The trial opens on your last 90 days, so the first screen is
          your own revenue at risk — not a tour.
        </p>
      </header>
      <AuthForm mode="signup" />
    </main>
  );
}
