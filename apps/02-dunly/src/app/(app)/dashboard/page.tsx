import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { activityFeed, overviewStats } from "@/lib/analytics";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { money } from "@/lib/format";
import { Odometer } from "@/components/Odometer";
import { PeriodChips } from "@/components/PeriodChips";
import { BrandMark, IconArrowDownLeft, IconDownload } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; connect?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const period = [7, 30, 90].includes(Number(sp.period)) ? Number(sp.period) : 30;

  const account = await db.query.stripeAccounts.findFirst({
    where: eq(schema.stripeAccounts.organizationId, session.organizationId),
  });

  const [stats, feed] = await Promise.all([
    overviewStats(session.organizationId, period),
    activityFeed(session.organizationId, 30),
  ]);

  return (
    <main className="px-5 pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BrandMark size={24} />
          <span className="font-semibold">Dunly</span>
        </div>
        <PeriodChips current={period} />
      </div>

      {!account && (
        <section className="panel mt-6 p-5">
          <p className="t-label">First run</p>
          <h2 className="t-h2 mt-2">See what you&apos;re leaking</h2>
          <p className="t-secondary mt-2 max-w-[44ch]">
            Connect Stripe read-write and we scan your last 90 days of failed
            invoices — you&apos;ll see the dollars Dunly would likely have
            recovered before you pay anything.
          </p>
          <a href="/api/stripe/connect" className="btn btn-primary btn-block mt-5 sm:w-auto">
            Connect Stripe
          </a>
        </section>
      )}

      {/* hero stat */}
      <section className="mt-8">
        <p className="t-label">Recovered this period</p>
        <p className="t-herostat mt-2">
          <Odometer value={money(stats.recoveredCents)} />
        </p>
        <div className="rowlist mt-6">
          <div className="flex items-baseline justify-between py-3">
            <span className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <span className="risk-dot" /> At risk
            </span>
            <span className="mono text-[15px]">{money(stats.atRiskCents)}</span>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <span className="text-sm text-[var(--color-muted)]">In recovery</span>
            <span className="mono text-[15px]">{stats.inRecoveryCount} invoices</span>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <span className="text-sm text-[var(--color-muted)]">Baseline (not counted)</span>
            <span className="mono text-[15px] text-[var(--color-faint)]">{money(stats.baselineCents)}</span>
          </div>
          {stats.preventedCents > 0 && (
            <div className="flex items-baseline justify-between py-3">
              <span className="text-sm text-[var(--color-muted)]">Prevented (pre-dunning)</span>
              <span className="mono text-[15px]">{money(stats.preventedCents)}</span>
            </div>
          )}
        </div>
      </section>

      {/* activity feed */}
      <section className="mt-8">
        <p className="t-label">Activity</p>
        {feed.length === 0 ? (
          <p className="t-secondary mt-4">
            Quiet so far. Failures and recoveries appear here the moment they
            happen.
          </p>
        ) : (
          <div className="rowlist mt-2">
            {feed.map((item, i) => (
              <div
                key={item.id}
                className="feed-enter flex items-center gap-3 py-3.5"
                style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
              >
                {item.kind === "recovered" ? (
                  <IconArrowDownLeft size={18} style={{ color: "var(--color-banknote)" }} />
                ) : (
                  <span className="risk-dot" />
                )}
                <span className="t-title min-w-0 flex-1 truncate text-[15px]">{item.customerName}</span>
                <span className="mono">{money(item.amountCents, item.currency)}</span>
                <span className="t-secondary hidden sm:block" style={{ color: "var(--color-faint)" }}>
                  {item.detail}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-20 mt-8 pb-4 lg:bottom-4">
        <Link href="/roi" className="btn btn-primary btn-block sm:w-auto">
          <IconDownload size={18} />
          Export ROI statement
        </Link>
      </div>
    </main>
  );
}
