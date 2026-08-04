/**
 * /returns — the due-back queue (DESIGN.md screen 7).
 *
 * What is landing today, what is late, and what has been checked in but not yet
 * settled. Overdue is derived from the date on every render, never stored, so it
 * cannot show "due" on gear that has been missing for seven months.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { OrderPlacard } from "@/components/Placard";
import { requireSession } from "@/lib/auth";
import { addDays, formatDateWithDow } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { itemSummary } from "@/lib/order-core";
import { getLines, listOrders, todayFor } from "@/lib/orders";
import { lateFeeCents } from "@/lib/pricing";

export const metadata: Metadata = { title: "Returns" };

export default async function ReturnsPage() {
  const { account } = await requireSession();
  const today = todayFor(account);
  const soon = addDays(today, 3);

  const [out, returned] = await Promise.all([
    listOrders(account.id, { statuses: ["out"] }),
    listOrders(account.id, { statuses: ["returned"] }),
  ]);

  const overdue = out.filter((r) => r.order.dueBackOn < today);
  const dueToday = out.filter((r) => r.order.dueBackOn === today);
  const dueSoon = out.filter((r) => r.order.dueBackOn > today && r.order.dueBackOn <= soon);
  const later = out.filter((r) => r.order.dueBackOn > soon);

  return (
    <main style={{ paddingBottom: 40 }}>
      <h1 className="t-h2">Returns</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        Check every line in as clean, damaged or missing. A clean order releases its deposit hold on
        its own.
      </p>

      {out.length === 0 && returned.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 20 }}>
          <p className="t-title">Nothing is out on the road.</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            When an order is loaded out it appears here on its due-back date, with a check-in row for
            every line.
          </p>
          <Link href="/orders" className="btn btn-secondary btn-full" style={{ marginTop: 16 }}>
            See the orders
          </Link>
        </div>
      ) : null}

      <Group title="Overdue" rows={overdue} today={today} tone="warn" />
      <Group title="Due back today" rows={dueToday} today={today} />
      <Group title="Due in the next three days" rows={dueSoon} today={today} />
      <Group title="Out later" rows={later} today={today} />

      {returned.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Checked in, deposit not settled</h2>
          <div className="stack" style={{ marginTop: 8 }}>
            {returned.map((row) => (
              <Link key={row.order.id} href={`/orders/${row.order.id}`} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-title">
                    #{row.order.number} · {row.customerName}
                  </p>
                  <p className="t-secondary" style={{ marginTop: 2 }}>
                    Deposit {formatMoney(row.order.depositCents)} still held — settle or release it.
                  </p>
                </div>
                <OrderPlacard order={row.order} today={today} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

async function Group({
  title,
  rows,
  today,
  tone,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof listOrders>>;
  today: string;
  tone?: "warn";
}) {
  if (rows.length === 0) return null;
  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="t-label">{title}</h2>
      <div className="stack" style={{ marginTop: 8 }}>
        {await Promise.all(
          rows.map(async (row) => {
            const lines = await getLines(row.order.id);
            const late = lateFeeCents(
              lines.map((l) => ({ quantity: l.quantity, dailyRateCents: l.dailyRateCents })),
              row.order.dueBackOn,
              today,
            );
            return (
              <Link
                key={row.order.id}
                href={`/returns/${row.order.id}`}
                className="row row-stack"
              >
                <div className="between" style={{ width: "100%" }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="t-title">
                      #{row.order.number} · {row.customerName}
                    </p>
                    <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                      Due {formatDateWithDow(row.order.dueBackOn)} · {row.unitCount} units
                    </p>
                  </div>
                  <OrderPlacard order={row.order} today={today} />
                </div>
                <p className="t-secondary" style={{ width: "100%" }}>
                  {itemSummary(
                    lines.map((l) => ({ quantity: l.quantity, itemName: l.itemName })),
                    3,
                  )}
                </p>
                {tone === "warn" && late > 0 ? (
                  <p className="t-mono tone-warn" style={{ width: "100%" }}>
                    Late charges so far {formatMoney(late)}
                  </p>
                ) : null}
              </Link>
            );
          }),
        )}
      </div>
    </section>
  );
}
