import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ClientDock workspace.",
};

export default function LoginPage() {
  return (
    <main className="screen" style={{ maxWidth: 440 }}>
      <header className="pt-10 pb-8">
        <Link href="/" className="t-label" style={{ color: "var(--wl-accent)" }}>
          ClientDock
        </Link>
        <h1 className="t-display mt-4">Welcome back.</h1>
        <p className="t-secondary mt-3">
          Clients don&apos;t sign in here — they use the link you sent them.
        </p>
      </header>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
