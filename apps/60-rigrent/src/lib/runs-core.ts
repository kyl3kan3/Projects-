/**
 * src/lib/runs-core.ts
 *
 * Load-list arithmetic for delivery and pickup runs, with no database in it.
 *
 * The load list is the answer to one question asked at 6am: *what goes on the
 * truck?* It is not the order list. Three orders each wanting 40 chairs is one
 * line reading 120 — a driver counting three separate stacks of 40 miscounts, and
 * a driver loading 120 once does not.
 *
 * Stop order is an explicit array on the run rather than a sort key, because the
 * route is a human decision (the marquee that has to be up before the tables
 * arrive) and no sort captures it.
 */

export interface RunLine {
  orderId: string;
  orderNumber: number;
  customerName: string;
  address: string | null;
  itemId: string;
  itemName: string;
  category: string | null;
  quantity: number;
}

export interface LoadListEntry {
  itemId: string;
  itemName: string;
  category: string | null;
  quantity: number;
  /** Which stops this quantity is spread across, in stop order. */
  perStop: Array<{ orderNumber: number; quantity: number }>;
}

/**
 * Aggregate per item across the whole run, in the stop sequence given. Items are
 * grouped by category first so the load list reads the way a warehouse is
 * arranged, then by name.
 */
export function loadList(lines: readonly RunLine[], stopOrder: readonly string[]): LoadListEntry[] {
  const rank = new Map(stopOrder.map((id, i) => [id, i]));
  const byItem = new Map<string, LoadListEntry>();

  const sorted = [...lines].sort(
    (a, b) => (rank.get(a.orderId) ?? 999) - (rank.get(b.orderId) ?? 999),
  );

  for (const line of sorted) {
    let entry = byItem.get(line.itemId);
    if (!entry) {
      entry = {
        itemId: line.itemId,
        itemName: line.itemName,
        category: line.category,
        quantity: 0,
        perStop: [],
      };
      byItem.set(line.itemId, entry);
    }
    entry.quantity += line.quantity;
    const existing = entry.perStop.find((s) => s.orderNumber === line.orderNumber);
    if (existing) existing.quantity += line.quantity;
    else entry.perStop.push({ orderNumber: line.orderNumber, quantity: line.quantity });
  }

  return [...byItem.values()].sort((a, b) => {
    const ca = a.category ?? "";
    const cb = b.category ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.itemName.localeCompare(b.itemName);
  });
}

export interface Stop {
  orderId: string;
  orderNumber: number;
  customerName: string;
  address: string | null;
  itemCount: number;
  unitCount: number;
}

/** The driver's stop list, in the run's own sequence. Orders not in the array go last. */
export function stops(lines: readonly RunLine[], stopOrder: readonly string[]): Stop[] {
  const byOrder = new Map<string, Stop>();
  for (const line of lines) {
    let stop = byOrder.get(line.orderId);
    if (!stop) {
      stop = {
        orderId: line.orderId,
        orderNumber: line.orderNumber,
        customerName: line.customerName,
        address: line.address,
        itemCount: 0,
        unitCount: 0,
      };
      byOrder.set(line.orderId, stop);
    }
    stop.itemCount += 1;
    stop.unitCount += line.quantity;
  }
  const rank = new Map(stopOrder.map((id, i) => [id, i]));
  return [...byOrder.values()].sort(
    (a, b) => (rank.get(a.orderId) ?? 999) - (rank.get(b.orderId) ?? 999),
  );
}

/** Move a stop up or down the sequence, clamped. Returns a new array. */
export function reorderStops(
  stopOrder: readonly string[],
  orderId: string,
  direction: "up" | "down",
): string[] {
  const next = [...stopOrder];
  const from = next.indexOf(orderId);
  if (from < 0) return next;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** The total on the truck, for the run header. */
export function runTotals(entries: readonly LoadListEntry[]): {
  itemLines: number;
  units: number;
} {
  return {
    itemLines: entries.length,
    units: entries.reduce((sum, e) => sum + e.quantity, 0),
  };
}
