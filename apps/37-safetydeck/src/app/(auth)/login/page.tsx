import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/talks");

  return (
    <main className="mx-auto w-full max-w-[420px] px-5 pb-20 pt-14">
      <Link href="/" className="t-label" style={{ color: "var(--color-hardhat)" }}>
        SafetyDeck
      </Link>
      <h1 className="t-h2 mt-6">Sign in</h1>
      <p className="t-secondary mt-3">
        Foremen do not need an account — their Monday link opens without one. This is the
        office side.
      </p>
      <AuthForm mode="login" />
    </main>
  );
}
