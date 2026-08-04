/**
 * /orders/new — step one of the quote builder (DESIGN.md screen 2).
 *
 * The event window is asked for first because it drives every gauge that follows.
 * Once the draft exists, the order screen *is* the builder: line rows with live
 * availability for that exact window, and the overbooked block inline.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { NewQuoteForm } from "./NewQuoteForm";
import { createOrderAction } from "../actions";
import { requireSession } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { addDays, dayOfWeek } from "@/lib/dates";
import { listItems } from "@/lib/items";
import { todayFor } from "@/lib/orders";

export const metadata: Metadata = { title: "New quote" };

export default async function NewOrderPage() {
  const { account } = await requireSession();
  const today = todayFor(account);
  const [customers, items] = await Promise.all([
    listCustomers(account.id),
    listItems(account.id),
  ]);

  // Default to the next Saturday, out Saturday and back Sunday — the window a
  // party rental shop types most often.
  const daysToSaturday = (6 - dayOfWeek(today) + 7) % 7 || 7;
  const defaultOutOn = addDays(today, daysToSaturday);

  if (items.length === 0) {
    return (
      <main style={{ paddingBottom: 40, maxWidth: 560 }}>
        <Link href="/orders" className="btn-quiet">
          Orders
        </Link>
        <h1 className="t-h2" style={{ marginTop: 12 }}>
          Add gear before you quote it
        </h1>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          A quote line reads its availability from an item's owned count, so the catalogue comes
          first. Start with the thing you own the most of.
        </p>
        <Link href="/items/new" className="btn btn-primary btn-full" style={{ marginTop: 24 }}>
          Add an item
        </Link>
      </main>
    );
  }

  return (
    <main style={{ paddingBottom: 40, maxWidth: 560 }}>
      <Link href="/orders" className="btn-quiet">
        Orders
      </Link>
      <h1 className="t-h2" style={{ marginTop: 12 }}>
        New quote
      </h1>
      <p className="t-secondary" style={{ marginTop: 4, marginBottom: 24 }}>
        The window first — every line you add next shows what is actually free for those exact dates.
      </p>
      <NewQuoteForm
        customers={customers}
        action={createOrderAction}
        defaultOutOn={defaultOutOn}
        defaultDueBackOn={addDays(defaultOutOn, 1)}
      />
    </main>
  );
}
