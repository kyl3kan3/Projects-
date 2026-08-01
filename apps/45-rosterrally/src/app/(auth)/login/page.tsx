import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "../AuthForm";
import { loginAction } from "../actions";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/season");
  return (
    <main className="screen-narrow world-night min-h-dvh">
      <div className="pt-12 pb-8">
        <Link href="/" className="t-label" style={{ color: "var(--fg-3)" }}>
          RosterRally
        </Link>
        <h1 className="t-h2 mt-3">Sign in to your club</h1>
        <p className="t-secondary mt-2">
          Registrars, treasurers and coaches. Parents never need an account — they use the link in
          their messages.
        </p>
      </div>
      <LoginForm action={loginAction} />
    </main>
  );
}
