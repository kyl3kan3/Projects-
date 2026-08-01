import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { describeInvoiceState, incomeSummary, refreshOverdue } from "@/lib/invoices";
import { formatMoneyShort } from "@/lib/money";
import { monthSpine } from "@/lib/dates";
import { SealChip } from "@/components/SealChip";
import { IconDownload } from "@/components/icons";

export const metadata: Metadata = { title: "Income" };

/**
 * Paid / outstanding / overdue as three stat blocks divided by hairlines — not
 * boxes (DESIGN_LANGUAGE rule 4) — then a year of month spines, then the aging
 * list. The overdue figure gets its vermilion underline only when it is not zero.
 */
export default async function IncomePage() {
  const user = await requireUser();
  const now = new Date();
  await refreshOverdue(user.id, now);
  const summary = await incomeSummary(user.id, now);

  const spine = monthSpine(now);
  const monthly = spine.map((m) => ({ ...m, amount: summary.byMonth.get(m.key) ?? 0 }));
  const peak = Math.max(1, ...monthly.map((m) => m.amount));
  const mixedCurrency = new Set(summary.rows.map((r) => r.currency)).size > 1;

  const stats = [
    { label: "Paid", value: summary.paid, tone: "wax" as const },
    { label: "Outstanding", value: summary.outstanding, tone: "ink" as const },
    { label: "Overdue", value: summary.overdue, tone: "vermilion" as const },
  ];

  return (
    <main className="screen pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="t-h2">Income</h1>
        <Link
          href="/income/export"
          className="btn-quiet inline-flex items-center gap-1"
          prefetch={false}
        >
          <IconDownload size={16} />
          CSV
        </Link>
      </div>

      <section className="mt-6">
        {stats.map((stat, i) => (
          <div key={stat.label} className={i === 0 ? "pb-4" : "hairline-t py-4"}>
            <div className="t-label">{stat.label}</div>
            <div
              className="t-stat mt-1"
              style={{
                color:
                  stat.tone === "wax"
                    ? "var(--color-wax)"
                    : stat.tone === "vermilion" && stat.value > 0
                      ? "var(--color-vermilion)"
                      : "var(--color-ink)",
              }}
            >
              <span className={stat.tone === "vermilion" && stat.value > 0 ? "overdue-underline" : ""}>
                {formatMoneyShort(stat.value, summary.currency)}
              </span>
            </div>
          </div>
        ))}
      </section>

      {mixedCurrency ? (
        <p className="t-secondary hairline-t pt-4">
          You invoice in more than one currency. These totals are added up in {summary.currency};
          per-currency reporting is on the roadmap, and the CSV export keeps every currency separate.
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="t-label">Collected, month by month</h2>
        <div className="spine-track mt-3" aria-hidden="true">
          {monthly.map((m) => (
            <div key={m.key} className="flex flex-col items-center gap-2">
              <div
                className="spine"
                style={{
                  height: 80,
                  opacity: m.amount === 0 ? 0.12 : 0.15 + 0.7 * (m.amount / peak),
                }}
              />
              <span className="t-label" style={{ letterSpacing: 0 }}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
        <p className="t-secondary mt-2">
          {monthly.every((m) => m.amount === 0)
            ? "Nothing collected in the last twelve months yet."
            : `Peak month ${formatMoneyShort(peak, summary.currency)}.`}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="t-label">Invoices</h2>
        {summary.rows.length === 0 ? (
          <p className="t-secondary mt-2 max-w-[44ch]">
            No invoices yet. They appear here the moment a contract is signed — the deposit first,
            then the balance when you mark the work complete.
          </p>
        ) : (
          <ul className="mt-2 list-none p-0">
            {summary.rows.map((row) => (
              <li key={row.documentId}>
                <Link href={`/documents/${row.documentId}`} className="row">
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{row.clientName}</span>
                    <span className="t-meta mt-1 block">
                      {row.number} · {describeInvoiceState(row.status, row, now)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="t-money">{formatMoneyShort(row.total, row.currency)}</span>
                    <SealChip type="invoice" status={row.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="t-secondary mt-8">
        Paid is money actually received, so a half-paid invoice counts its deposit here and its
        remainder under outstanding.
      </p>
    </main>
  );
}
