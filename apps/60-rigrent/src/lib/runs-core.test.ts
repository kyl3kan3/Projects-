/**
 * Load lists and stop order. Three orders wanting 40 chairs is one line reading
 * 120 — a driver counting three separate stacks of 40 miscounts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadList, reorderStops, runTotals, stops, type RunLine } from "@/lib/runs-core";
import { monthGrid, monthBounds, indexByDay, busiestDay } from "@/lib/calendar-core";

const line = (over: Partial<RunLine>): RunLine => ({
  orderId: "o1",
  orderNumber: 1043,
  customerName: "Stonewell Chapel",
  address: "980 Old Kyle Rd",
  itemId: "chair",
  itemName: "White folding chair",
  category: "Seating",
  quantity: 40,
  ...over,
});

test("the load list aggregates the same item across every stop", () => {
  const list = loadList(
    [
      line({ orderId: "a", orderNumber: 1, quantity: 40 }),
      line({ orderId: "b", orderNumber: 2, quantity: 40 }),
      line({ orderId: "c", orderNumber: 3, quantity: 40 }),
    ],
    ["a", "b", "c"],
  );
  assert.equal(list.length, 1);
  assert.equal(list[0].quantity, 120);
  assert.deepEqual(list[0].perStop, [
    { orderNumber: 1, quantity: 40 },
    { orderNumber: 2, quantity: 40 },
    { orderNumber: 3, quantity: 40 },
  ]);
});

test("perStop follows the stop sequence, not the input order", () => {
  const list = loadList(
    [
      line({ orderId: "b", orderNumber: 2, quantity: 10 }),
      line({ orderId: "a", orderNumber: 1, quantity: 5 }),
    ],
    ["a", "b"],
  );
  assert.deepEqual(list[0].perStop, [
    { orderNumber: 1, quantity: 5 },
    { orderNumber: 2, quantity: 10 },
  ]);
});

test("two lines of the same item on one order merge in perStop", () => {
  const list = loadList(
    [
      line({ orderId: "a", orderNumber: 1, quantity: 20 }),
      line({ orderId: "a", orderNumber: 1, quantity: 20 }),
    ],
    ["a"],
  );
  assert.equal(list[0].quantity, 40);
  assert.deepEqual(list[0].perStop, [{ orderNumber: 1, quantity: 40 }]);
});

test("the load list is grouped by category, then name — how a warehouse is arranged", () => {
  const list = loadList(
    [
      line({ itemId: "linen", itemName: "White linen", category: "Linens", quantity: 12 }),
      line({ itemId: "chair", itemName: "White folding chair", category: "Seating", quantity: 40 }),
      line({ itemId: "banquet", itemName: "6ft banquet table", category: "Tables", quantity: 8 }),
      line({ itemId: "round", itemName: "60in round table", category: "Tables", quantity: 4 }),
    ],
    ["o1"],
  );
  assert.deepEqual(
    list.map((e) => e.itemName),
    ["White linen", "White folding chair", "60in round table", "6ft banquet table"],
  );
});

test("run totals count item lines and units", () => {
  const list = loadList(
    [
      line({ itemId: "chair", quantity: 120 }),
      line({ itemId: "table", itemName: "6ft banquet table", quantity: 20 }),
    ],
    ["o1"],
  );
  assert.deepEqual(runTotals(list), { itemLines: 2, units: 140 });
});

test("stops aggregate per order, in the run's own sequence", () => {
  const list = stops(
    [
      line({ orderId: "a", orderNumber: 1, itemId: "chair", quantity: 40 }),
      line({ orderId: "a", orderNumber: 1, itemId: "table", quantity: 8 }),
      line({ orderId: "b", orderNumber: 2, itemId: "chair", quantity: 20 }),
    ],
    ["b", "a"],
  );
  assert.deepEqual(
    list.map((s) => s.orderNumber),
    [2, 1],
  );
  assert.equal(list[1].itemCount, 2);
  assert.equal(list[1].unitCount, 48);
});

test("an order not in the stop array sorts last rather than disappearing", () => {
  const list = stops(
    [
      line({ orderId: "ghost", orderNumber: 9 }),
      line({ orderId: "a", orderNumber: 1 }),
    ],
    ["a"],
  );
  assert.deepEqual(
    list.map((s) => s.orderNumber),
    [1, 9],
  );
});

test("reordering stops is clamped at both ends", () => {
  assert.deepEqual(reorderStops(["a", "b", "c"], "a", "up"), ["a", "b", "c"]);
  assert.deepEqual(reorderStops(["a", "b", "c"], "c", "down"), ["a", "b", "c"]);
  assert.deepEqual(reorderStops(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
  assert.deepEqual(reorderStops(["a", "b", "c"], "b", "down"), ["a", "c", "b"]);
  assert.deepEqual(reorderStops(["a", "b", "c"], "ghost", "up"), ["a", "b", "c"]);
});

/* -------------------------------------------------------------- calendar --- */

