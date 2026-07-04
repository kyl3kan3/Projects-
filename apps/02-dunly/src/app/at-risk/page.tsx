import { AtRiskList } from "@/components/at-risk-list";
import { BottomNav, DesktopRail } from "@/components/bottom-nav";
import { TopBar } from "@/components/top-bar";
import { atRiskFailures } from "@/lib/sample-data";

export default function AtRiskPage() {
  return (
    <main className="screen">
      <div className="shell with-rail">
        <DesktopRail active="/at-risk" />
        <div>
          <TopBar />
          <section className="mb-6">
            <p className="t-label">At-risk</p>
            <h1 className="t-h2 mt-2">Invoices in dunning</h1>
            <p className="t-secondary mt-2 max-w-[56ch]">
              Every row shows countdown, retry history, and a visible pause path. Stripe Smart Retries are suppressed
              before Dunly schedules its own charge attempt.
            </p>
          </section>
          <AtRiskList failures={atRiskFailures} />
        </div>
      </div>
      <BottomNav active="/at-risk" />
    </main>
  );
}
