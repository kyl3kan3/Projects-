import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FUZZY_THRESHOLD_BP,
  matchRateBp,
  matchRows,
  normaliseName,
  parseSalesCsv,
  similarityBp,
  sniffFormat,
} from "./pos-import";
import { parseMoneyToCents, parseQty } from "./format";

/**
 * Fixture: Toast "Sales by Menu Item". Real exports carry group/category columns
 * either side of the numbers, quoted names with commas, and a trailing total row.
 */
const TOAST_CSV = `﻿Menu Item,Menu Group,Sales Category,Item Quantity,Gross Amount,Discount Amount,Net Amount
Crispy Half Chicken,Mains,Food,80,"$1,920.00",$0.00,"$1,920.00"
Grilled Swordfish,Mains,Food,40,"$1,280.00",$0.00,"$1,280.00"
"Burrata, grilled peach",Starters,Food,50,$800.00,$0.00,$800.00
Shrimp Toast,Starters,Food,30,$420.00,$0.00,$420.00
Totals,,,200,"$4,420.00",$0.00,"$4,420.00"
`;

/** Fixture: Square "Item Sales" — two preamble lines before the header. */
const SQUARE_CSV = `Item Sales
Mar 1 2026 - Mar 31 2026
Item Name,Category,Items Sold,Gross Sales,Discounts,Net Sales
Crispy Half Chicken,Mains,80,$1920.00,$0.00,$1920.00
Grilled Swordfish,Mains,40,$1280.00,$0.00,$1280.00
Burrata,Starters,50,$800.00,$0.00,$800.00
Shrimp Toast,Starters,30,$420.00,$0.00,$420.00
`;

test("sniffs a Toast export", () => {
  const s = sniffFormat([
    "Menu Item",
    "Menu Group",
    "Sales Category",
    "Item Quantity",
    "Gross Amount",
    "Net Amount",
  ]);
  assert.equal(s?.source, "toast");
  assert.deepEqual(s?.mapping, { name: "Menu Item", qty: "Item Quantity", net: "Net Amount" });
});

test("sniffs a Square export", () => {
  const s = sniffFormat(["Item Name", "Category", "Items Sold", "Gross Sales", "Net Sales"]);
  assert.equal(s?.source, "square");
  assert.deepEqual(s?.mapping, { name: "Item Name", qty: "Items Sold", net: "Net Sales" });
});

test("Toast fixture parses with BOM, currency, thousands separators and a totals row", () => {
  const r = parseSalesCsv(TOAST_CSV);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.source, "toast");
  assert.equal(r.rows.length, 4, "the Totals row is dropped, not counted as a dish");
  const chicken = r.rows.find((row) => row.name === "Crispy Half Chicken")!;
  assert.equal(chicken.qty, 80);
  assert.equal(chicken.netCents, 192000);
  assert.ok(r.rows.some((row) => row.name === "Burrata, grilled peach"), "quoted commas survive");
  assert.equal(r.issues.length, 0);
});

test("Square fixture parses past its report-title preamble", () => {
  const r = parseSalesCsv(SQUARE_CSV);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.source, "square");
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows[0].netCents, 192000);
});

test("the same item on several rows is summed, not overwritten", () => {
  const csv = `Menu Item,Item Quantity,Net Amount
Crispy Half Chicken,12,$288.00
Crispy Half Chicken,8,$192.00
crispy half chicken,5,$120.00
`;
  const r = parseSalesCsv(csv);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].qty, 25);
  assert.equal(r.rows[0].netCents, 60000);
});

test("an unknown export asks for a mapping and names the columns it found", () => {
  const csv = `Dish,Covers,Revenue
Chicken,80,1920.00
`;
  const r = parseSalesCsv(csv);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.kind, "needs_mapping");
  assert.match(r.message, /Dish, Covers, Revenue/);
  assert.deepEqual(r.headers, ["Dish", "Covers", "Revenue"]);
  assert.equal(r.sample.length, 1);
});

test("an owner-supplied mapping unlocks an unknown export", () => {
  const csv = `Dish,Covers,Revenue
Crispy Half Chicken,80,"1,920.00"
Grilled Swordfish,40,1280.00
`;
  const r = parseSalesCsv(csv, { mapping: { name: "Dish", qty: "Covers", net: "Revenue" } });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.source, "other");
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].netCents, 192000);
});

test("a mapping naming a column that isn't there says which one", () => {
  const csv = `Dish,Covers,Revenue
Chicken,80,1920.00
`;
  const r = parseSalesCsv(csv, { mapping: { name: "Dish", qty: "Quantity", net: "Revenue" } });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.message, /Column Quantity is not in this file/);
});

test("a bad number is an issue naming the row and column, not a silent zero", () => {
  const csv = `Menu Item,Item Quantity,Net Amount
Crispy Half Chicken,80,$1920.00
Grilled Swordfish,n/a,$1280.00
`;
  const r = parseSalesCsv(csv);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].row, 3);
  assert.match(r.issues[0].message, /Grilled Swordfish.*Item Quantity is not a number/);
});

