import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { AtRiskList } from "@/components/at-risk-list";
import { BottomNav, DesktopRail } from "@/components/bottom-nav";
import { Icon } from "@/components/icons";
import { ReturnTicker } from "@/components/return-ticker";
import { TopBar } from "@/components/top-bar";
import { formatMoney, percent } from "@/lib/format";
import { activityEvents, atRiskFailures, dashboardStats } from "@/lib/sample-data";

export default function DashboardPage() {
  return (
    <main className="screen">
      <div className="shell with-rail">
        <DesktopRail active="/dashboard" />
        <div>
          <TopBar
            action={
              <div className="flex gap-2 overflow-x-auto">
                <span className="chip">7d</span>
                <span className="chip chip-active">30d</span>
                <span className="chip">90d</span>
              </div>
            }
          />

          <div className="app-grid">
            <section>
              <p className="t-label">Recovered this period</p>
              <div className="mt-3">
                <ReturnTicker cents={dashboardStats.recoveredByDunlyCents} />
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-3 desktop-three">
                <div className="panel p-4 md:col-span-1">
                  <p className="t-label">Recovery rate</p>
                  <p className="money mt-3 text-2xl">{percent(dashboardStats.recoveryRate)}</p>
                </div>
                <div className="panel p-4">
                  <p className="t-label">At risk</p>
                  <p className="money mt-3 text-2xl text-[var(--color-amber)]">{formatMoney(dashboardStats.atRiskMrrCents)}</p>
                </div>
                <div className="panel p-4">
                  <p className="t-label">In recovery</p>
                  <p className="money mt-3 text-2xl">{dashboardStats.activeFailures} invoices</p>
                </div>
              </div>

              <div className="mt-8">
                <ActivityFeed events={activityEvents} />
              </div>
            </section>

            <aside className="space-y-6">
              <section className="panel p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="t-label">90-day preview</p>
                    <p className="mt-2 text-sm text-[var(--color-text-2)]">
                      We would have recovered about{" "}
                      <span className="money text-[var(--color-banknote)]">{formatMoney(dashboardStats.recoveryPreviewCents)}</span>{" "}
                      last quarter.
                    </p>
                  </div>
                  <Icon name="chevron-right" className="h-5 w-5 text-[var(--color-text-3)]" />
                </div>
                <Link href="/connect" className="btn btn-primary mt-4 w-full">
                  Connect Stripe
                </Link>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="t-label">At-risk queue</p>
                  <Link href="/at-risk" className="btn-quiet text-sm">
                    View all
                  </Link>
                </div>
                <AtRiskList failures={atRiskFailures.slice(0, 2)} compact />
              </section>
            </aside>
          </div>
        </div>
      </div>
      <a href="/api/statement/export" className="btn btn-primary fixed inset-x-5 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+16px)] z-20 mx-auto max-w-md lg:hidden">
        <Icon name="download" className="h-[18px] w-[18px]" />
        Export ROI statement
      </a>
      <BottomNav active="/dashboard" />
    </main>
  );
}
