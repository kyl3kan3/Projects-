import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { githubConfigured } from "@/lib/github";
import { IconVault } from "@/components/icons";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 no-underline">
        <span style={{ color: "var(--color-brass)" }}>
          <IconVault size={22} />
        </span>
        <span className="t-title">VaultBack</span>
      </Link>

      <h1 className="t-h2">Fourteen days, no card.</h1>
      <p className="t-secondary mt-2 mb-6">
        Connect a Postgres database and you will have an encrypted, verified snapshot in your own
        storage within minutes. Cancel by closing the tab.
      </p>

      <AuthForm mode="signup" action={signupAction} githubEnabled={githubConfigured()} />

      <p className="t-secondary mt-8" style={{ color: "var(--color-text-3)" }}>
        Connection strings are encrypted at rest with a key that is separate from the one protecting
        your snapshots. We never store your database password in plaintext, and never log it.
      </p>
    </main>
  );
}
