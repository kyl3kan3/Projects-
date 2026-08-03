import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  duration,
  joinParts,
  money,
  moneyParts,
  moneyShort,
  moneySigned,
  normalizeHandle,
  normalizePhone,
  phoneDisplay,
  phoneHref,
} from "@/lib/format";

test("money is exact to the cent, always two places", () => {
  assert.equal(money(2250), "$22.50");
  assert.equal(money(0), "$0.00");
  assert.equal(money(5), "$0.05");
  assert.equal(money(-1250), "-$12.50");
  assert.equal(money(123_456_789), "$1,234,567.89");
});

test("service prices drop the cents only when they are zero", () => {
  assert.equal(moneyShort(4500), "$45");
  assert.equal(moneyShort(4550), "$45.50");
  assert.equal(moneySigned(2250), "+$22.50");
  assert.equal(moneySigned(-500), "-$5.00");
});

test("the hero stat splits so cents can render at 60%", () => {
  assert.deepEqual(moneyParts(21_250), { whole: "$212", fraction: ".50" });
  assert.deepEqual(moneyParts(0), { whole: "$0", fraction: ".00" });
  assert.deepEqual(moneyParts(100_000), { whole: "$1,000", fraction: ".00" });
});

test("durations read the way a stylist writes them", () => {
  assert.equal(duration(45), "45 min");
  assert.equal(duration(60), "1h");
  assert.equal(duration(75), "1h 15m");
  assert.equal(duration(180), "3h");
});

test("phone normalisation makes one client one row", () => {
  // The unique index is (stylist_id, phone), so all of these must collapse.
  for (const raw of [
    "5125550147",
    "512-555-0147",
    "(512) 555-0147",
    "512.555.0147",
    "+1 512 555 0147",
    "15125550147",
  ]) {
    assert.equal(normalizePhone(raw), "+15125550147", raw);
  }
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizePhone("12"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("not a phone"), null);
});

test("phones display and dial", () => {
  assert.equal(phoneDisplay("+15125550147"), "(512) 555-0147");
  assert.equal(phoneDisplay("5125550147"), "(512) 555-0147");
  assert.equal(phoneDisplay("+442079460958"), "+442079460958");
  assert.equal(phoneDisplay(null), "");
  assert.equal(phoneHref("5125550147"), "tel:+15125550147");
});

test("handles become URL-safe slugs or are refused", () => {
  assert.equal(normalizeHandle("@DeeCuts"), "deecuts");
  assert.equal(normalizeHandle("Marcus  Fades"), "marcus-fades");
  assert.equal(normalizeHandle("  dee_the_barber "), "dee-the-barber");
  assert.equal(normalizeHandle("ab"), null, "too short to be a front door");
  assert.equal(normalizeHandle("!!"), null);
  assert.equal(normalizeHandle("a".repeat(31)), null);
});

test("joinParts skips the parts that would read as zeros", () => {
  assert.equal(joinParts(["3 fees", null, "1 waived"]), "3 fees · 1 waived");
  assert.equal(joinParts([null, null]), "");
});
