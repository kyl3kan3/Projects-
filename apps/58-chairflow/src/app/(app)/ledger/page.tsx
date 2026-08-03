import type { Metadata } from "next";
import Link from "next/link";
import { WaiveButton } from "@/app/(app)/ledger/WaiveButton";
import {
  Banner,
  EmptyState,
  Figure,
  LedgerLine,
  ProtectedStat,
  ScreenHeader,
} from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { addDaysToDay, firstOfMonth, formatMonth, todayInTimezone } from "@/lib/dates";
import { money } from "@/lib/format";
import {
  LEDGER_FILTERS,
  matchesFilter,
  summarizeLedger,
  summarySentence,
  type LedgerFilter,
} from "@/lib/ledger";
import { ledgerRows } from "@/server/ledger";

export const metadata: Metadata = { title: "Ledger" };

/**
 * The protection ledger: month header with the hero stat, then the lines stacked. Filter
 * chips are links, so a filtered ledger is a URL a stylist can keep open.
 *
 * Declined rows expand into what to do about it, because a fee that failed silently is a
 * fee the stylist never chases.
 */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; month?: string }>;
}) {
  const { stylist } = await requireStylist();
  const params = await searchParams;
  const now = new Date();
  const today = todayInTimezone(stylist.timezone, now);
  const month = params.month ? firstOfMonth(params.month) : firstOfMonth(today);
  const filter = (LEDGER_FILTERS.find((f) => f.id === params.filter)?.id ?? "all") as LedgerFilter;

  const rows = await ledgerRows({ stylistId: stylist.id, timezone: stylist.timezone, month, now });
  const summary = summarizeLedger(rows);
  const shown = rows.filter((r) => matchesFilter(r, filter));
  const previousMonth = firstOfMonth(addDaysToDay(month, -1));
  const isCurrentMonth = month === firstOfMonth(today);
  const anySimulated = rows.some((r) => r.simulated);

  return (
    <>
      <ScreenHeader label={formatMonth(month)} title="Protection ledger" />

      <section style={{ paddingBottom: 20 }}>
        <ProtectedStat cents={summary.protectedCents} hint={summarySentence(summary)} />
      </section>

      <section
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          paddingBottom: 20,
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <Figure label="Fees charged" value={money(summary.feesCollectedCents)} tone="cobalt" />
        <Figure label="Deposits kept" value={money(summary.depositsKeptCents)} />
        <Figure label="Waived" value={money(summary.waivedCents)} />
        {summary.failedCents > 0 && (
          <Figure label="Declined" value={money(summary.failedCents)} tone="red" />
        )}
      </section>

      {anySimulated && (
        <Banner tone="amber">
          Some rows below were recorded rather than charged: Stripe is not configured in this
          environment, so no card was touched. They are marked individually.
        </Banner>
      )}

      <div className="scroll-x" style={{ padding: "16px 0" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {LEDGER_FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/ledger?filter=${f.id}${isCurrentMonth ? "" : `&month=${month}`}`}
              className="chip"
              data-active={f.id === filter}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="ledger-line"
          title={
            rows.length === 0
              ? "No protection events yet"
              : `Nothing matching "${LEDGER_FILTERS.find((f) => f.id === filter)?.label}" this month`
          }
          body={
            rows.length === 0
              ? "Your policy starts working on your next booking. Deposits kept and fees charged land here, and so does every fee you choose to waive."
              : "Try another filter, or look at a different month."
          }
          action={rows.length === 0 ? { href: "/page", label: "Share your booking link" } : undefined}
        />
      ) : (
        <div className="stack">
          {shown.map((row) => (
            <div key={row.id}>
              <LedgerLine row={row} />
              <p className="t-secondary" style={{ margin: "0 0 8px" }}>
                {row.clientName} · {row.serviceName}
                {row.simulated ? " · recorded, not charged" : ""}
              </p>
              {(row.status === "failed" || row.status === "disputed") && (
                <div style={{ paddingBottom: 12 }}>
                  <p className="t-secondary" style={{ margin: "0 0 4px", color: "var(--color-red)" }}>
                    {row.failureReason ?? "The card refused it."}
                  </p>
                  <p className="t-secondary" style={{ margin: "0 0 4px" }}>
                    Nothing was collected. You can waive it and move on, or ask them for another
                    card next time they book — the no-show stays on their record either way.
                  </p>
                  <WaiveButton chargeId={row.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, paddingTop: 24 }}>
        <Link className="btn-quiet" href={`/ledger?filter=${filter}&month=${previousMonth}`}>
          {formatMonth(previousMonth)}
        </Link>
        {!isCurrentMonth && (
          <Link className="btn-quiet" href={`/ledger?filter=${filter}`}>
            This month
          </Link>
        )}
      </div>
    </>
  );
}
