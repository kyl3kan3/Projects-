/**
 * `accounts.settings` is jsonb, so every read has to survive a row written by an
 * older version of the app — or by a fat-fingered SQL update.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { winAnsi } from "@/lib/contracts";
import { DEFAULT_SETTINGS, mergeSettings, parseDamageFees, parseSettings } from "@/lib/settings";
import { formatWindow } from "@/lib/dates";

test("an empty blob parses to the documented defaults", () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(undefined), DEFAULT_SETTINGS);
});

test("garbage in a field falls back to that field's default, not to a crash", () => {
  const settings = parseSettings({
    depositPercentBps: "twenty five percent",
    taxRateBps: 825,
    terms: 42,
    damageFeeDefaults: "nope",
  });
  assert.equal(settings.depositPercentBps, DEFAULT_SETTINGS.depositPercentBps);
  assert.equal(settings.taxRateBps, 825);
  assert.equal(settings.terms, DEFAULT_SETTINGS.terms);
  assert.deepEqual(settings.damageFeeDefaults, []);
});

test("a blank terms string falls back rather than printing an empty contract", () => {
  assert.equal(parseSettings({ terms: "   " }).terms, DEFAULT_SETTINGS.terms);
});

test("fee rows without a label or with a negative amount are dropped", () => {
  const fees = parseDamageFees([
    { label: "Torn seat", amountCents: 1_500 },
    { label: "  ", amountCents: 900 },
    { label: "Negative", amountCents: -100 },
    { label: "Free fix", amountCents: 0 },
    "not an object",
    null,
  ]);
  assert.deepEqual(fees, [
    { label: "Torn seat", amountCents: 1_500 },
    { label: "Free fix", amountCents: 0 },
  ]);
});

test("merge keeps unspecified fields", () => {
  const merged = mergeSettings({ taxRateBps: 625, terms: "Our own terms." }, { taxRateBps: 825 });
  assert.equal(merged.taxRateBps, 825);
  assert.equal(merged.terms, "Our own terms.");
});

/* ------------------------------------------------------------ PDF safety --- */

test("winAnsi maps the characters pdf-lib would throw on", () => {
  // This is not decoration: `drawText` throws `WinAnsi cannot encode "→"`, and the
  // arrow comes straight out of formatWindow, which every contract prints.
  assert.equal(winAnsi("SAT AUG 8 → SUN AUG 9"), "SAT AUG 8 -> SUN AUG 9");
  assert.equal(winAnsi("40 × chair"), "40 x chair");
  assert.equal(winAnsi("RENTAL AGREEMENT — ORDER #1043"), "RENTAL AGREEMENT - ORDER #1043");
  assert.equal(winAnsi("don’t"), "don't");
  assert.equal(winAnsi("“quoted”"), '"quoted"');
  assert.equal(winAnsi("a · b"), "a - b");
});

test("winAnsi drops anything still outside Latin-1 rather than throwing", () => {
  assert.equal(winAnsi("chair \u{1F642} here"), "chair  here");
  assert.equal(winAnsi("✓ done"), " done");
});

test("winAnsi keeps the Latin-1 characters a Texas address might carry", () => {
  assert.equal(winAnsi("Café Peñasco"), "Café Peñasco");
  assert.equal(winAnsi("$1,845.00"), "$1,845.00");
});

test("every string a contract prints survives the encoder", () => {
  const printed = [
    formatWindow("2026-08-08", "2026-08-09"),
    DEFAULT_SETTINGS.terms,
    DEFAULT_SETTINGS.damageClause,
    "40 × White folding chair",
  ];
  for (const value of printed) {
    // Latin-1 printable only, once sanitised — which is exactly what pdf-lib
    // accepts.
    assert.doesNotMatch(winAnsi(value), /[^\x20-\x7E\xA1-\xFF\n]/u, value.slice(0, 40));
  }
});
