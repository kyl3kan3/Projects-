import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";
import { githubConfigured } from "@/lib/github";
import { IconVault } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 no-underline">
        <span style={{ color: "var(--color-brass)" }}>
          <IconVault size={22} />
        </span>
        <span className="t-title">VaultBack</span>
      </Link>

      <h1 className="t-h2">Welcome back.</h1>
      <p className="t-secondary mt-2 mb-6">
        Your schedules kept running while you were away. Sign in to see the last checksum.
      </p>

      {error ? (
        <p
          className="panel t-secondary mb-5 p-4"
          style={{ color: "var(--color-torch)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <AuthForm mode="login" action={loginAction} githubEnabled={githubConfigured()} />
    </main>
  );
}
