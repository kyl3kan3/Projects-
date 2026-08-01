import type { Metadata } from "next";
import Link from "next/link";
import { AgingBar } from "@/components/AgingBar";
import { InvoiceRow } from "@/components/InvoiceRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconAlert, IconChevronRight, IconUsers } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { connectionsFor, PROVIDER_LABELS } from "@/lib/accounting";
import { loadDashboard } from "@/lib/dashboard";
import { dsoLabel, plural, timeAgo } from "@/lib/display";
import { emailReady } from "@/lib/email";
import { formatMoneyShort } from "@/lib/money";

export const metadata: Metadata = { title: "Aging" };
export const dynamic = "force-dynamic";

export default async function AgingPage() {
  const { firm } = await requireFirm();
  const data = await loadDashboard(firm);
  const connections = await connectionsFor(firm.id);
  const primary = connections[0] ?? null;
  const mail = emailReady();

  const syncLine = primary
    ? `${PROVIDER_LABELS[primary.provider]} · ${timeAgo(primary.lastSyncedAt)}`
    : "no accounting connected";

  return (
    <main>
      <ScreenHeader firmName={firm.name} meta={syncLine} metaHref="/connect" />

      <section className="gutter">
        <p className="t-label">Outstanding</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <p className="t-stat">{formatMoneyShort(data.aging.outstandingCents)}</p>
          <p className="t-data" style={{ fontSize: 15, color: "var(--color-text-2)" }}>
            {dsoLabel(data.dso, data.dsoChange)}
          </p>
        </div>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {data.aging.invoiceCount === 0
            ? "Nothing outstanding — every invoice on the book is settled."
            : `${plural(data.aging.invoiceCount, "open invoice")} · ${formatMoneyShort(
                data.aging.overdueCents,
              )} past due across ${plural(data.aging.overdueCount, "invoice")}`}
        </p>

        <div style={{ marginTop: 24 }}>
          <AgingBar aging={data.aging} />
        </div>

        {data.slowestPayer ? (
          <div style={{ marginTop: 20 }}>
            <p className="t-secondary">
              Slowest payer: <strong>{data.slowestPayer.name}</strong> at{" "}
              <span className="t-data">{data.slowestPayer.avgDaysToPay}d</span> average.
            </p>
            <Link href="/clients" className="btn-quiet" style={{ paddingLeft: 0 }}>
              See every client
            </Link>
          </div>
        ) : (
          <Link
            href="/clients"
            className="row"
            style={{ marginTop: 20, borderTop: "1px solid var(--color-hairline)" }}
          >
            <IconUsers size={18} style={{ color: "var(--color-text-2)" }} />
            <span style={{ flex: 1 }}>
              <span className="t-title" style={{ display: "block" }}>
                {plural(data.clientCount, "client")}
              </span>
              <span className="t-secondary" style={{ color: "var(--color-text-aa)" }}>
                Payment behaviour, term overrides, VIP exclusions
              </span>
            </span>
            <IconChevronRight size={18} style={{ color: "var(--color-text-aa)" }} />
          </Link>
        )}
      </section>

      {firm.followUpPaused ? (
        <section className="gutter" style={{ marginTop: 24 }}>
          <div
            className="panel"
            style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}
          >
            <IconAlert size={20} style={{ color: "var(--color-amber)", flex: "none" }} />
            <div>
              <p className="t-title">All follow-up is paused</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                Nothing will be sent to any client, on any invoice, until you switch it back
                on in{" "}
                <Link href="/settings" style={{ color: "var(--color-banker)", fontWeight: 600 }}>
                  settings
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {!mail.ready ? (
        <section className="gutter" style={{ marginTop: 24 }}>
          <div
            className="panel"
            style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}
          >
            <IconAlert size={20} style={{ color: "var(--color-text-aa)", flex: "none" }} />
            <div>
              <p className="t-title">Sends are being logged, not delivered</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                {mail.reason}. Approvals still work end to end — each send is recorded with
                the exact copy that would have gone out.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="gutter" style={{ marginTop: 32 }}>
        <p className="t-label" style={{ marginBottom: 4 }}>
          Needs attention
        </p>
        {data.attention.length === 0 ? (
          <EmptyAttention hasConnection={Boolean(primary)} />
        ) : (
          <div>
            {data.attention.map((row, index) => (
              <InvoiceRow
                key={row.invoice.id}
                index={index}
                href={`/invoices/${row.invoice.id}`}
                clientName={row.client.name}
                invoiceNumber={row.invoice.number}
                amountCents={row.invoice.balanceCents}
                currency={row.invoice.currency}
                daysLate={row.daysLate}
                stateLine={row.stateLine}
                ladder={row.ladder}
                settled={false}
              />
            ))}
          </div>
        )}
      </section>

      {data.settled.length > 0 ? (
        <section className="gutter" style={{ marginTop: 32 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>
            Settled
          </p>
          {data.settled.map((row, index) => (
            <InvoiceRow
              key={row.invoice.id}
              index={index}
              href={`/invoices/${row.invoice.id}`}
              clientName={row.client.name}
              invoiceNumber={row.invoice.number}
              amountCents={row.invoice.amountCents}
              currency={row.invoice.currency}
              daysLate={0}
              stateLine={row.stateLine}
              ladder={row.ladder}
              settled
              paidAt={row.invoice.paidAt}
            />
          ))}
        </section>
      ) : null}

      {data.approvalsWaiting > 0 ? (
        <div className="thumb-bar">
          <Link href="/approvals" className="btn btn-primary btn-full">
            Review {plural(data.approvalsWaiting, "queued send")}
          </Link>
        </div>
      ) : null}
    </main>
  );
}

function EmptyAttention({ hasConnection }: { hasConnection: boolean }) {
  return (
    <div style={{ paddingTop: 16 }}>
      <p className="t-body" style={{ color: "var(--color-text-2)" }}>
        {hasConnection
          ? "Nothing to chase. Every open invoice is inside its terms, and the ladder is waiting for the first pinned date."
          : "No invoices yet. Connect QuickBooks or Xero, or drop in a CSV, and your aging picture appears here — along with the follow-ups PaidWell would send."}
      </p>
      {!hasConnection ? (
        <Link href="/connect" className="btn btn-secondary" style={{ marginTop: 16 }}>
          Connect your accounting
        </Link>
      ) : null}
    </div>
  );
}
