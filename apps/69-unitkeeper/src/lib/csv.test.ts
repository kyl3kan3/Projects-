import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, csvMoney, toCsv } from "@/lib/csv";

test("fields that would break a CSV are quoted", () => {
  assert.equal(csvCell("B-14"), "B-14");
  assert.equal(csvCell("Ortega, Marisol"), '"Ortega, Marisol"');
  assert.equal(csvCell('He said "no"'), '"He said ""no"""');
  assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
  assert.equal(csvCell(" padded "), '" padded "');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(0), "0");
});

test("a formula in a unit note stays text in Excel", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+SUM(A1)"), "'+SUM(A1)");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@import"), "'@import");
});

test("toCsv writes CRLF rows for the Windows keypad importers", () => {
  const out = toCsv(["unit", "code"], [["B-14", "40318"]]);
  assert.equal(out, "unit,code\r\nB-14,40318\r\n");
});

test("money in a CSV is a plain decimal a spreadsheet will total", () => {
  assert.equal(csvMoney(12900), "129.00");
  assert.equal(csvMoney(-2005), "-20.05");
  assert.equal(csvMoney(5), "0.05");
  assert.equal(csvMoney(0), "0.00");
});