test("the month grid is six Monday-first weeks covering the month", () => {
  const cells = monthGrid("2026-08-15", "2026-08-08");
  assert.equal(cells.length, 42);
  // 2026-08-01 is a Saturday, so the grid starts on Monday 2026-07-27.
  assert.equal(cells[0].date, "2026-07-27");
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells.find((c) => c.date === "2026-08-01")?.inMonth, true);
  assert.equal(cells.find((c) => c.date === "2026-08-08")?.isToday, true);
  assert.equal(cells.find((c) => c.date === "2026-08-08")?.isWeekend, true);
  assert.equal(cells.find((c) => c.date === "2026-08-10")?.isWeekend, false);
});

test("a month starting on a Monday still gets six full weeks", () => {
  const cells = monthGrid("2026-06-10");
  assert.equal(cells.length, 42);
  assert.equal(cells[0].date, "2026-06-01");
});

test("month bounds are half-open, so they plug into the overlap predicate", () => {
  assert.deepEqual(monthBounds("2026-08-15"), { from: "2026-08-01", to: "2026-09-01" });
  assert.deepEqual(monthBounds("2026-02-10"), { from: "2026-02-01", to: "2026-03-01" });
});

test("the calendar index puts an order on its out day, its back day, and every day between", () => {
  const cells = monthGrid("2026-08-15", "2026-08-08");
  const index = indexByDay(
    cells,
    [
      {
        id: "o1",
        number: 1043,
        customerName: "Stonewell Chapel",
        status: "confirmed",
        outOn: "2026-08-08",
        dueBackOn: "2026-08-11",
        unitCount: 120,
        delivery: true,
      },
    ],
    [
      {
        id: "r1",
        kind: "delivery",
        runOn: "2026-08-08",
        truckLabel: "Truck 2",
        stopCount: 2,
        status: "planned",
      },
    ],
  );

  assert.equal(index.get("2026-08-08")?.out.length, 1);
  assert.equal(index.get("2026-08-09")?.onRent.length, 1);
  assert.equal(index.get("2026-08-10")?.onRent.length, 1);
  assert.equal(index.get("2026-08-11")?.back.length, 1);
  assert.equal(index.get("2026-08-12")?.out.length, 0);
  assert.equal(index.get("2026-08-08")?.runs.length, 1);
  // Units are off the shelf on the out day and every day up to (not including)
  // the return, which is the same half-open convention as availability.
  assert.equal(index.get("2026-08-08")?.unitsOut, 120);
  assert.equal(index.get("2026-08-10")?.unitsOut, 120);
  assert.equal(index.get("2026-08-11")?.unitsOut, 0);
});

test("the busiest day is the point of the whole screen", () => {
  const cells = monthGrid("2026-08-15", "2026-08-08");
  const index = indexByDay(
    cells,
    [
      {
        id: "a",
        number: 1,
        customerName: "A",
        status: "confirmed",
        outOn: "2026-08-08",
        dueBackOn: "2026-08-09",
        unitCount: 120,
        delivery: true,
      },
      {
        id: "b",
        number: 2,
        customerName: "B",
        status: "confirmed",
        outOn: "2026-08-08",
        dueBackOn: "2026-08-09",
        unitCount: 48,
        delivery: true,
      },
      {
        id: "c",
        number: 3,
        customerName: "C",
        status: "confirmed",
        outOn: "2026-08-15",
        dueBackOn: "2026-08-16",
        unitCount: 30,
        delivery: false,
      },
    ],
    [],
  );
  assert.deepEqual(busiestDay(index), { date: "2026-08-08", unitsOut: 168 });
});

test("an empty month has no busiest day rather than a zero one", () => {
  assert.equal(busiestDay(indexByDay(monthGrid("2026-08-15"), [], [])), null);
});
