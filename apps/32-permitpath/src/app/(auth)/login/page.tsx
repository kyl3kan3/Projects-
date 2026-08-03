import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { IconStamp } from "@/components/icons";
import { coverageSummary } from "@/lib/jurisdictions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const coverage = await coverageSummary().catch(() => null);

  return (
    <main className="screen pt-10" style={{ paddingBottom: 40 }}>
      <Link href="/" className="flex items-center gap-2" style={{ color: "var(--color-fg)" }}>
        <IconStamp size={22} className="stamp-glyph" />
        <span className="t-title">PermitPath</span>
      </Link>

      <h1 className="t-h2 mt-8">Sign in</h1>
      <p className="t-secondary mt-2">
        {coverage
          ? `${coverage.records} verified requirement records across ${coverage.jurisdictions} Phoenix-metro authorities.`
          : "Permit intelligence for contractors working across multiple jurisdictions."}
      </p>

      <div className="mt-6">
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
