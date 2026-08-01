import type { Metadata } from "next";
import { IconBanknoteIn, IconDownload, IconMail } from "@/components/icons";
import { PromiseChip } from "@/components/PromiseChip";
import { addDays, describeDue, formatLongDate, formatPromiseDate, formatStamp } from "@/lib/dates";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { loadPortalContext, resolvePortalToken } from "@/lib/portal";
import { PortalPanel } from "./PortalPanel";

export const metadata: Metadata = {
  title: "Your invoices",
  // A client-facing page carrying a signed credential must never be indexed.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolvePortalToken(token);

  if (!resolved.ok) {
    return <DeadLink reason={resolved.reason} />;
  }
  const context = await loadPortalContext(resolved.scope);
  if (!context) return <DeadLink reason="invalid" />;

  const focus =
    context.openInvoices.find((row) => row.isFocus)?.invoice ??
    context.openInvoices[0]?.invoice ??
    null;
  const asOf = context.asOf;
  const settledEverything = context.openInvoices.length === 0;

  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: "24px 12px calc(40px + env(safe-area-inset-bottom))",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div className="sheet-card" style={{ width: "100%", maxWidth: 560, padding: 24 }}>
        {/* The firm's letterhead, not ours. No PaidWell branding above the fold. */}
        <p className="t-display" style={{ fontSize: 26, lineHeight: 1.2 }}>
          {context.firm.name}
        </p>
        <div className="rule" style={{ margin: "16px 0 24px" }} />

        <p className="t-label">{settledEverything ? "Nothing outstanding" : "Balance outstanding"}</p>
        <p
          className="t-stat"
          style={{ color: settledEverything ? "var(--color-banker)" : undefined }}
        >
          {formatMoneyShort(context.totalBalanceCents)}
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {settledEverything
            ? `Everything on ${context.client.name}'s account is settled. Thank you.`
            : `${context.openInvoices.length} open ${
                context.openInvoices.length === 1 ? "invoice" : "invoices"
              } for ${context.client.name}`}
        </p>

        {context.openPromise ? (
          <div style={{ marginTop: 16 }}>
            <PromiseChip
              status={context.openPromise.status}
              promisedFor={context.openPromise.promisedFor}
            />
          </div>
        ) : null}

        {context.openInvoices.length > 0 ? (
          <section style={{ marginTop: 32 }}>
            <p className="t-label" style={{ marginBottom: 4 }}>
              Open
            </p>
            {context.openInvoices.map(({ invoice, isFocus }) => (
              <div key={invoice.id} className="row" style={{ alignItems: "flex-start" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {invoice.number}
                    {isFocus ? (
                      <span className="t-label" style={{ marginLeft: 8, color: "var(--color-banker)" }}>
                        this one
                      </span>
                    ) : null}
                  </span>
                  <span className="t-secondary" style={{ display: "block", color: "var(--color-text-aa)" }}>
                    Due {formatLongDate(invoice.dueAt)} · {describeDue(invoice.dueAt, asOf)}
                  </span>
                  {invoice.pdfUrl ? (
                    <a
                      href={invoice.pdfUrl}
                      className="btn-quiet"
                      style={{ paddingLeft: 0, minHeight: 32 }}
                    >
                      <IconDownload size={18} />
                      PDF
                    </a>
                  ) : null}
                </span>
                <span className="t-data" style={{ fontSize: 14, flex: "none" }}>
                  {formatMoney(invoice.balanceCents, invoice.currency)}
                </span>
              </div>
            ))}
          </section>
        ) : null}

        {context.paymentHistory.length > 0 ? (
          <section style={{ marginTop: 32 }}>
            <p className="t-label" style={{ marginBottom: 4 }}>
              Received
            </p>
            {context.paymentHistory.slice(-5).map((payment) => (
              <div key={payment.id} className="row">
                <IconBanknoteIn size={18} style={{ color: "var(--color-banker)" }} />
                <span style={{ flex: 1 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {formatMoney(payment.amountCents)}
                  </span>
                  <span className="t-secondary" style={{ color: "var(--color-text-aa)" }}>
                    {payment.method === "external" ? "recorded" : payment.method} ·{" "}
                    {formatStamp(payment.paidAt)}
                  </span>
                </span>
              </div>
            ))}
          </section>
        ) : null}

        {focus ? (
          <section style={{ marginTop: 32 }}>
            <PortalPanel
              token={token}
              invoiceId={focus.id}
              amountLabel={formatMoney(focus.balanceCents, focus.currency)}
              amountValue={(focus.balanceCents / 100).toFixed(2)}
              minPartial={formatMoney(
                Math.min(context.partialFloorCents, focus.balanceCents),
                focus.currency,
              )}
              today={asOf}
              suggestedDate={addDays(asOf, 7)}
              promisedForLabel={
                context.openPromise ? formatPromiseDate(context.openPromise.promisedFor) : null
              }
            />
          </section>
        ) : null}

        <div className="rule" style={{ margin: "32px 0 16px" }} />
        <p className="t-secondary" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <IconMail size={18} style={{ flex: "none", color: "var(--color-text-aa)" }} />
          <span>
            Questions about any of these? Reply to the email that brought you here — it reaches a
            person at {context.firm.name}, and it stops the automatic reminders straight away.
          </span>
        </p>
        <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-aa)", fontSize: 11 }}>
          Sent with PaidWell on behalf of {context.firm.name}.
        </p>
      </div>
    </main>
  );
}

/** A polite dead end, with the one thing the visitor can actually do. */
function DeadLink({ reason }: { reason: "expired" | "invalid" }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: "24px 12px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div className="sheet-card" style={{ width: "100%", maxWidth: 480, padding: 24 }}>
        <p className="t-label">Payment link</p>
        <h1 className="t-h2" style={{ marginTop: 8 }}>
          {reason === "expired" ? "This link has expired." : "This link is not valid."}
        </h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          {reason === "expired"
            ? "Payment links stop working after 60 days, so an old email cannot be used to see an account."
            : "It may have been copied incompletely, or it belongs to a different account."}
        </p>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          Reply to the email that brought you here and whoever sent it can issue a fresh link in
          a couple of seconds. Nothing has gone wrong with your invoice.
        </p>
        <p className="t-secondary" style={{ marginTop: 24, color: "var(--color-text-aa)", fontSize: 11 }}>
          Sent with PaidWell.
        </p>
      </div>
    </main>
  );
}
