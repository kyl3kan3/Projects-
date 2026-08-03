import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findColumn, parseCsv, toCsv } from "@/lib/csv";
import { planImport } from "@/lib/price-book";

describe("csv reading", () => {
  it("keeps a comma that lives inside a quoted item name", () => {
    // "Breaker, 20A AFCI" is one column, and reading it as two silently corrupts
    // an entire imported price book.
    const table = parseCsv('Name,Cost\n"Breaker, 20A AFCI",68.00\n');
    assert.deepEqual(table.headers, ["Name", "Cost"]);
    assert.deepEqual(table.rows, [["Breaker, 20A AFCI", "68.00"]]);
  });

  it("handles a BOM, CRLF and doubled quotes out of Excel", () => {
    const table = parseCsv('﻿Name,Notes\r\n"3/4"" PEX","the "" is inches"\r\n');
    assert.deepEqual(table.headers, ["Name", "Notes"]);
    assert.deepEqual(table.rows, [['3/4" PEX', 'the " is inches']]);
  });

  it("drops blank trailing lines", () => {
    const table = parseCsv("Name,Cost\nRidge vent,9.50\n\n\n");
    assert.equal(table.rows.length, 1);
  });

  it("matches headers a human would call the same thing", () => {
    const headers = ["Item Name", "COST EA", "UOM", "Markup %"];
    assert.equal(findColumn(headers, ["name", "item"]), 0);
    assert.equal(findColumn(headers, ["unit cost", "cost"]), 1);
    assert.equal(findColumn(headers, ["unit", "uom"]), 2);
    assert.equal(findColumn(headers, ["markup"]), 3);
    assert.equal(findColumn(headers, ["nothing like this"]), -1);
  });

  it("round-trips through export", () => {
    const csv = toCsv(["Name", "Cost"], [['Breaker, 20A "AFCI"', 6800]]);
    const table = parseCsv(csv);
    assert.deepEqual(table.rows, [['Breaker, 20A "AFCI"', "6800"]]);
  });
});

describe("import planning", () => {
  const csv = [
    "Category,Name,Kind,Unit,Unit Cost,Markup %,Notes",
    'Equipment,"Condenser, 3-ton",Material,each,"1,950.00",35,',
    "Labor,Lead tech,Labour,hr,95,40,",
    "Roofing,Shingle install,Labor,sq ft,1.85,,",
    "Materials,,Material,each,10,,no name",
    "Materials,No price,Material,each,call us,,",
    'Equipment,"Condenser, 3-ton",Material,each,2000,,duplicate',
  ].join("\n");

  it("reads the usable rows and maps the columns", () => {
    const plan = planImport(csv);
    assert.equal(plan.rows.length, 3);
    assert.equal(plan.mapping.unitCost, "Unit Cost");
    assert.equal(plan.mapping.kind, "Kind");
    assert.equal(plan.rows[0].values.unitCostCents, 195_000);
    assert.equal(plan.rows[0].values.markupPct, 35);
  });

  it("infers kind and unit from how the sheet is written", () => {
    const plan = planImport(csv);
    assert.equal(plan.rows[1].values.kind, "labor");
    assert.equal(plan.rows[1].values.unit, "hour");
    assert.equal(plan.rows[2].values.unit, "sqft");
  });

  it("names every row it skipped and why", () => {
    const plan = planImport(csv);
    assert.equal(plan.skipped.length, 3);
    assert.match(plan.skipped[0].reason, /No item name/);
    assert.match(plan.skipped[1].reason, /Could not read a cost/);
    assert.match(plan.skipped[2].reason, /Duplicate/);
    // The line numbers are the ones a contractor sees in Excel.
    assert.deepEqual(plan.skipped.map((row) => row.line), [5, 6, 7]);
  });

  it("refuses a sheet with no cost column instead of importing zeroes", () => {
    const plan = planImport("Item,Colour\nBreaker,red\n");
    assert.equal(plan.rows.length, 0);
    assert.match(plan.skipped[0].reason, /name column and a cost column/);
  });
});
