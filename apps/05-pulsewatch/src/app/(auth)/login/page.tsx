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
    <main className="screen mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center pb-0">
      <Link href="/" className="t-label mb-8 no-underline">
        PulseWatch
      </Link>
      <h1 className="t-h2 mb-1">Welcome back.</h1>
      <p className="t-secondary mb-8">Everything kept watching while you were gone.</p>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
