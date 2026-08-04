/**
 * The overlap predicate and the gauge maths. This is the file to read first if you
 * want to know what RigRent actually promises.
 *
 * The window is half-open: an order occupies `[outOn, dueBackOn)`. Same-day
 * turnarounds are the centrepiece, in both directions — a load back on the 9th is
 * free on the 9th, and two orders sharing a Saturday collide.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dailyCommitted,
  gauge,
  gaugeFraction,
  isValidWindow,
  overbookedSentence,
  windowsOverlap,
  type AvailabilityFacts,
  type Conflict,
} from "@/lib/availability-core";
import { addDays } from "@/lib/dates";

const w = (outOn: string, dueBackOn: string) => ({ outOn, dueBackOn });

test("two orders on the same Saturday overlap", () => {
  assert.equal(windowsOverlap(w("2026-08-08", "2026-08-09"), w("2026-08-08", "2026-08-09")), true);
});

test("same-day turnaround does not overlap — back on the 9th, out again on the 9th", () => {
  assert.equal(windowsOverlap(w("2026-08-08", "2026-08-09"), w("2026-08-09", "2026-08-10")), false);
  // And symmetrically.
  assert.equal(windowsOverlap(w("2026-08-09", "2026-08-10"), w("2026-08-08", "2026-08-09")), false);
});

test("a one-day gap does not overlap", () => {
  assert.equal(windowsOverlap(w("2026-08-08", "2026-08-09"), w("2026-08-10", "2026-08-11")), false);
});

test("a long rental swallowing a short one overlaps", () => {
  assert.equal(windowsOverlap(w("2026-08-01", "2026-08-21"), w("2026-08-08", "2026-08-09")), true);
  assert.equal(windowsOverlap(w("2026-08-08", "2026-08-09"), w("2026-08-01", "2026-08-21")), true);
});

test("windows touching at both ends of a long rental", () => {
  // Out the day the long one comes back: free.
  assert.equal(windowsOverlap(w("2026-08-01", "2026-08-08"), w("2026-08-08", "2026-08-09")), false);
  // Back the day the long one leaves: free.
  assert.equal(windowsOverlap(w("2026-08-01", "2026-08-08"), w("2026-07-25", "2026-08-01")), false);
});

test("a zero-length window is not a rental", () => {
  assert.equal(isValidWindow(w("2026-08-08", "2026-08-08")), false);
  assert.equal(isValidWindow(w("2026-08-09", "2026-08-08")), false);
  assert.equal(isValidWindow(w("2026-08-08", "2026-08-09")), true);
});

test("a zero-length window overlaps nothing, which is why it is refused", () => {
  // If this were ever allowed through, a same-day rental would be invisible to
  // every other quote — the exact silent oversell the product exists to stop.
  assert.equal(windowsOverlap(w("2026-08-08", "2026-08-08"), w("2026-08-08", "2026-08-09")), false);
});

const facts = (owned: number, booked: number, held = 0): AvailabilityFacts => ({
  itemId: "i",
  itemName: "White folding chair",
  ownedCount: owned,
  bookedCount: booked,
  heldCount: held,
});

test("the gauge: 32 of 40 committed, 8 requested, fits exactly", () => {
  const g = gauge(facts(40, 32), 8);
  assert.equal(g.availableCount, 8);
  assert.equal(g.overrunCount, 0);
  assert.equal(g.overbooked, false);
  assert.equal(gaugeFraction(g), "40/40");
});

test("the gauge: one more than fits is overbooked by one", () => {
  const g = gauge(facts(40, 32), 9);
  assert.equal(g.overbooked, true);
  assert.equal(g.overrunCount, 1);
  assert.equal(gaugeFraction(g), "41/40");
});

test("the gauge: maintenance holds count against availability", () => {
  const g = gauge(facts(3, 1, 1), 2);
  assert.equal(g.availableCount, 1);
  assert.equal(g.overrunCount, 1);
  assert.equal(g.overbooked, true);
});

test("the gauge: nothing owned means any request is overbooked", () => {
  const g = gauge(facts(0, 0), 5);
  assert.equal(g.overbooked, true);
  assert.equal(g.overrunCount, 5);
  // The bar still has to draw something rather than divide by zero.
  assert.ok(g.overrunFraction > 0 && g.overrunFraction <= 1);
});

test("the gauge: fractions stay inside the track", () => {
  for (const [owned, booked, requested] of [
    [40, 32, 8],
    [40, 40, 40],
    [40, 0, 400],
    [1, 1, 1],
    [200, 168, 40],
  ]) {
    const g = gauge(facts(owned, booked), requested);
    assert.ok(g.bookedFraction >= 0 && g.bookedFraction <= 1, "booked fraction in range");
    assert.ok(g.requestedFraction >= 0 && g.requestedFraction <= 1, "requested fraction in range");
    assert.ok(g.overrunFraction >= 0 && g.overrunFraction <= 1, "overrun fraction in range");
    assert.ok(
      g.bookedFraction + g.requestedFraction <= 1.0000001,
      "booked plus requested never exceeds the track",
    );
  }
});

test("the gauge: availability can go negative if a count was edited under a booking", () => {
  // A shop retires 10 chairs while 40 are on a confirmed order. The product must
  // show the truth, not clamp it to zero and look fine.
  const g = gauge(facts(30, 40), 0);
  assert.equal(g.availableCount, -10);
  assert.equal(g.overbooked, true);
  assert.equal(g.overrunCount, 10);
});

test("the overbooked sentence always names the conflicting order when there is one", () => {
  const conflict: Conflict = {
    orderId: "o",
    orderNumber: 1043,
    customerName: "Stonewell Chapel",
    quantity: 120,
    outOn: "2026-08-08",
    dueBackOn: "2026-08-09",
  };
  const sentence = overbookedSentence(gauge(facts(200, 168), 40), conflict);
  assert.match(sentence, /#1043/);
  assert.match(sentence, /Stonewell Chapel/);
  assert.match(sentence, /8 over/);
});

test("the overbooked sentence still says something useful with no conflict row", () => {
  const sentence = overbookedSentence(gauge(facts(2, 0), 5), null);
  assert.match(sentence, /White folding chair/);
  assert.match(sentence, /3 over/);
  assert.doesNotMatch(sentence, /#/);
});

test("dailyCommitted flattens overlapping windows into a per-day strip", () => {
  const strip = dailyCommitted(
    [
      { outOn: "2026-08-08", dueBackOn: "2026-08-09", quantity: 120 },
      { outOn: "2026-08-08", dueBackOn: "2026-08-09", quantity: 48 },
      { outOn: "2026-08-10", dueBackOn: "2026-08-12", quantity: 20 },
    ],
    "2026-08-07",
    "2026-08-13",
    addDays,
  );
  assert.deepEqual(strip, [0, 168, 0, 20, 20, 0]);
});
