import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";
import { currentContext } from "@/lib/auth";
import { RadarArc } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentContext()) redirect("/radar");

  return (
    <main className="screen pt-10" style={{ maxWidth: 480 }}>
      <Link
        href="/"
        className="flex items-center gap-2"
        style={{ color: "var(--color-ink)", textDecoration: "none" }}
      >
        <RadarArc size={22} />
        <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
          RFPRadar
        </span>
      </Link>

      <h1 className="t-h2 mt-8">Sign in</h1>
      <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
        The register is read and the finds are flagged. Pick up where the scan left off.
      </p>

      <div className="mt-8">
        <AuthForm action={loginAction} mode="login" />
      </div>

      <p className="t-secondary mt-6">
        No account yet?{" "}
        <Link href="/signup" className="btn-quiet">
          Start free — 14 days
        </Link>
      </p>
    </main>
  );
}
