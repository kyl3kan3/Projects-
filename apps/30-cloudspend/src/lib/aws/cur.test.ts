import assert from "node:assert/strict";
import test from "node:test";
import { parseCur, splitCsvLine } from "./cur";

const HEADER = [
  "identity/LineItemId",
  "lineItem/UsageAccountId",
  "lineItem/UsageStartDate",
  "product/ProductName",
  "product/region",
  "lineItem/UsageType",
  "lineItem/ResourceId",
  "lineItem/UnblendedCost",
  "resourceTags/user:Team",
].join(",");

test("quoted fields and escaped quotes survive the splitter", () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ["a", "b,c", "d"]);
  assert.deepEqual(splitCsvLine('"say ""hi""",x'), ['say "hi"', "x"]);
  assert.deepEqual(splitCsvLine("a,,c"), ["a", "", "c"]);
});

test("a product name containing a comma does not shift every later column", () => {
  const csv = [
    HEADER,
    `1,481029384756,2026-07-14T14:00:00Z,"Amazon EC2, Compute",us-east-1,BoxUsage:m6i.large,i-abc,1.25,api`,
  ].join("\n");
  const out = parseCur(csv);
  assert.equal(out.lines.length, 1);
  assert.equal(out.lines[0].service, "Amazon EC2, Compute");
  assert.equal(out.lines[0].usageType, "BoxUsage:m6i.large");
  assert.equal(out.lines[0].amountMicros, 1_250_000);
  assert.deepEqual(out.lines[0].tags, { Team: "api" });
});

test("columns are resolved by name, so report column order does not matter", () => {
  const reordered = [
    "lineItem/UnblendedCost,lineItem/UsageStartDate,product/ProductName",
    "0.00219,2026-07-14T14:31:00Z,Amazon EBS",
  ].join("\n");
  const out = parseCur(reordered);
  assert.equal(out.lines[0].amountMicros, 2190);
  assert.equal(out.lines[0].service, "Amazon EBS");
});

test("usage timestamps are floored to the hour grain", () => {
  const csv = [
    HEADER,
    `1,4,2026-07-14T14:47:59Z,Amazon EC2,us-east-1,BoxUsage,i-a,1.00,api`,
    `2,4,2026-07-14T14:03:00Z,Amazon EC2,us-east-1,BoxUsage,i-a,2.00,api`,
  ].join("\n");
  const out = parseCur(csv);
  // Same hour, same resource, same usage type: one line, summed.
  assert.equal(out.lines.length, 1);
  assert.equal(out.lines[0].ts.toISOString(), "2026-07-14T14:00:00.000Z");
  assert.equal(out.lines[0].amountMicros, 3_000_000);
  assert.equal(out.rowsKept, 2);
});

test("different resources at the same hour stay separate — that is CUR's depth", () => {
  const csv = [
    HEADER,
    `1,4,2026-07-14T14:00:00Z,Amazon EC2,us-east-1,BoxUsage,i-a,1.00,api`,
    `2,4,2026-07-14T14:00:00Z,Amazon EC2,us-east-1,BoxUsage,i-b,1.00,api`,
  ].join("\n");
  const out = parseCur(csv);
  assert.equal(out.lines.length, 2);
});

test("a missing required column fails loudly instead of importing zeros", () => {
  const csv = ["lineItem/UsageStartDate,product/ProductName", "2026-07-14T14:00:00Z,Amazon EC2"].join(
    "\n",
  );
  assert.throws(() => parseCur(csv), /missing required column/i);
  assert.throws(() => parseCur(""), /empty/i);
});

test("unparseable rows are reported, not silently dropped", () => {
  const csv = [
    HEADER,
    `1,4,not-a-date,Amazon EC2,us-east-1,BoxUsage,i-a,1.00,api`,
    `2,4,2026-07-14T14:00:00Z,Amazon EC2,us-east-1,BoxUsage,i-a,not-a-number,api`,
    `3,4,2026-07-14T15:00:00Z,Amazon EC2,us-east-1,BoxUsage,i-a,1.00,api`,
  ].join("\n");
  const out = parseCur(csv);
  assert.equal(out.rowsRead, 3);
  assert.equal(out.lines.length, 1);
  assert.equal(out.skipped.length, 2);
  assert.match(out.skipped[0].reason, /usage start/);
  assert.match(out.skipped[1].reason, /cost/);
});

test("zero-cost rows are dropped but negative credits are kept", () => {
  const csv = [
    HEADER,
    `1,4,2026-07-14T14:00:00Z,Amazon EC2,us-east-1,BoxUsage,i-a,0,api`,
    `2,4,2026-07-14T14:00:00Z,AWS Credit,us-east-1,Credit,,-5.00,api`,
  ].join("\n");
  const out = parseCur(csv);
  assert.equal(out.lines.length, 1);
  assert.equal(out.lines[0].amountMicros, -5_000_000);
});

test("coverage spans whole hours, so the caller knows what to replace", () => {
  const csv = [
    HEADER,
    `1,4,2026-07-14T00:30:00Z,Amazon EC2,us-east-1,BoxUsage,i-a,1.00,api`,
    `2,4,2026-07-14T23:10:00Z,Amazon EC2,us-east-1,BoxUsage,i-a,1.00,api`,
  ].join("\n");
  const out = parseCur(csv);
  assert.equal(out.coverage?.start.toISOString(), "2026-07-14T00:00:00.000Z");
  assert.equal(out.coverage?.end.toISOString(), "2026-07-15T00:00:00.000Z");
});

test("an untagged row carries no tags rather than an empty-string tag", () => {
  const csv = [HEADER, `1,4,2026-07-14T14:00:00Z,Amazon S3,us-east-1,Storage,,0.50,`].join("\n");
  const out = parseCur(csv);
  assert.equal(out.lines[0].tags, undefined);
  assert.equal(out.lines[0].resourceId, null);
});
