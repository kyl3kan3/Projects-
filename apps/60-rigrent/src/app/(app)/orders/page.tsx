import type { Metadata } from "next";
import Link from "next/link";
import { DepositPlacard, OrderPlacard } from "@/components/Placard";
import { IconPlus } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { formatWindow } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listOrders, todayFor } from "@/lib/orders";
import { canWrite, entitlements } from "@/lib/plans";
import type { OrderStatus } from "@/db/schema";

export const metadata: Metadata = { title: "Orders" };

const FILTERS: Array<{ key: string; label: string; statuses?: OrderStatus[] }> = [
  { key: "open", label: "Open", statuses: ["draft", "sent", "accepted", "confirmed", "out"] },
  { key: "quotes", label: "Quotes", statuses: ["draft", "sent"] },
  { key: "booked", label: "Booked", statuses: ["accepted", "confirmed"] },
  { key: "out", label: "Out", statuses: ["out"] },
  { key: "settle", label: "To settle", statuses: ["returned"] },
  { key: "all", label: "All" },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "open" } = await searchParams;
  const { account } = await requireSession();
  const today = todayFor(account);
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const rows = await listOrders(account.id, { statuses: active.statuses });
  const ent = entitlements(account);

  return (
    <main style={{ paddingBottom: 40 }}>
      <div className="between">
        <div>
          <h1 className="t-h2">Orders</h1>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            Quote, order and contract are one object with one number.
          </p>
        </div>
        {canWrite(ent).allowed ? (
          <Link href="/orders/new" className="btn btn-primary" style={{ minHeight: 44 }}>
            <IconPlus />
            New
          </Link>
        ) : null}
      </div>

      <div className="chip-row" style={{ marginTop: 20 }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/orders?filter=${f.key}`}
            className="chip"
            data-active={f.key === active.key ? "true" : "false"}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 20 }}>
          <p className="t-title">Nothing here yet.</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            {active.key === "open"
              ? "Build a quote for a date window and every line will show what is actually free that weekend."
              : "Try another filter — or the All tab."}
          </p>
          <Link href="/orders/new" className="btn btn-primary btn-full" style={{ marginTop: 16 }}>
            New quote
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {rows.map((row) => (
            <Link key={row.order.id} href={`/orders/${row.order.id}`} className="row row-stack">
              <div className="between" style={{ width: "100%" }}>
                <div style={{ minWidth: 0 }}>
                  <p className="t-title">
                    #{row.order.number} · {row.customerName}
                  </p>
                  <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                    {formatWindow(row.order.outOn, row.order.dueBackOn)}
                  </p>
                </div>
                <OrderPlacard order={row.order} today={today} />
              </div>
              <div className="between" style={{ width: "100%" }}>
                <span className="t-secondary">
                  {row.lineCount} line{row.lineCount === 1 ? "" : "s"} · {row.unitCount} units ·{" "}
                  {row.order.delivery ? "delivery" : "pickup"}
                </span>
                <span className="t-mono">{formatMoney(row.order.totalCents)}</span>
              </div>
              {row.order.depositCents > 0 ? (
                <div style={{ width: "100%" }}>
                  <DepositPlacard
                    status={row.order.depositStatus}
                    amountLabel={formatMoney(row.order.depositCents)}
                  />
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
