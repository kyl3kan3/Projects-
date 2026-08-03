import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./OnboardingForm";
import { TRIAL_DAYS, TRIAL_QUOTE_LIMIT } from "@/lib/plans";

export const metadata: Metadata = { title: "Set up your shop" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { org } = await requireUser();
  if (org.onboardedAt) redirect("/jobs");

  return (
    <main className="gutter" style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 56 }}>
      <header style={{ paddingTop: 24, paddingBottom: 8 }}>
        <p className="t-label" style={{ color: "var(--color-hi-vis)" }}>
          One evening, once
        </p>
        <h1 className="t-h2" style={{ marginTop: 8 }}>
          Set up your shop
        </h1>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Five fields and a price book, and the next job you walk gets quoted from the driveway. Your
          trial runs {TRIAL_DAYS} days and includes {TRIAL_QUOTE_LIMIT} AI-drafted quotes — no card.
        </p>
      </header>
      <div style={{ marginTop: 24 }}>
        <OnboardingForm companyName={org.name} trade={org.trade} />
      </div>
    </main>
  );
}
