import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";
import { getSession } from "@/lib/auth";
import { Wordmark } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <main
      className="page-column"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 420 }}
    >
      <Link href="/" style={{ marginBottom: 32 }}>
        <Wordmark />
      </Link>
      <h1 className="t-h2" style={{ marginBottom: 4 }}>
        Welcome back.
      </h1>
      <p className="t-secondary" style={{ marginBottom: 32 }}>
        Your queue kept moving while you were gone.
      </p>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
