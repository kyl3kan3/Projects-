import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";
import { currentContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentContext()) redirect("/projects");
  return (
    <main className="gutter" style={{ paddingBlock: "var(--s9)", maxWidth: 460, margin: "0 auto" }}>
      <Link href="/" className="t-label" style={{ letterSpacing: "0.16em" }}>
        BIDBOARD
      </Link>
      <h1 className="t-h2" style={{ marginTop: "var(--s6)", marginBottom: "var(--s6)" }}>
        Sign in
      </h1>
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
