import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";
import { currentContext } from "@/lib/auth";
import { BrandMark } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentContext()) redirect("/apis");

  return (
    <main className="gutter" style={{ minHeight: "100dvh", display: "grid", alignContent: "center", paddingBlock: 40 }}>
      <div style={{ width: "100%", maxWidth: 420, marginInline: "auto" }}>
        <Link
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--color-text)", marginBottom: 32 }}
        >
          <BrandMark size={22} />
          <span className="t-title">SchemaSentry</span>
        </Link>

        <h1 className="t-h2" style={{ margin: "0 0 8px" }}>
          Sign in
        </h1>
        <p className="t-secondary" style={{ margin: "0 0 32px" }}>
          Your deploy history, diffs and consumer registry.
        </p>

        <AuthForm mode="login" action={loginAction} />
      </div>
    </main>
  );
}
