import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { IconStamp } from "@/components/icons";
import { coverageSummary } from "@/lib/jurisdictions";

export const metadata: Metadata = { title: "Start a trial" };

export default async function SignupPage() {
  const coverage = await coverageSummary().catch(() => null);

  return (
    <main className="screen pt-10" style={{ paddingBottom: 40 }}>
      <Link href="/" className="flex items-center gap-2" style={{ color: "var(--color-fg)" }}>
        <IconStamp size={22} className="stamp-glyph" />
        <span className="t-title">PermitPath</span>
      </Link>

      <h1 className="t-h2 mt-8">Start the 14-day trial</h1>
      <p className="t-secondary mt-2">
        Scoped to your own jurisdictions, so the value is obvious or absent inside a week. No card
        required to start.
      </p>
      {coverage && (
        <p className="t-data mt-3" style={{ color: "var(--color-fg-3)" }}>
          {coverage.curated} jurisdictions curated · {coverage.freshRecords} of {coverage.records}{" "}
          records verified in the last 90 days
        </p>
      )}

      <div className="mt-6">
        <AuthForm mode="signup" />
      </div>
    </main>
  );
}
