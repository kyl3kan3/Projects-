/**
 * /calendar — month view (DESIGN.md screen 5).
 *
 * Day cells stack order chips; the busiest-Saturday density is the whole point,
 * so weekend columns carry a faint canvas wash and every day shows the units off
 * the shelf. The week view underneath lists the runs.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import {
  busiestDay,
  indexByDay,
  monthBounds,
  monthGrid,
  type CalendarOrder,
  type CalendarRun,
} from "@/lib/calendar-core";
import {
  addMonths,
  dowShort,
  formatDateWithDow,
  monthName,
  parseIsoDate,
  startOfMonth,
  startOfWeek,
  addDays,
  isIsoDate,
} from "@/lib/dates";
import { displayStatus } from "@/lib/order-core";
import { ordersInWindow, todayFor } from "@/lib/orders";
import { listRuns } from "@/lib/runs";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const { account } = await requireSession();
  const today = todayFor(account);
  const anchor = month && isIsoDate(`${month}-01`) ? `${month}-01` : startOfMonth(today);
  const bounds = monthBounds(anchor);

  const [orderRows, runRows] = await Promise.all([
    ordersInWindow(account.id, bounds.from, bounds.to),
    listRuns(account.id, { from: bounds.from, to: bounds.to }),
  ]);

  const orders: CalendarOrder[] = orderRows.map((r) => ({
    id: r.order.id,
    number: r.order.number,
    customerName: r.customerName,
    status: displayStatus(r.order, today),
    outOn: r.order.outOn,
    dueBackOn: r.order.dueBackOn,
    unitCount: r.unitCount,
    delivery: r.order.delivery,
  }));
  const runs: CalendarRun[] = runRows.map((r) => ({
    id: r.run.id,
    kind: r.run.kind,
    runOn: r.run.runOn,
    truckLabel: r.run.truckLabel,
    stopCount: r.stopCount,
    status: r.run.status,
  }));

  const cells = monthGrid(anchor, today);
  const index = indexByDay(cells, orders, runs);
  const busiest = busiestDay(index);
  const { year, month: monthNumber } = parseIsoDate(anchor);
  const prev = addMonths(anchor, -1).slice(0, 7);
  const next = addMonths(anchor, 1).slice(0, 7);

  const weekStart = startOfWeek(today);
  const weekRuns = runRows.filter(
    (r) => r.run.runOn >= weekStart && r.run.runOn < addDays(weekStart, 7),
  );

  return (
    <main style={{ paddingBottom: 40 }}>
      <div className="between">
        <div>
          <h1 className="t-h2">
            {monthName(monthNumber)} {year}
          </h1>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {busiest
              ? `Busiest day: ${formatDateWithDow(busiest.date)} with ${busiest.unitsOut} units off the shelf.`
              : "Nothing booked this month."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/calendar?month=${prev}`} className="chip">
            Prev
          </Link>
          <Link href={`/calendar?month=${next}`} className="chip">
            Next
          </Link>
        </div>
      </div>

      <div className="scroll-x" style={{ marginTop: 20 }}>
        <div className="cal-grid">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
            <div key={dow} className="cal-head">
              {dowShort(dow)}
            </div>
          ))}
          {cells.map((cell) => {
            const day = index.get(cell.date);
            return (
              <div
                key={cell.date}
                className="cal-cell"
                data-in-month={cell.inMonth ? "true" : "false"}
                data-weekend={cell.isWeekend ? "true" : "false"}
                data-today={cell.isToday ? "true" : "false"}
              >
                <div className="between" style={{ gap: 2 }}>
                  <span className="cal-date">{parseIsoDate(cell.date).day}</span>
                  {day && day.unitsOut > 0 ? (
                    <span className="cal-date">{day.unitsOut}u</span>
                  ) : null}
                </div>
                {/* Density marks: what the cell can say at 50px wide. */}
                {day && (day.out.length || day.back.length || day.runs.length) ? (
                  <div className="cal-marks">
                    {day.out.map((order) => (
                      <span
                        key={`m-out-${order.id}`}
                        className="cal-mark"
                        data-kind={order.status === "overdue" ? "overdue" : "out"}
                      />
                    ))}
                    {day.back.map((order) => (
                      <span
                        key={`m-back-${order.id}`}
                        className="cal-mark"
                        data-kind={order.status === "overdue" ? "overdue" : "back"}
                      />
                    ))}
                    {day.runs.map((run) => (
                      <span key={`m-run-${run.id}`} className="cal-mark" data-kind="run" />
                    ))}
                  </div>
                ) : null}
                {day?.out.map((order) => (
                  <Link
                    key={`out-${order.id}`}
                    href={`/orders/${order.id}`}
                    className="cal-chip"
                    data-kind={order.status === "overdue" ? "overdue" : "out"}
                    title={`Out: #${order.number} ${order.customerName}`}
                  >
                    ↑ #{order.number} {order.customerName}
                  </Link>
                ))}
                {day?.back.map((order) => (
                  <Link
                    key={`back-${order.id}`}
                    href={`/orders/${order.id}`}
                    className="cal-chip"
                    data-kind={order.status === "overdue" ? "overdue" : "back"}
                    title={`Back: #${order.number} ${order.customerName}`}
                  >
                    ↓ #{order.number} {order.customerName}
                  </Link>
                ))}
                {day?.runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="cal-chip"
                    data-kind="run"
                    title={`${run.kind} run · ${run.stopCount} stops`}
                  >
                    {run.kind === "delivery" ? "Del" : "Pick"} · {run.stopCount}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <p className="t-secondary" style={{ marginTop: 12 }}>
        ↑ leaving the yard · ↓ due back · outlined marks are truck runs · the number top-right is
        units off the shelf that day.
      </p>

      {/*
        The month, day by day. On a phone the grid cells are 50px wide and can only
        carry the density, so the names live here — and this is the list a thumb
        actually taps. On a wide screen the cells carry the chips too and this reads
        as the agenda beside them.
      */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Day by day</h2>
        {[...index.entries()].filter(
          ([date, day]) =>
            cells.find((c) => c.date === date)?.inMonth &&
            (day.out.length > 0 || day.back.length > 0 || day.runs.length > 0),
        ).length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing on the calendar this month. Quotes appear here the moment they are sent.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {[...index.entries()]
              .filter(
                ([date, day]) =>
                  cells.find((c) => c.date === date)?.inMonth &&
                  (day.out.length > 0 || day.back.length > 0 || day.runs.length > 0),
              )
              .map(([date, day]) => (
                <div key={date} className="row row-stack">
                  <div className="between" style={{ width: "100%" }}>
                    <span className="t-title">{formatDateWithDow(date)}</span>
                    <span className="t-mono tone-dim">
                      {day.unitsOut > 0 ? `${day.unitsOut} units out` : "—"}
                    </span>
                  </div>
                  <div className="stack" style={{ width: "100%", gap: 4 }}>
                    {day.out.map((order) => (
                      <Link
                        key={`a-out-${order.id}`}
                        href={`/orders/${order.id}`}
                        className="t-secondary"
                        style={{ color: "var(--color-canvas-strong)" }}
                      >
                        ↑ out · #{order.number} {order.customerName} · {order.unitCount} units
                      </Link>
                    ))}
                    {day.back.map((order) => (
                      <Link
                        key={`a-back-${order.id}`}
                        href={`/orders/${order.id}`}
                        className="t-secondary"
                        style={{
                          color:
                            order.status === "overdue"
                              ? "var(--color-rust-strong)"
                              : "var(--color-ink)",
                        }}
                      >
                        ↓ back · #{order.number} {order.customerName}
                        {order.status === "overdue" ? " · overdue" : ""}
                      </Link>
                    ))}
                    {day.runs.map((run) => (
                      <Link
                        key={`a-run-${run.id}`}
                        href={`/runs/${run.id}`}
                        className="t-secondary"
                      >
                        {run.kind === "delivery" ? "Delivery run" : "Pickup run"} ·{" "}
                        {run.truckLabel ?? "truck unassigned"} · {run.stopCount} stop
                        {run.stopCount === 1 ? "" : "s"}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">This week&rsquo;s runs</h2>
        {weekRuns.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No runs this week.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {weekRuns.map(({ run, stopCount, driverName }) => (
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
                <span className="t-mono tone-dim">{run.status}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
