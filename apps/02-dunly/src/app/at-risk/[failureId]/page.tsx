import Link from "next/link";
import { BottomNav, DesktopRail } from "@/components/bottom-nav";
import { Icon } from "@/components/icons";
import { RetryTimeline } from "@/components/retry-timeline";
import { TopBar } from "@/components/top-bar";
import { getFailureDrilldown } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";

export default async function FailureDetailPage({ params }: { params: Promise<{ failureId: string }> }) {
  const { failureId } = await params;
  const { failure, events } = getFailureDrilldown(failureId);

  return (
    <main className="screen">
      <div className="shell with-rail">
        <DesktopRail active="/at-risk" />
        <div>
          <TopBar />
          <Link className="btn-quiet mb-4 inline-flex min-h-11 items-center gap-2 text-sm" href="/at-risk">
            <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
            Back to queue
          </Link>

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="t-label">Failure drill-down</p>
                <h1 className="t-h2 mt-2">{failure.customer}</h1>
                <p className="t-secondary mt-2">{failure.email}</p>
              </div>
              <p className="money text-xl text-[var(--color-amber)]">{formatMoney(failure.amountCents)}</p>
            </div>
            <div className="mt-5">
              <RetryTimeline nodes={failure.timeline} />
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="panel p-4">
              <p className="t-label">Decline code</p>
              <p className="data mt-3 text-sm">{failure.declineCode}</p>
            </div>
            <div className="panel p-4">
              <p className="t-label">Next action</p>
              <p className="mt-3 text-sm font-semibold">{failure.retryCountdown}</p>
            </div>
            <div className="panel p-4">
              <p className="t-label">Attribution window</p>
              <p className="mt-3 text-sm font-semibold">24h after last click or retry</p>
            </div>
          </section>

          <section className="mt-6">
            <p className="t-label">Related recovery events</p>
            <div className="mt-2">
              {events.map((event) => (
                <div className="row grid grid-cols-[1fr_auto] gap-4" key={event.id}>
                  <div>
                    <p className="font-semibold">{event.customer}</p>
                    <p className="t-secondary">{event.detail}</p>
                  </div>
                  <p className="money text-sm text-[var(--color-banknote)]">{formatMoney(event.amountCents)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <BottomNav active="/at-risk" />
    </main>
  );
}
