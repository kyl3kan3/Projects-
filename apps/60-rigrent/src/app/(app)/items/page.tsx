/**
 * /items — the inventory (DESIGN.md screen 1).
 *
 * Item rows: name, owned count, category, and the next-30-days strip. The strip is
 * the shape of the month's commitments without a chart library — one 3px bar per
 * day, shaded by how much of the item is out that day.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { LoadStrip } from "@/components/ChalkGauge";
import { IconPlus } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { bookingsInRange } from "@/lib/availability";
import { dailyCommitted } from "@/lib/availability-core";
import { addDays } from "@/lib/dates";
import { listItems } from "@/lib/items";
import { formatMoney } from "@/lib/money";
import { todayFor } from "@/lib/orders";
import { entitlements, canWrite } from "@/lib/plans";

export const metadata: Metadata = { title: "Gear" };

export default async function ItemsPage() {
  const { account } = await requireSession();
  const ent = entitlements(account);
  const today = todayFor(account);
  const horizon = addDays(today, 30);

  const [items, bookings] = await Promise.all([
    listItems(account.id, true),
    bookingsInRange(account.id, today, horizon),
  ]);

  const active = items.filter((i) => i.status === "active");
  const retired = items.filter((i) => i.status === "retired");
  const byItem = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const list = byItem.get(booking.itemId) ?? [];
    list.push(booking);
    byItem.set(booking.itemId, list);
  }

  const totalUnits = active.reduce((sum, i) => sum + i.ownedCount, 0);

  return (
    <main style={{ paddingBottom: 40 }}>
      <div className="between">
        <div>
          <h1 className="t-h2">Gear</h1>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {active.length} item{active.length === 1 ? "" : "s"} · {totalUnits} units owned
          </p>
        </div>
        {canWrite(ent).allowed ? (
          <Link href="/items/new" className="btn btn-primary" style={{ minHeight: 44 }}>
            <IconPlus />
            Add
          </Link>
        ) : null}
      </div>

      {active.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 20 }}>
          <p className="t-title">Add your first item — start with the thing you own the most of.</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            For most yards that is folding chairs. Put the owned count in and every quote from then
            on knows how many are free on any given Saturday.
          </p>
          <Link
            href="/items/new"
            className="btn btn-primary btn-full"
            style={{ marginTop: 16 }}
          >
            Add an item
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 20 }}>
          {active.map((item) => {
            const perDay = dailyCommitted(
              byItem.get(item.id) ?? [],
              today,
              horizon,
              addDays,
            );
            const peak = perDay.length ? Math.max(...perDay) : 0;
            return (
              <Link key={item.id} href={`/items/${item.id}`} className="row row-stack">
                <div className="between" style={{ width: "100%" }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="t-title">{item.name}</p>
                    <p className="t-secondary" style={{ marginTop: 2 }}>
                      {item.category ?? "Uncategorised"} ·{" "}
                      {formatMoney(item.dailyRateCents)}/day
                      {item.weekendRateCents
                        ? ` · ${formatMoney(item.weekendRateCents)} weekend`
                        : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <p className="t-mono-lg">{item.ownedCount}</p>
                    <p className="t-label" style={{ marginTop: 0 }}>
                      owned
                    </p>
                  </div>
                </div>
                <div className="between" style={{ width: "100%" }}>
                  <LoadStrip perDay={perDay} owned={item.ownedCount} />
                  <span className="t-mono tone-dim">
                    {peak > 0 ? `peak ${peak}/${item.ownedCount} in 30d` : "clear for 30 days"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {retired.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Retired</h2>
          <div className="stack" style={{ marginTop: 8 }}>
            {retired.map((item) => (
              <Link key={item.id} href={`/items/${item.id}`} className="row">
                <span className="t-title tone-dim" style={{ flex: 1 }}>
                  {item.name}
                </span>
                <span className="t-mono tone-dim">{item.ownedCount} owned</span>
              </Link>
            ))}
          </div>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Retired gear stays on its old orders so those contracts still read correctly.
          </p>
        </section>
      ) : null}
    </main>
  );
}
