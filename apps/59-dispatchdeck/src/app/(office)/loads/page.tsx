/**
 * /loads — the office board (DESIGN.md screen 2).
 *
 * A dense hairline-divided list, or the same loads grouped into status columns,
 * toggled by a query parameter so the choice survives a share and needs no
 * client state.
 *
 * Above it, the attention rail: the three things that actually cost a carrier
 * money if they sit — an unconfirmed rate-con draft, a delivered load with no
 * packet, and an invoice past its terms. Each is a link to the one screen that
 * clears it.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { rateConDrafts } from "@/db/schema";
import { LoadRow } from "@/components/LoadRow";
import { PlusIcon } from "@/components/icons";
import { requireOffice } from "@/lib/auth";
import { LOAD_STATUSES, type LoadStatus } from "@/db/schema";
import { statusLabel, parseAddress } from "@/lib/format";
import { listLoads, toThreadStops } from "@/lib/loads";
import { listReceivables } from "@/lib/invoicing";
import { ageInvoice, toReceivable } from "@/lib/receivables";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Loads" };

const COLUMN_ORDER: LoadStatus[] = [
  "booked",
  "dispatched",
  "at_shipper",
  "in_transit",
  "delivered",
  "invoiced",
  "paid",
];

const FILTERS: Array<{ key: string; label: string; statuses: LoadStatus[] | undefined }> = [
  { key: "open", label: "Open", statuses: ["booked", "dispatched", "at_shipper", "in_transit"] },
  { key: "billing", label: "Billing", statuses: ["delivered", "invoiced"] },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "all", label: "All", statuses: undefined },
];

export default async function LoadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; filter?: string }>;
}) {
  const { carrier } = await requireOffice();
  const params = await searchParams;
  const view = params.view === "columns" ? "columns" : "list";
  const filterKey = FILTERS.some((f) => f.key === params.filter) ? params.filter! : "open";
  const filter = FILTERS.find((f) => f.key === filterKey)!;

  const db = getDb();
  const [rows, drafts, receivables] = await Promise.all([
    listLoads({ carrierId: carrier.id, statuses: filter.statuses }),
    db
      .select({ id: rateConDrafts.id, confidence: rateConDrafts.confidence })
      .from(rateConDrafts)
      .where(and(eq(rateConDrafts.carrierId, carrier.id), eq(rateConDrafts.status, "pending"))),
    listReceivables(carrier.id),
  ]);

  const deliveredNoPacket = await listLoads({
    carrierId: carrier.id,
    statuses: ["delivered"],
  });
  const packetlessCount = deliveredNoPacket.filter((row) => {
    const receivable = receivables.find((r) => r.load.id === row.load.id);
    return !receivable?.invoice.packetDocumentId;
  }).length;

  const overdue = receivables
    .map((r) => ({ r, state: ageInvoice(toReceivable(r.invoice, r.paidCents)) }))
    .filter((x) => x.state.overdue);
  const overdueCents = overdue.reduce((s, x) => s + x.state.outstandingCents, 0);

  const attention = [
    drafts.length > 0
      ? {
          href: "/rate-cons",
          label: `${drafts.length} rate-con draft${drafts.length === 1 ? "" : "s"} waiting`,
          detail: "Confirm and the load builds itself.",
        }
      : null,
    packetlessCount > 0
      ? {
          href: "/loads?filter=billing",
          label: `${packetlessCount} delivered load${packetlessCount === 1 ? "" : "s"} with no packet`,
          detail: "The paperwork is the only thing between here and paid.",
        }
      : null,
    overdue.length > 0
      ? {
          href: "/invoices",
          label: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"} past terms — ${formatCents(overdueCents)}`,
          detail: `Oldest is ${Math.max(...overdue.map((x) => x.state.daysLate))} days late.`,
        }
      : null,
  ].filter((x): x is { href: string; label: string; detail: string } => x !== null);

  const grouped = new Map<LoadStatus, typeof rows>();
  for (const status of LOAD_STATUSES) grouped.set(status, []);
  for (const row of rows) grouped.get(row.load.status)?.push(row);

  return (
    <main className="screen-wide">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="t-h2">Loads</h1>
        <Link href="/loads/new" className="btn btn-primary" style={{ minHeight: 44 }}>
          <PlusIcon size={20} />
          New load
        </Link>
      </div>

      {attention.length > 0 ? (
        <section className="panel mt-6 px-4">
          <p className="t-placard pt-4" style={{ color: "var(--accent)" }}>
            Needs attention
          </p>
          <ul className="list-none m-0 p-0">
            {attention.map((item) => (
              <li key={item.label} className="rule-t mt-3">
                <Link href={item.href} className="block py-3" style={{ textDecoration: "none" }}>
                  <p className="t-body" style={{ fontSize: "0.9375rem" }}>
                    {item.label}
                  </p>
                  <p className="t-secondary">{item.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="pb-2" />
        </section>
      ) : null}

      <nav className="scroll-x mt-6" aria-label="Filter loads">
        <ul className="list-none m-0 p-0 flex gap-2">
          {FILTERS.map((f) => (
            <li key={f.key} style={{ flex: "none" }}>
              <Link
                href={`/loads?filter=${f.key}&view=${view}`}
                className="chip t-placard"
                style={{
                  textDecoration: "none",
                  minHeight: 36,
                  color: f.key === filterKey ? "var(--fg)" : "var(--fg-3)",
                  borderColor: f.key === filterKey ? "var(--accent)" : "var(--line)",
                }}
                aria-current={f.key === filterKey ? "true" : undefined}
              >
                {f.label}
              </Link>
            </li>
          ))}
          <li style={{ flex: "none", marginLeft: "auto" }}>
            <Link
              href={`/loads?filter=${filterKey}&view=${view === "list" ? "columns" : "list"}`}
              className="chip t-placard"
              style={{ textDecoration: "none", minHeight: 36 }}
            >
              {view === "list" ? "Columns" : "List"}
            </Link>
          </li>
        </ul>
      </nav>

      {rows.length === 0 ? (
        <section className="mt-8">
          <p className="t-title">Nothing here yet.</p>
          <p className="t-body mt-2" style={{ color: "var(--fg-2)" }}>
            Forward a rate con to{" "}
            <span className="t-mono" style={{ color: "var(--fg)" }}>
              {parseAddress(carrier.slug)}
            </span>{" "}
            — the load builds itself and you tap once to confirm it.
          </p>
          <p className="t-secondary mt-3">
            Or{" "}
            <Link href="/loads/new" style={{ color: "var(--fg)" }}>
              type one in
            </Link>{" "}
            — broker, rate, two stops, sixty seconds.
          </p>
        </section>
      ) : view === "list" ? (
        <ul className="list-none m-0 p-0 mt-4">
          {rows.map((row, index) => (
            <LoadRow
              key={row.load.id}
              load={row.load}
              stops={toThreadStops(row.stops)}
              brokerName={row.broker?.name ?? null}
              first={index === 0}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {COLUMN_ORDER.filter((status) => (grouped.get(status)?.length ?? 0) > 0).map((status) => (
            <section key={status}>
              <div className="flex items-baseline justify-between rule-b pb-2">
                <p className="t-placard">{statusLabel(status)}</p>
                <p className="t-mono" style={{ color: "var(--fg-3)" }}>
                  {grouped.get(status)?.length ?? 0}
                </p>
              </div>
              <ul className="list-none m-0 p-0">
                {(grouped.get(status) ?? []).map((row, index) => (
                  <LoadRow
                    key={row.load.id}
                    load={row.load}
                    stops={toThreadStops(row.stops)}
                    brokerName={row.broker?.name ?? null}
                    first={index === 0}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="t-secondary mt-8">
        <a href="/api/exports/loads" style={{ color: "var(--fg-2)" }}>
          Export every load to CSV
        </a>{" "}
        — works on any plan, including a lapsed one.
      </p>
    </main>
  );
}
