import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="screen-plain mx-auto max-w-[440px] pb-16">
      <header className="pt-12 pb-8">
        <Link href="/" className="t-label no-underline">
          TrustBadge
        </Link>
        <h1 className="t-h2 mt-4">Welcome back.</h1>
        <p className="t-secondary mt-2">
          Your widgets kept serving while you were away — they read from the edge, not from
          this dashboard.
        </p>
      </header>

      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
