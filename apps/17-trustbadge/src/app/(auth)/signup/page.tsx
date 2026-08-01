import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Start collecting reviews" };

export default function SignupPage() {
  const free = PLANS.free;
  return (
    <main className="screen-plain mx-auto max-w-[440px] pb-16">
      <header className="pt-12 pb-8">
        <Link href="/" className="t-label no-underline">
          TrustBadge
        </Link>
        <h1 className="t-h2 mt-4">Reviews on your store, this afternoon.</h1>
        <p className="t-secondary mt-2">
          No card. The badge widget, {free.ordersPerMonth} orders a month, and the same
          sub-15KB embed everyone else gets — permanently.
        </p>
      </header>

      <AuthForm mode="signup" action={signupAction} />

      <p className="t-secondary mt-8">
        On Shopify? You can install from the app listing instead and skip this form — the
        install links your shop and creates the account in one step.
      </p>
    </main>
  );
}
