import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/app/(auth)/AuthForm";
import { signupAction } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Start free — 14 days" };

export default function SignupPage() {
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "56px 20px 80px" }}>
      <Link href="/" className="t-label" style={{ textDecoration: "none" }}>
        UnitKeeper
      </Link>
      <h1 className="t-display" style={{ marginTop: 12 }}>
        Draw your yard in ten minutes
      </h1>
      <p className="t-secondary" style={{ marginTop: 8, marginBottom: 32 }}>
        Rows and unit sizes, then your first move-in. No card for 14 days.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}
