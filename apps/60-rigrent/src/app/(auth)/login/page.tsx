import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "56px 20px" }}>
      <p className="t-placard tone-dim">RigRent</p>
      <h1 className="t-h2" style={{ marginTop: 8 }}>
        Sign in to the yard
      </h1>
      <p className="t-secondary" style={{ marginTop: 8, marginBottom: 32 }}>
        One quantity-tracked calendar the quotes read from.
      </p>
      <AuthForm mode="login" action={loginAction} />
      <p className="t-secondary" style={{ marginTop: 24 }}>
        No account yet? <Link href="/signup" className="btn-quiet">Start free — 14 days</Link>
      </p>
    </main>
  );
}
