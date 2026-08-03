import assert from "node:assert/strict";
import { test } from "node:test";
import {
  csvCell,
  descriptionFor,
  sourcePathFor,
  toGenericCsv,
  toQboCsv,
  toXeroCsv,
  type ExportRow,
} from "./exports";

const ROWS: ExportRow[] = [
  {
    docDate: "2026-03-12",
    vendor: 'The Home Depot #4412 "Pro Desk"',
    category: "Supplies",
    scheduleCLine: "22",
    memo: "2x4 studs, deck screws",
    amountCents: 7908,
    taxCents: 640,
    currency: "USD",
    sourceFilename: "IMG_0412.jpg",
    sourcePath: "sources/2026-03-12-the-home-depot-9f3a1c2b.jpg",
  },
  {
    docDate: "2026-03-14",
    vendor: "Shell Oil, Broadway",
    category: "Fuel",
    scheduleCLine: "9",
    memo: null,
    amountCents: 6455,
    taxCents: null,
    currency: "USD",
    sourceFilename: "receipt.pdf",
    sourcePath: "sources/2026-03-14-shell-oil-11ac02de.pdf",
  },
];

test("csvCell quotes only when RFC 4180 requires it, and doubles inner quotes", () => {
  assert.equal(csvCell("Supplies"), "Supplies");
  assert.equal(csvCell("Shell Oil, Broadway"), '"Shell Oil, Broadway"');
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("every export starts with a BOM and uses CRLF line endings", () => {
  for (const csv of [toGenericCsv(ROWS), toQboCsv(ROWS), toXeroCsv(ROWS)]) {
    assert.ok(csv.startsWith("﻿"), "Excel needs the BOM to read UTF-8");
    assert.ok(csv.includes("\r\n"));
    assert.ok(csv.endsWith("\r\n"));
  }
});

test("the generic CSV carries every field, with amounts as plain decimals", () => {
  const lines = toGenericCsv(ROWS).replace("﻿", "").trim().split("\r\n");
  assert.equal(
    lines[0],
    "Date,Vendor,Category,Schedule C line,Memo,Amount,Tax,Currency,Source file",
  );
  assert.equal(
    lines[1],
    '2026-03-12,"The Home Depot #4412 ""Pro Desk""",Supplies,22,"2x4 studs, deck screws",79.08,6.40,USD,sources/2026-03-12-the-home-depot-9f3a1c2b.jpg',
  );
  // A receipt with no printed tax leaves the column empty rather than writing 0.00.
  assert.ok(lines[2].includes(",64.55,,USD,"));
});

test("the QuickBooks CSV uses MM/DD/YYYY and negative amounts for money out", () => {
  const lines = toQboCsv(ROWS).replace("﻿", "").trim().split("\r\n");
  assert.equal(lines[0], "Date,Description,Amount,Category");
  assert.ok(lines[1].startsWith("03/12/2026,"));
  assert.ok(lines[1].includes(",-79.08,Supplies"));
  assert.ok(lines[2].includes(",-64.55,Fuel"));
});

test("the Xero CSV uses its own header spellings, DD/MM/YYYY, and the Schedule C code", () => {
  const lines = toXeroCsv(ROWS).replace("﻿", "").trim().split("\r\n");
  assert.equal(lines[0], "*Date,*Amount,Payee,Description,Reference,Account Code");
  assert.ok(lines[1].startsWith("12/03/2026,-79.08,"));
  assert.ok(lines[1].endsWith(",IMG_0412.jpg,22"));
  assert.ok(lines[2].endsWith(",receipt.pdf,9"));
});

test("an export with no rows is still a valid, importable file with a header", () => {
  const csv = toQboCsv([]).replace("﻿", "");
  assert.equal(csv, "Date,Description,Amount,Category\r\n");
});

test("descriptions include the memo when there is one and stay on one line", () => {
  assert.equal(descriptionFor(ROWS[0]), 'The Home Depot #4412 "Pro Desk" — Supplies (2x4 studs, deck screws)');
  assert.equal(descriptionFor(ROWS[1]), "Shell Oil, Broadway — Fuel");
  const noisy = descriptionFor({ ...ROWS[1], memo: "line one\nline   two" });
  assert.equal(noisy, "Shell Oil, Broadway — Fuel (line one line two)");
});

test("source paths are stable, sortable, and collision-free", () => {
  assert.equal(
    sourcePathFor("2026-03-12", "The Home Depot #4412", "9f3a1c2bdeadbeef", "jpg"),
    "sources/2026-03-12-the-home-depot-4412-9f3a1c2b.jpg",
  );
  // Two same-day receipts from the same vendor differ by content hash.
  assert.notEqual(
    sourcePathFor("2026-03-12", "Shell", "aaaaaaaa1111", "jpg"),
    sourcePathFor("2026-03-12", "Shell", "bbbbbbbb2222", "jpg"),
  );
  assert.equal(sourcePathFor("2026-03-12", "!!!", "abcd1234", "pdf"), "sources/2026-03-12-vendor-abcd1234.pdf");
});
