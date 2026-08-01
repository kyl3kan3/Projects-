import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/pipeline");

  return (
    <main className="mx-auto w-full max-w-[420px] px-5 pb-20 pt-14">
      <Link href="/" className="t-label no-underline">
        GrantGrid
      </Link>
      <h1 className="t-display mt-6">Welcome back.</h1>
      <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
        Reminders keep running whether or not anyone signs in — that is rather the
        point.
      </p>
      <AuthForm mode="login" />
    </main>
  );
}
