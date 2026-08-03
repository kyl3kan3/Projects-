import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/app/(auth)/AuthForm";
import { loginAction } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "56px 20px 80px" }}>
      <Link href="/" className="t-label" style={{ textDecoration: "none" }}>
        UnitKeeper
      </Link>
      <h1 className="t-display" style={{ marginTop: 12 }}>
        Open the yard
      </h1>
      <p className="t-secondary" style={{ marginTop: 8, marginBottom: 32 }}>
        The map, the ledgers and the lien clock.
      </p>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
