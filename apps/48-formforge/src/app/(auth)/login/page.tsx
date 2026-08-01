import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";
import { IconShieldMark } from "@/components/TabBar";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="screen pt-10" style={{ paddingBottom: 40, maxWidth: 440 }}>
      <Link href="/" className="mb-10 inline-flex items-center gap-2 no-underline" style={{ color: "var(--color-ink)" }}>
        <span style={{ color: "var(--color-teal)" }}>
          <IconShieldMark size={22} />
        </span>
        <span className="t-title">FormForge</span>
      </Link>

      <h1 className="t-h2">Sign in</h1>
      <p className="t-secondary mb-8 mt-2">
        Sessions end after 12 hours, so a front-desk browser does not stay open overnight.
      </p>

      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
