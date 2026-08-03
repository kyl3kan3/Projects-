/**
 * The belt bar's colour arithmetic and the schedule matcher — the two pure rules
 * that decide what a student sees and what class their tap is recorded against.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  contrastRatio,
  luminance,
  parseHex,
  requirementMath,
  safeBeltHex,
  stripeColorFor,
  STRIPE_DARK,
  STRIPE_LIGHT,
} from "@/lib/belt";
import { nearestSlot, slotLabel, EARLY_WINDOW_MINUTES, LATE_GRACE_MINUTES } from "@/lib/schedule";

describe("belt colours", () => {
  it("puts white tape on a coloured belt and black tape on a white one", () => {
    assert.equal(stripeColorFor("#1C1A18"), STRIPE_LIGHT, "black belt");
    assert.equal(stripeColorFor("#2B4C7E"), STRIPE_LIGHT, "blue belt");
    assert.equal(stripeColorFor("#5A3A22"), STRIPE_LIGHT, "brown belt");
    assert.equal(stripeColorFor("#F2EFE6"), STRIPE_DARK, "white belt");
    assert.equal(stripeColorFor("#D9B233"), STRIPE_DARK, "yellow belt");
  });

  it("always picks the more legible of the two", () => {
    for (const belt of ["#1C1A18", "#2B4C7E", "#F2EFE6", "#D9B233", "#3F6B3A", "#C4622D"]) {
      const chosen = stripeColorFor(belt);
      const other = chosen === STRIPE_LIGHT ? STRIPE_DARK : STRIPE_LIGHT;
      assert.ok(
        contrastRatio(belt, chosen) >= contrastRatio(belt, other),
        `${belt} chose the worse stripe colour`,
      );
      assert.ok(
        contrastRatio(belt, chosen) >= 3,
        `${belt} stripe contrast ${contrastRatio(belt, chosen).toFixed(2)} is below 3:1`,
      );
    }
  });

  it("parses the hex forms a school might type", () => {
    assert.deepEqual(parseHex("#2B4C7E"), { r: 43, g: 76, b: 126 });
    assert.deepEqual(parseHex("2b4c7e"), { r: 43, g: 76, b: 126 });
    assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
    assert.equal(parseHex("blue"), null);
    assert.equal(parseHex("#12345"), null);
  });

  it("falls back to a white belt rather than rendering nothing", () => {
    assert.equal(safeBeltHex(null), "#F2EFE6");
    assert.equal(safeBeltHex("not a colour"), "#F2EFE6");
    assert.equal(safeBeltHex("2B4C7E"), "#2B4C7E");
    assert.equal(safeBeltHex("#2B4C7E"), "#2B4C7E");
  });

  it("computes luminance at the ends of the range", () => {
    assert.equal(Math.round(luminance("#FFFFFF")), 1);
    assert.equal(luminance("#000000"), 0);
  });
});

describe("the requirement math string", () => {
  it("reads the way DESIGN.md specifies", () => {
    assert.equal(
      requirementMath({ classesDone: 18, classesRequired: 24, daysDone: 61, daysRequired: 90 }),
      "18 / 24 classes · 61 / 90 days",
    );
  });

  it("drops a requirement the curriculum does not set", () => {
    assert.equal(
      requirementMath({ classesDone: 18, classesRequired: 24, daysDone: 61, daysRequired: 0 }),
      "18 / 24 classes",
    );
    assert.equal(
      requirementMath({ classesDone: 4, classesRequired: 0, daysDone: 10, daysRequired: 0 }),
      "4 classes",
    );
  });
});

describe("which class a check-in belongs to", () => {
  const slots = [
    { id: "kids", weekday: 2, startsAtMinutes: 17 * 60, durationMinutes: 45 },
    { id: "adults6", weekday: 2, startsAtMinutes: 18 * 60, durationMinutes: 60 },
    { id: "adults7", weekday: 2, startsAtMinutes: 19 * 60, durationMinutes: 60 },
    { id: "saturday", weekday: 6, startsAtMinutes: 10 * 60, durationMinutes: 90 },
  ];

  it("matches the class a student arrives just before", () => {
    assert.equal(nearestSlot(slots, { weekday: 2, minutes: 17 * 60 + 52 })?.id, "adults6");
  });

  it("still matches when they arrive late, inside the grace window", () => {
    const late = 19 * 60 + 60 + LATE_GRACE_MINUTES - 1; // just before 8:19pm close
    assert.equal(nearestSlot(slots, { weekday: 2, minutes: late })?.id, "adults7");
  });

  it("sends a mid-class arrival to the class that is actually running", () => {
    assert.equal(nearestSlot(slots, { weekday: 2, minutes: 18 * 60 + 40 })?.id, "adults6");
  });

  it("returns nothing — an open mat — outside every window", () => {
    assert.equal(nearestSlot(slots, { weekday: 2, minutes: 14 * 60 }), null);
    assert.equal(
      nearestSlot(slots, { weekday: 2, minutes: 17 * 60 - EARLY_WINDOW_MINUTES - 1 }),
      null,
    );
  });

  it("never matches a class on a different day", () => {
    assert.equal(nearestSlot(slots, { weekday: 3, minutes: 18 * 60 }), null);
    assert.equal(nearestSlot(slots, { weekday: 6, minutes: 10 * 60 + 5 })?.id, "saturday");
  });

  it("prefers the class in session over a nearer one that has not started", () => {
    // 18:30 is equidistant from the 18:00 and 19:00 starts, and 18:40 is nearer
    // to 19:00 — but the 18:00 class is the one on the mat.
    assert.equal(nearestSlot(slots, { weekday: 2, minutes: 18 * 60 + 30 })?.id, "adults6");
    assert.equal(nearestSlot(slots, { weekday: 2, minutes: 18 * 60 + 40 })?.id, "adults6");
    // Once the 18:00 class has finished, the 19:00 one takes over.
    assert.equal(nearestSlot(slots, { weekday: 2, minutes: 19 * 60 + 5 })?.id, "adults7");
  });

  it("labels a slot the way the kiosk chip row shows it", () => {
    assert.equal(
      slotLabel({ name: "Adults Gi", weekday: 2, startsAtMinutes: 18 * 60 }),
      "Adults Gi · Tue 6:00pm",
    );
  });
});
