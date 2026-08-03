import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";
import { IconAlertTriangle } from "@/components/icons";
import { todayIso, daysBetween } from "@/lib/dates";

/**
 * The signed-in shell: bottom tab bar on phones, a persistent left rail from
 * 1024px. Middleware has already turned away anonymous requests; this is what
 * resolves the company.
 *
 * The two banners are the only things that interrupt: a trial about to end, and
 * a cancelled account whose records are still readable. Both are one line of
 * text, never a modal.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { company } = await requireUser();
  const today = todayIso(company.timezone);
  const trialDaysLeft =
    company.subscriptionStatus === "trialing" && company.trialEndsAt
      ? daysBetween(today, company.trialEndsAt.toISOString().slice(0, 10))
      : null;

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1120px] lg:gap-8 lg:px-8">
      <SideRail companyName={company.name} />
      <div className="min-w-0 flex-1">
        {company.readOnly ? (
          <div className="offline-banner">
            <IconAlertTriangle size={18} style={{ color: "var(--color-orange)", flex: "none" }} />
            <span>
              This account is cancelled and read-only. Every record stays here and stays
              exportable — the retention duty is five years.{" "}
              <Link href="/settings/billing" style={{ color: "var(--color-hardhat)" }}>
                Reactivate
              </Link>
            </span>
          </div>
        ) : null}
        {company.subscriptionStatus === "past_due" ? (
          <div className="offline-banner">
            <IconAlertTriangle size={18} style={{ color: "var(--color-orange)", flex: "none" }} />
            <span>
              Your last payment failed. Capture keeps working — nobody loses a signature over
              a card.{" "}
              <Link href="/settings/billing" style={{ color: "var(--color-hardhat)" }}>
                Update payment
              </Link>
            </span>
          </div>
        ) : null}
        {trialDaysLeft !== null && trialDaysLeft <= 14 ? (
          <div className="offline-banner">
            <span className="t-data" style={{ color: "var(--color-hardhat)" }}>
              {trialDaysLeft > 0 ? `${trialDaysLeft} DAYS` : "TODAY"}
            </span>
            <span>
              left in your trial.{" "}
              <Link href="/settings/billing" style={{ color: "var(--color-hardhat)" }}>
                Pick a plan
              </Link>
            </span>
          </div>
        ) : null}
        {children}
      </div>
      <TabBar />
    </div>
  );
}
