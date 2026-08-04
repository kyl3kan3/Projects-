/**
 * /dashboard — the 6am screen. What leaves today, what is due back, what is late,
 * and what the whole shop is planning around this week.
 *
 * The counts are the heroes (DESIGN.md), so they are set in the mono display face
 * and everything else is quiet around them.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { OrderPlacard, Placard } from "@/components/Placard";
import { requireSession } from "@/lib/auth";
import { addDays, formatDateWithDow, formatWindow } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { itemSummary } from "@/lib/order-core";
import { getLines, listOrders, ordersInWindow, todayFor } from "@/lib/orders";
import { listRuns } from "@/lib/runs";

export const metadata: Metadata = { title: "Today" };

export default async function DashboardPage() {
  const { account } = await requireSession();
  const today = todayFor(account);
  const weekAhead = addDays(today, 7);

  const [window, runs, drafts] = await Promise.all([
    ordersInWindow(account.id, today, weekAhead),
    listRuns(account.id, { from: today, to: weekAhead }),
    listOrders(account.id, { statuses: ["draft", "sent"], limit: 6 }),
  ]);

  const outToday = window.filter((r) => r.order.outOn === today && r.order.status !== "cancelled");
  const dueToday = window.filter((r) => r.order.dueBackOn === today && r.order.status === "out");
  const overdue = (await listOrders(account.id, { statuses: ["out"] })).filter(
    (r) => r.order.dueBackOn < today,
  );
  const unitsOut = window
    .filter((r) => r.order.outOn <= today && r.order.dueBackOn > today && r.order.status === "out")
    .reduce((sum, r) => sum + r.unitCount, 0);

  const awaitingSettlement = await listOrders(account.id, { statuses: ["returned"] });

  return (
    <main style={{ paddingBottom: 40 }}>
      <h1 className="t-h2">{formatDateWithDow(today)}</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {unitsOut > 0
          ? `${unitsOut} units of gear are off the shelf right now.`
          : "Nothing is out on the road right now."}
      </p>

      {/* --- the four counts --- */}
      <div
        className="panel"
        style={{
          marginTop: 20,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <Count label="Out today" value={outToday.length} href="/orders" />
        <Count label="Due back today" value={dueToday.length} href="/returns" />
        <Count
          label="Overdue"
          value={overdue.length}
          href="/returns"
          tone={overdue.length > 0 ? "warn" : "dim"}
        />
        <Count label="To settle" value={awaitingSettlement.length} href="/returns" />
      </div>

      {/* --- overdue, named --- */}
      {overdue.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Overdue returns</h2>
          <div className="stack" style={{ marginTop: 8 }}>
            {overdue.map((row) => (
              <Link key={row.order.id} href={`/orders/${row.order.id}`} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-title">
                    #{row.order.number} · {row.customerName}
                  </p>
                  <p className="t-secondary tone-warn" style={{ marginTop: 2 }}>
                    Due back {formatDateWithDow(row.order.dueBackOn)} · {row.unitCount} units still
                    out
                  </p>
                </div>
                <OrderPlacard order={row.order} today={today} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- leaving today --- */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Leaving the yard today</h2>
        {outToday.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing is scheduled out today. The calendar is where next Saturday lives.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {await Promise.all(
              outToday.map(async (row) => {
                const lines = await getLines(row.order.id);
                return (
                  <Link key={row.order.id} href={`/orders/${row.order.id}`} className="row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="t-title">
                        #{row.order.number} · {row.customerName}
                      </p>
                      <p className="t-secondary" style={{ marginTop: 2 }}>
                        {itemSummary(
                          lines.map((l) => ({ quantity: l.quantity, itemName: l.itemName })),
                          3,
                        )}
                      </p>
                      <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                        {row.order.delivery ? "Delivery" : "Customer pickup"} ·{" "}
                        {formatMoney(row.order.totalCents)}
                      </p>
                    </div>
                    <OrderPlacard order={row.order} today={today} />
                  </Link>
                );
              }),
            )}
          </div>
        )}
      </section>

      {/* --- runs this week --- */}
      <section style={{ marginTop: 32 }}>
        <div className="between">
          <h2 className="t-label">Runs this week</h2>
          <Link href="/runs" className="btn-quiet">
            All runs
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No runs planned. Group the orders going out on one day into a run and the load list
            writes itself.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {runs.map(({ run, stopCount, driverName }) => (
              <Link key={run.id} href={`/runs/${run.id}`} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-title">
                    {run.kind === "delivery" ? "Delivery" : "Pickup"} ·{" "}
                    {formatDateWithDow(run.runOn)}
                  </p>
                  <p className="t-secondary" style={{ marginTop: 2 }}>
                    {run.truckLabel ?? "Truck unassigned"} · {driverName ?? "Driver unassigned"} ·{" "}
                    {stopCount} stop{stopCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Placard label={run.status} tone={run.status === "done" ? "good" : "dim"} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* --- open quotes --- */}
      <section style={{ marginTop: 32 }}>
        <div className="between">
          <h2 className="t-label">Open quotes</h2>
          <Link href="/orders/new" className="btn-quiet">
            New quote
          </Link>
        </div>
        {drafts.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No quotes waiting. Build one and every line will show live availability for that exact
            window.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {drafts.map((row) => (
              <Link key={row.order.id} href={`/orders/${row.order.id}`} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-title">
                    #{row.order.number} · {row.customerName}
                  </p>
                  <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                    {formatWindow(row.order.outOn, row.order.dueBackOn)}
                  </p>
                </div>
                <span className="t-mono">{formatMoney(row.order.totalCents)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Count({
  label,
  value,
  href,
  tone = "ink",
}: {
  label: string;
  value: number;
  href: string;
  tone?: "ink" | "warn" | "dim";
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <p className="t-label">{label}</p>
      <p
        className="t-count"
        style={{
          marginTop: 4,
          color: tone === "warn" ? "var(--color-rust-strong)" : "var(--color-ink)",
        }}
      >
        {value}
      </p>
    </Link>
  );
}
