import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="screen-plain pt-12" style={{ maxWidth: 440 }}>
      <Link href="/" className="t-label">
        DuesDesk
      </Link>
      <h1 className="t-h2 mt-6">Sign in to the board dashboard.</h1>
      <p className="t-secondary mt-2 mb-8">
        Households never need an account — they use the payment link in their invoice email.
      </p>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
