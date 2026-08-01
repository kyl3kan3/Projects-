import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { PromiseChip } from "@/components/PromiseChip";
import { IconChevronRight, IconHandshake } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { listPromises } from "@/lib/promises";
import { daysBetween, formatLongDate, today } from "@/lib/dates";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { plan } from "@/lib/plans";

export const metadata: Metadata = { title: "Promises" };
export const dynamic = "force-dynamic";

export default async function PromisesPage() {
  const { firm } = await requireFirm();
  const rows = await listPromises(firm.id);
  const asOf = today();
  const features = plan(firm.plan);

  const open = rows.filter((r) => r.promise.status === "open");
  const kept = rows.filter((r) => r.promise.status === "kept");
  const broken = rows.filter((r) => r.promise.status === "broken");
  const openCents = open.reduce((sum, r) => sum + r.promise.amountCents, 0);
  const reliability = kept.length + broken.length > 0
    ? Math.round((kept.length / (kept.length + broken.length)) * 100)
    : null;

  return (
    <main>
      <ScreenHeader firmName={firm.name} meta="promises to pay" />

      <section className="gutter">
        <p className="t-label">Promised, not yet paid</p>
        <p className="t-stat">{formatMoneyShort(openCents)}</p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {open.length === 0
            ? "No open promises. Logging one pauses that invoice's ladder until the date."
            : `${open.length} open · ${reliability === null ? "no history yet" : `${reliability}% of past promises were kept`}`}
        </p>
      </section>

      {!features.promiseTracking ? (
        <section className="gutter" style={{ marginTop: 24 }}>
          <div className="panel" style={{ padding: 16 }}>
            <p className="t-title">Reliability scoring is a Firm-plan feature</p>
            <p className="t-secondary" style={{ marginTop: 4 }}>
              Promises still pause the ladder on every plan — a safety rail is not something to
              sell. What Firm adds is the reliability score that weights each promise in your
              forecast.{" "}
              <Link href="/settings/billing" style={{ color: "var(--color-banker)", fontWeight: 600 }}>
                See plans
              </Link>
            </p>
          </div>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <section className="gutter" style={{ marginTop: 32 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <IconHandshake size={20} style={{ color: "var(--color-text-aa)", marginTop: 2 }} />
            <div>
              <p className="t-title">Nothing promised yet</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                &ldquo;Sending it Friday&rdquo; is where most AR conversations end. Log it on the
                invoice and PaidWell holds off until Friday, then resumes one step firmer if
                Friday passes unpaid.
              </p>
              <Link href="/aging" className="btn-quiet" style={{ paddingLeft: 0, marginTop: 8 }}>
                Go to the aging report
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {[
            { label: "Open", items: open },
            { label: "Broken", items: broken },
            { label: "Kept", items: kept },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.label} className="gutter" style={{ marginTop: 32 }}>
                <p className="t-label" style={{ marginBottom: 4 }}>
                  {group.label}
                </p>
                {group.items.map(({ promise, invoice, client }) => {
                  const days = daysBetween(asOf, promise.promisedFor);
                  return (
                    <Link key={promise.id} href={`/invoices/${invoice.id}`} className="row">
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="t-title" style={{ display: "block" }}>
                          {client.name}
                        </span>
                        <span
                          className="t-secondary"
                          style={{ display: "block", marginTop: 2, color: "var(--color-text-aa)" }}
                        >
                          {invoice.number} · {formatMoney(promise.amountCents, invoice.currency)} ·{" "}
                          {promise.status === "open"
                            ? days === 0
                              ? "due today"
                              : days > 0
                                ? `in ${days} ${days === 1 ? "day" : "days"}`
                                : `${Math.abs(days)} days ago`
                            : formatLongDate(promise.promisedFor)}
                          {promise.source === "portal" ? " · from the portal" : ""}
                        </span>
                        <span style={{ display: "inline-flex", marginTop: 8 }}>
                          <PromiseChip status={promise.status} promisedFor={promise.promisedFor} />
                        </span>
                      </span>
                      <IconChevronRight size={18} style={{ color: "var(--color-text-aa)", flex: "none" }} />
                    </Link>
                  );
                })}
              </section>
            ))}
        </>
      )}
    </main>
  );
}
