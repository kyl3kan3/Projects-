import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/menu");
  return (
    <main className="screen" style={{ maxWidth: 460, margin: "0 auto", paddingBottom: 56 }}>
      <header style={{ paddingTop: 40, paddingBottom: 24 }}>
        <Link href="/" className="t-label" style={{ textDecoration: "none" }}>
          MenuLift
        </Link>
        <h1 className="t-h2" style={{ marginTop: 16, marginBottom: 8 }}>
          Sign in
        </h1>
        <p className="t-secondary" style={{ margin: 0 }}>
          Staff at the pass don&apos;t need this — the 86 board takes a PIN.
        </p>
      </header>
      <AuthForm mode="login" />
    </main>
  );
}
