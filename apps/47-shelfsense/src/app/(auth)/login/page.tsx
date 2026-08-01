import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="screen" style={{ paddingBottom: 40 }}>
      <header className="pt-10 pb-8">
        <Link href="/" className="t-label" style={{ color: "var(--color-kraft)" }}>
          ShelfSense
        </Link>
        <h1 className="t-h2 mt-4">Sign in</h1>
        <p className="t-secondary mt-2">
          The reorder list, the dead-stock report, and last night&rsquo;s numbers.
        </p>
      </header>
      <AuthForm mode="login" />
    </main>
  );
}
