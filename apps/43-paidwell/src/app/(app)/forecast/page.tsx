import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChartForecast } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { loadForecast } from "@/lib/dashboard";
import { formatStamp } from "@/lib/dates";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { plan, planRequiredFor, PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const BASIS_LABEL = {
  promise: "they gave a date",
  behaviour: "their usual pace",
  terms: "the invoice terms",
} as const;

export default async function ForecastPage() {
  const { firm } = await requireFirm();
  const features = plan(firm.plan);

  if (!features.forecast) {
    const needed = PLANS[planRequiredFor("forecast")];
    return (
      <main>
        <ScreenHeader firmName={firm.name} meta="cash-in forecast" />
        <section className="gutter">
          <h1 className="t-h2">The Monday-morning money screen</h1>
          <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
            Expected receipts by week, built from due dates, open promises and each client&rsquo;s
            own history of when they actually pay. It is on the {needed.name} plan and up.
          </p>
          <Link href="/settings/billing" className="btn btn-primary" style={{ marginTop: 24 }}>
            See plans
          </Link>
        </section>
      </main>
    );
  }

  const forecast = await loadForecast(firm, 8);
  const peak = Math.max(1, ...forecast.weeks.map((w) => w.expectedCents));

  return (
    <main>
      <ScreenHeader firmName={firm.name} meta="expected receipts · 8 weeks" />

      <section className="gutter">
        <p className="t-label">Expected in the next 8 weeks</p>
        <p className="t-stat">{formatMoneyShort(forecast.totalCents)}</p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {formatMoneyShort(forecast.weightedCents)} weighted by confidence — the number to
          actually plan around. Based on {forecast.invoiceCount} open{" "}
          {forecast.invoiceCount === 1 ? "invoice" : "invoices"} and {forecast.promiseCount}{" "}
          {forecast.promiseCount === 1 ? "promise" : "promises"}.
        </p>
        {forecast.beyondHorizonCents > 0 ? (
          <p className="t-secondary" style={{ marginTop: 4, color: "var(--color-text-aa)" }}>
            A further {formatMoneyShort(forecast.beyondHorizonCents)} is expected beyond the
            horizon — it is deliberately not piled onto the last column.
          </p>
        ) : null}
      </section>

      <section className="gutter" style={{ marginTop: 32 }}>
        <div
          className="scroll-x"
          style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingBottom: 8 }}
        >
          {forecast.weeks.map((week) => {
            const height = Math.round((week.expectedCents / peak) * 140);
            return (
              <div key={week.weekStart} style={{ minWidth: 64, flex: 1 }}>
                <div
                  style={{
                    height: 148,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    style={{
                      height: Math.max(week.expectedCents > 0 ? 2 : 0, height),
                      borderTop: "1px solid var(--color-hairline)",
                      // Confidence shows as solidity: 100% ink down to faint.
                      background: `color-mix(in srgb, var(--color-ink) ${Math.max(
                        20,
                        week.confidence,
                      )}%, var(--color-ledger))`,
                    }}
                    title={`${formatMoney(week.expectedCents)} · ${week.confidence}% confidence`}
                  />
                </div>
                <p className="t-data" style={{ marginTop: 8, fontSize: 12 }}>
                  {formatMoneyShort(week.expectedCents)}
                </p>
                <p className="t-data" style={{ color: "var(--color-text-aa)", fontSize: 11 }}>
                  {formatStamp(week.weekStart)}
                </p>
              </div>
            );
          })}
        </div>
        <p className="t-secondary" style={{ marginTop: 12 }}>
          Bar solidity is confidence: a promise from a client who keeps them reads as near-cash;
          the same words from a 40% client read as hope.
        </p>
      </section>

      {forecast.invoiceCount === 0 ? (
        <section className="gutter" style={{ marginTop: 32 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <IconChartForecast size={20} style={{ color: "var(--color-text-aa)", marginTop: 2 }} />
            <div>
              <p className="t-title">Nothing to forecast yet</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                Connect your accounting or import a file and the weekly columns fill from your
                own due dates.
              </p>
              <Link href="/connect" className="btn-quiet" style={{ paddingLeft: 0, marginTop: 8 }}>
                Connect a source
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="gutter" style={{ marginTop: 32, marginBottom: 40 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>
            What each week is made of
          </p>
          {forecast.weeks
            .filter((week) => week.receipts.length > 0)
            .map((week) => (
              <div key={week.weekStart} style={{ marginTop: 16 }}>
                <p className="t-data" style={{ color: "var(--color-text-2)" }}>
                  Week of {formatStamp(week.weekStart)} · {formatMoney(week.expectedCents)} ·{" "}
                  {week.confidence}% confidence
                </p>
                {week.receipts.map((receipt) => (
                  <Link key={receipt.invoiceId} href={`/invoices/${receipt.invoiceId}`} className="row">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="t-title" style={{ display: "block" }}>
                        {receipt.clientName}
                      </span>
                      <span className="t-secondary" style={{ color: "var(--color-text-aa)" }}>
                        {receipt.number} · {formatStamp(receipt.expectedOn)} ·{" "}
                        {BASIS_LABEL[receipt.basis]}
                      </span>
                    </span>
                    <span style={{ textAlign: "right", flex: "none" }}>
                      <span className="t-data" style={{ display: "block", fontSize: 14 }}>
                        {formatMoney(receipt.amountCents)}
                      </span>
                      <span
                        className="t-data"
                        style={{ display: "block", color: "var(--color-text-aa)", marginTop: 2 }}
                      >
                        {receipt.confidence}%
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
        </section>
      )}
    </main>
  );
}
