import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySignup } from "@/lib/signups";
import { Wordmark } from "@/components/icons";

/**
 * The double-opt-in landing. Spends the token and sends the person straight to
 * their position page, which is the payoff for clicking.
 *
 * A second click is a success, not an error: mail clients prefetch links and
 * people double-tap. Only the first click activates.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirming your spot",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const outcome = await verifySignup(token);

  if (outcome.kind === "verified" || outcome.kind === "already") {
    const signup = outcome.kind === "verified" ? outcome.result.signup : outcome.signup;
    redirect(`/l/${outcome.list.slug}/joined/${signup.referralCode}`);
  }

  return (
    <main
      className="page-column"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center" }}
    >
      <Wordmark />
      <h1 className="t-h2" style={{ marginTop: 24 }}>
        That link has expired.
      </h1>
      <p className="t-body" style={{ marginTop: 12, color: "var(--color-text-2)" }}>
        Confirmation links are single-purpose and this one no longer matches a signup — most likely
        the address was already confirmed from a different link, or the list has been archived.
      </p>
      <p className="t-secondary" style={{ marginTop: 16 }}>
        Submitting your email on the launch page again will send you a fresh link.
      </p>
      <p className="t-secondary" style={{ marginTop: 24 }}>
        <Link href="/">What is LaunchList?</Link>
      </p>
    </main>
  );
}
