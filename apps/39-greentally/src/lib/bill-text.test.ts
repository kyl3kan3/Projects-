import test from "node:test";
import assert from "node:assert/strict";
import {
  slashOrder,
  parseBillDate,
  readBillText,
  readPeriod,
  readProvider,
  readQuantity,
  readingIsUsable,
} from "./bill-text";

const CONED = `Consolidated Edison Company of New York, Inc.
4 Irving Place, New York, NY 10003

Account number 61-3384-1129-0002-7
Service Address: 118 Meserole Ave, Brooklyn NY 11222

Service Period: Mar 1, 2025 - Mar 31, 2025
Rate: EL2 Commercial

Total kWh used 4,182
Delivery charges $612.44
Supply charges $381.09
Total amount due $993.53`;

const NATIONAL_GRID_GAS = `National Grid
Gas bill for business

Billing Period 11/01/2025 to 11/30/2025
Meter number 003491124

Gas used 812 therms
Distribution adjustment $88.11
Total $1,204.66`;

test("a labelled electricity bill reads at high confidence", () => {
  const r = readBillText(CONED);
  assert.equal(r.provider?.value, "Consolidated Edison");
  assert.equal(r.category?.value, "electricity_kwh");
  assert.equal(r.quantity?.value.quantity, 4182);
  assert.equal(r.quantity?.value.unit, "kWh");
  assert.deepEqual(r.period?.value, { start: "2025-03-01", end: "2025-03-31" });
  assert.equal(r.serviceAddress, "118 Meserole Ave, Brooklyn NY 11222");
  assert.ok(r.quantity!.confidenceBp >= 9_500);
  assert.ok(readingIsUsable(r));
});

test("a gas bill in therms reads as natural gas, not electricity", () => {
  const r = readBillText(NATIONAL_GRID_GAS);
  assert.equal(r.provider?.value, "National Grid");
  assert.equal(r.category?.value, "natural_gas_kwh");
  assert.equal(r.quantity?.value.quantity, 812);
  assert.equal(r.quantity?.value.unit, "therms");
  assert.deepEqual(r.period?.value, { start: "2025-11-01", end: "2025-11-30" });
});

test("a rate line is not mistaken for a quantity", () => {
  const q = readQuantity("Energy charge 0.1183 per kWh\nTotal kWh used 2,940");
  assert.equal(q?.field.value.quantity, 2940);
});

test("an unreadable quantity is null, never a guess", () => {
  const r = readBillText("Con Edison\nService Period: Mar 1, 2025 - Mar 31, 2025\nAmount due $993.53");
  assert.equal(r.quantity, null);
  assert.equal(readingIsUsable(r), false);
});

test("an unreadable period is null, never today's date", () => {
  const r = readBillText("Con Edison\nTotal kWh used 4,182");
  assert.equal(r.period, null);
  assert.equal(readingIsUsable(r), false);
});

test("dates parse in the shapes bills actually print", () => {
  assert.equal(parseBillDate("2025-03-01")?.iso, "2025-03-01");
  assert.equal(parseBillDate("Mar 1, 2025")?.iso, "2025-03-01");
  assert.equal(parseBillDate("1 March 2025")?.iso, "2025-03-01");
  assert.equal(parseBillDate("03/31/2025")?.iso, "2025-03-31");
  assert.equal(parseBillDate("31/03/2025")?.iso, "2025-03-31");
  assert.equal(parseBillDate("03/01/25")?.iso, "2025-03-01");
});

test("an ambiguous slashed date is flagged so a human decides", () => {
  const d = parseBillDate("03/04/2025");
  assert.equal(d?.iso, "2025-03-04");
  assert.equal(d?.ambiguous, true);
  const p = readPeriod("Service Period: 03/04/2025 - 04/03/2025");
  assert.ok(p!.confidenceBp <= 6_400, "ambiguous dates must not read as certain");
});

test("an impossible date is rejected outright", () => {
  assert.equal(parseBillDate("02/30/2025"), null);
  assert.equal(parseBillDate("2025-13-01"), null);
  assert.equal(parseBillDate("gibberish"), null);
});

test("a period that ends before it starts is rejected", () => {
  assert.equal(readPeriod("Service Period: Mar 31, 2025 - Mar 1, 2025"), null);
});

test("an unknown provider is read at review-level confidence", () => {
  const p = readProvider("Cedar Falls Municipal Utilities\nTotal kWh used 100");
  assert.equal(p?.value, "Cedar Falls Municipal Utilities");
  assert.ok(p!.confidenceBp < 7_000, "an unrecognised provider must reach a human");
});

test("a fuel receipt reads litres or gallons and the fuel type", () => {
  const r = readBillText(
    `Shell Fleet Card
Statement period: Jun 1, 2025 - Jun 30, 2025
Diesel
Total gallons 486.4
Total $1,842.19`,
  );
  assert.equal(r.category?.value, "diesel_l");
  assert.equal(r.quantity?.value.quantity, 486.4);
  assert.equal(r.quantity?.value.unit, "US gal");
});

test("a CCF gas bill reads CCF, which the converter then treats as 1.037 therms", () => {
  const r = readBillText(
    `Southwest Gas
Service Period: Jan 1, 2025 - Jan 31, 2025
CCF used 1,240`,
  );
  assert.equal(r.quantity?.value.unit, "CCF");
  assert.equal(r.category?.value, "natural_gas_kwh");
});

test("a slashed range disambiguates itself from its unambiguous endpoint", () => {
  // 08/31 cannot be a month, so 08/01 is August 1 and not January 8.
  const p = readPeriod("Billing Period 08/01/2025 to 08/31/2025")!;
  assert.deepEqual(p.value, { start: "2025-08-01", end: "2025-08-31" });
  assert.ok(p.confidenceBp >= 9_500, "a self-disambiguating range is not a review item");

  // And the other way round: a day-first range stays day-first.
  const uk = readPeriod("Billing Period 31/08/2025 to 05/09/2025")!;
  assert.deepEqual(uk.value, { start: "2025-08-31", end: "2025-09-05" });
});

test("a range that disambiguates nothing is still flagged", () => {
  const p = readPeriod("Service Period: 03/04/2025 - 04/03/2025")!;
  assert.ok(p.confidenceBp <= 6_400, "genuinely ambiguous dates reach a human");
});

test("slashOrder only claims an order the digits prove", () => {
  assert.equal(slashOrder("08/31/2025"), "mdy");
  assert.equal(slashOrder("31/08/2025"), "dmy");
  assert.equal(slashOrder("03/04/2025"), null);
  assert.equal(slashOrder("Mar 4, 2025"), null);
});