test("an empty file and a header-only file both fail with something to act on", () => {
  const empty = parseSalesCsv("   ");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.message, /empty/);

  const headerOnly = parseSalesCsv("Menu Item,Item Quantity,Net Amount\n");
  assert.equal(headerOnly.ok, false);
  if (!headerOnly.ok) assert.match(headerOnly.message, /no usable rows/);
});

test("the row cap is reported rather than silently truncating", () => {
  const lines = ["Menu Item,Item Quantity,Net Amount"];
  for (let i = 0; i < 12; i++) lines.push(`Dish ${i},2,$10.00`);
  const r = parseSalesCsv(lines.join("\n"), { maxRows: 5 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.rows.length, 5);
  assert.match(r.issues.at(-1)!.message, /only the first 5 were read/);
});

test("money parsing survives what POS exports actually emit", () => {
  assert.equal(parseMoneyToCents("$1,920.00"), 192000);
  assert.equal(parseMoneyToCents("1920"), 192000);
  assert.equal(parseMoneyToCents("(12.50)"), -1250);
  assert.equal(parseMoneyToCents("-12.50"), -1250);
  assert.equal(parseMoneyToCents("€1.234,50"), 123450);
  assert.equal(parseMoneyToCents("24,50"), 2450);
  assert.equal(parseMoneyToCents("1,234"), 123400);
  assert.equal(parseMoneyToCents(""), null);
  assert.equal(parseMoneyToCents("n/a"), null);
  assert.equal(parseQty("1,204"), 1204);
  assert.equal(parseQty("12.0"), 12);
  assert.equal(parseQty("abc"), null);
});

test("normalisation folds the noise POS exports add", () => {
  assert.equal(normaliseName("The Crispy Half-Chicken"), "crispy chicken");
  assert.equal(normaliseName("Burrata (Large)"), "burrata");
  assert.equal(normaliseName("Mac & Cheese"), "mac and cheese");
  assert.equal(normaliseName("Café Crème"), "cafe creme");
});

test("matching: exact, normalised, fuzzy, and honest failure", () => {
  const candidates = [
    { itemId: "1", name: "Crispy Half Chicken" },
    { itemId: "2", name: "Grilled Swordfish" },
    { itemId: "3", name: "Burrata" },
    { itemId: "4", name: "Mac & Cheese" },
  ];
  const outcome = matchRows(
    [
      { name: "Crispy Half Chicken", qty: 80, netCents: 192000 },
      { name: "the grilled swordfish", qty: 40, netCents: 128000 },
      { name: "Burata", qty: 50, netCents: 80000 },
      { name: "Mac and Cheese", qty: 20, netCents: 24000 },
      { name: "Gift Card", qty: 3, netCents: 15000 },
    ],
    candidates,
  );

  const kinds = Object.fromEntries(outcome.matched.map((m) => [m.itemId, m.kind]));
  assert.equal(kinds["1"], "exact");
  assert.equal(kinds["2"], "normalized");
  assert.equal(kinds["3"], "fuzzy", "Burata -> Burrata is one transposition away");
  assert.equal(kinds["4"], "normalized");
  assert.equal(outcome.unmatched.length, 1);
  assert.equal(outcome.unmatched[0].name, "Gift Card");
  assert.equal(matchRateBp(outcome), 8000);
});

test("a genuinely different dish is left unmatched rather than guessed", () => {
  const outcome = matchRows(
    [{ name: "Bottled Water", qty: 90, netCents: 27000 }],
    [{ itemId: "1", name: "Crispy Half Chicken" }],
  );
  assert.equal(outcome.matched.length, 0);
  assert.equal(outcome.unmatched.length, 1);
  assert.ok(similarityBp(normaliseName("Bottled Water"), normaliseName("Crispy Half Chicken")) < FUZZY_THRESHOLD_BP);
});

test("two rows cannot both claim the same menu item", () => {
  const outcome = matchRows(
    [
      { name: "Crispy Half Chicken", qty: 80, netCents: 192000 },
      { name: "Crispy Half Chickn", qty: 4, netCents: 9600 },
    ],
    [{ itemId: "1", name: "Crispy Half Chicken" }],
  );
  assert.equal(outcome.matched.length, 1);
  assert.equal(outcome.matched[0].kind, "exact");
  assert.equal(outcome.matched[0].row.qty, 80);
  assert.equal(outcome.unmatched.length, 1, "the weaker claim is reported, not merged");
});

test("similarity is symmetric and bounded", () => {
  assert.equal(similarityBp("burrata", "burrata"), 10000);
  assert.equal(similarityBp("", "burrata"), 0);
  assert.equal(similarityBp("burrata", "burata"), similarityBp("burata", "burrata"));
});
