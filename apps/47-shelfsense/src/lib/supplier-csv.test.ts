/**
 * Supplier CSV import.
 *
 * The file this parses comes out of the spreadsheet the product is replacing, which
 * means it arrives with a BOM, CRLF endings, `$1,299.00`, a header row in whatever
 * order the merchant likes, and at least one SKU that no longer exists. All of that
 * has to work, and the row it cannot place has to be *reported* — a silently skipped
 * row is a lead time the merchant believes they set and did not.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moneyToCents, parseCsv, parseSupplierCsv } from "@/lib/supplier-csv";

describe("parseCsv", () => {
  it("handles quoted fields, doubled quotes, CRLF and a BOM", () => {
    const text = '﻿a,b\r\n"one, two","say ""hi"""\r\n';
    assert.deepEqual(parseCsv(text), [
      ["a", "b"],
      ["one, two", 'say "hi"'],
    ]);
  });

  it("handles LF-only files, which is what a Mac export looks like", () => {
    assert.deepEqual(parseCsv("a,b\n1,2\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops entirely blank rows without dropping rows that are merely sparse", () => {
    assert.deepEqual(parseCsv("a,b\n\n1,\n"), [
      ["a", "b"],
      ["1", ""],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    assert.deepEqual(parseCsv('a\n"line one\nline two"\n'), [["a"], ["line one\nline two"]]);
  });
});

describe("moneyToCents", () => {
  it("strips currency symbols and thousands separators", () => {
    assert.equal(moneyToCents("$1,299.00"), 129_900);
    assert.equal(moneyToCents("8.90"), 890);
    assert.equal(moneyToCents("59"), 5900);
    assert.equal(moneyToCents(" 12.5 "), 1250);
  });

  it("is null for anything that is not a number, rather than zero", () => {
    // Zero would be a cost of nothing, which is a very different claim than the
    // merchant not having filled this in.
    assert.equal(moneyToCents(""), null);
    assert.equal(moneyToCents("ask"), null);
    assert.equal(moneyToCents("-"), null);
  });
});

describe("parseSupplierCsv", () => {
  it("reads a well-formed file in any column order", () => {
    const text = [
      "Pack size,SKU,Lead time days,Supplier,Unit cost,MOQ,Supplier email,Min order value",
      "24,OAK-SACH-06,18,Apex Goods Co.,8.90,100,orders@apexgoods.example,$500.00",
      "10,OAK-BLKT-07,34,Northbay Textiles,59.00,40,po@northbaytextiles.example,\"$1,200.00\"",
    ].join("\r\n");

    const result = parseSupplierCsv(text);
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows[0], {
      line: 2,
      sku: "OAK-SACH-06",
      supplierName: "Apex Goods Co.",
      supplierEmail: "orders@apexgoods.example",
      leadTimeDays: 18,
      minOrderValueCents: 50_000,
      costCents: 890,
      moq: 100,
      packSize: 24,
    });
    assert.equal(result.rows[1].leadTimeDays, 34);
    assert.equal(result.rows[1].minOrderValueCents, 120_000);
  });

  it("accepts the header aliases a real spreadsheet uses", () => {
    const result = parseSupplierCsv("Variant SKU,Vendor,Leadtime,Cost per unit\nA-1,Kettle,7,15.50");
    assert.equal(result.rows[0].sku, "A-1");
    assert.equal(result.rows[0].supplierName, "Kettle");
    assert.equal(result.rows[0].leadTimeDays, 7);
    assert.equal(result.rows[0].costCents, 1550);
  });

  it("is case-insensitive about headers and lists what it ignored", () => {
    const result = parseSupplierCsv("sku,SUPPLIER,Barcode\nA-1,Kettle,0123456");
    assert.equal(result.rows.length, 1);
    assert.ok(result.recognised.includes("sku"));
    assert.deepEqual(result.ignored, ["barcode"]);
  });

  it("refuses a file with no SKU column and says what it did find", () => {
    const result = parseSupplierCsv("Product,Lead time\nSachets,18");
    assert.deepEqual(result.rows, []);
    assert.match(result.errors[0], /No SKU column found/);
    assert.match(result.errors[0], /product, lead time/);
  });

  it("reports an unparseable lead time by line number instead of guessing", () => {
    const result = parseSupplierCsv("SKU,Lead time days\nA-1,about a month");
    assert.equal(result.rows[0].leadTimeDays, null);
    assert.ok(result.errors.some((e) => /Line 2: lead time "about a month"/.test(e)));
  });

  it("rejects an out-of-range lead time rather than storing 4,000 days", () => {
    const result = parseSupplierCsv("SKU,Lead time days\nA-1,4000");
    assert.equal(result.rows[0].leadTimeDays, null);
    assert.ok(result.errors.some((e) => /outside 0-365 days/.test(e)));
  });

  it("reports a row with no SKU rather than attaching it to nothing", () => {
    const result = parseSupplierCsv("SKU,Supplier\n,Apex\nA-1,Apex");
    assert.equal(result.rows.length, 1);
    assert.ok(result.errors.some((e) => /Line 2: no SKU/.test(e)));
  });

  it("warns about a duplicated SKU and keeps the last row", () => {
    const result = parseSupplierCsv("SKU,Lead time days\nA-1,7\nA-1,21");
    assert.equal(result.rows.length, 2);
    assert.ok(result.errors.some((e) => /appears more than once/.test(e)));
    assert.equal(result.rows[1].leadTimeDays, 21);
  });

  it("leaves a column the file did not carry as null, so nothing is overwritten", () => {
    const result = parseSupplierCsv("SKU,Lead time days\nA-1,7");
    assert.equal(result.rows[0].costCents, null);
    assert.equal(result.rows[0].moq, null);
    assert.equal(result.rows[0].packSize, null);
    assert.equal(result.rows[0].supplierName, null);
  });

  it("reports an empty file rather than throwing", () => {
    assert.match(parseSupplierCsv("").errors[0], /no rows/);
  });
});
