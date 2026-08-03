import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";
import { entitlement, trialDaysLeft } from "@/lib/billing";

/**
 * The signed-in shell: bottom tab bar on phones, a persistent left rail from
 * 1024px. The guard lives here because every screen in the group needs an org.
 *
 * The trial and past-due notices are the only chrome above the content, and they
 * are hairline notices rather than modals — a contractor mid-job does not need a
 * dialog between them and a fee schedule.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org } = await requireUser();
  const state = entitlement(org);
  const daysLeft = trialDaysLeft(org);

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1216px] lg:gap-8 lg:px-8">
      <SideRail orgName={org.name} isCurator={user.isCurator} />
      <div className="min-w-0 flex-1">
        {state === "trialing" && daysLeft !== null && (
          <div className="hairline-b" style={{ background: "var(--color-surface)" }}>
            <div className="screen flex items-center justify-between gap-3 py-3" style={{ paddingBottom: 12 }}>
              <span className="t-secondary">
                Trial — {daysLeft} {daysLeft === 1 ? "day" : "days"} left on {org.name}
              </span>
              <Link href="/settings/billing" className="btn-quiet btn-quiet-sm">
                Choose a plan
              </Link>
            </div>
          </div>
        )}
        {state === "past_due" && (
          <div className="hairline-b" style={{ background: "var(--color-surface)" }}>
            <div className="screen flex items-center justify-between gap-3 py-3" style={{ paddingBottom: 12 }}>
              <span className="t-secondary" style={{ color: "var(--color-signal-red)" }}>
                Payment failed — alerts keep running while Stripe retries
              </span>
              <Link href="/settings/billing" className="btn-quiet btn-quiet-sm">
                Update card
              </Link>
            </div>
          </div>
        )}
        {state === "inactive" && (
          <div className="hairline-b" style={{ background: "var(--color-surface)" }}>
            <div className="screen flex items-center justify-between gap-3 py-3" style={{ paddingBottom: 12 }}>
              <span className="t-secondary" style={{ color: "var(--color-ochre)" }}>
                Trial ended — your data is here, alerts are paused
              </span>
              <Link href="/settings/billing" className="btn-quiet btn-quiet-sm">
                Choose a plan
              </Link>
            </div>
          </div>
        )}
        {children}
      </div>
      <TabBar />
    </div>
  );
}
