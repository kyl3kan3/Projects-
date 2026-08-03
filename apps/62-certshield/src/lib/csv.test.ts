import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, parseVendorCsv, toCsv, VENDOR_CSV_TEMPLATE } from "./csv";

test("quoted commas, escaped quotes, CRLF and a BOM all survive", () => {
  const text = '﻿Name,Notes\r\n"Vega, Marisol & Co","said ""fine"""\r\n\r\n';
  assert.deepEqual(parseCsv(text), [
    ["Name", "Notes"],
    ["Vega, Marisol & Co", 'said "fine"'],
  ]);
});

test("a file with no trailing newline keeps its last row", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("writing quotes anything that would break a cell, and ends CRLF", () => {
  const out = toCsv([
    ["Vendor", "Reason"],
    ["Kestrel Roofing, LLC", 'GL "each occurrence" $500,000\nis below $1,000,000'],
  ]);
  assert.ok(out.endsWith("\r\n"));
  assert.deepEqual(parseCsv(out), [
    ["Vendor", "Reason"],
    ["Kestrel Roofing, LLC", 'GL "each occurrence" $500,000\nis below $1,000,000'],
  ]);
});

/* ------------------------------------------------------------ vendor import */

test("the shipped template imports cleanly against itself", () => {
  const result = parseVendorCsv(VENDOR_CSV_TEMPLATE);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    name: "Kestrel Roofing LLC",
    trade: "Roofing",
    contactName: "Marisol Vega",
    contactEmail: "marisol@kestrelroofing.example",
    agentName: "Harbor & Main Insurance Agency",
    agentEmail: "renee@harborandmain.example",
    phone: "(503) 555-0148",
    notes: "Preferred roofer, 3-year MSA",
    properties: ["Bayview Terrace", "Alder Court"],
  });
});

test("header aliases from real exports are recognised", () => {
  const result = parseVendorCsv(
    "Company Name,Vendor Type,Primary Contact,E-Mail,Broker,Job\nAlder Mechanical,HVAC,Dev Patel,dev@alder.example,Cascade Risk,Alder Court\n",
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].name, "Alder Mechanical");
  assert.equal(result.rows[0].trade, "HVAC");
  assert.equal(result.rows[0].contactEmail, "dev@alder.example");
  assert.equal(result.rows[0].agentName, "Cascade Risk");
  assert.deepEqual(result.rows[0].properties, ["Alder Court"]);
});

test("a missing name column is a whole-file error with the fix in it", () => {
  const result = parseVendorCsv("Trade,Email\nRoofing,a@b.co\n");
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /No vendor-name column/);
  assert.match(result.errors[0].message, /"Name", "Vendor" or "Company"/);
});

test("bad rows are named by line number and the rest still import", () => {
  const text = [
    "Name,Email",
    "Kestrel Roofing LLC,marisol@kestrelroofing.example",
    ",orphan@nowhere.example",
    "Cordova Landscape,not-an-email",
    "Kestrel Roofing LLC,dupe@kestrelroofing.example",
    "Alder Mechanical,dev@alder.example",
  ].join("\n");
  const result = parseVendorCsv(text);
  assert.deepEqual(
    result.rows.map((r) => r.name),
    ["Kestrel Roofing LLC", "Cordova Landscape", "Alder Mechanical"],
  );
  assert.deepEqual(result.errors, [
    { line: 3, message: "Skipped: no vendor name in this row." },
    {
      line: 4,
      message: '"Cordova Landscape": "not-an-email" is not a valid email address, so it was left blank.',
    },
    { line: 5, message: 'Skipped: "Kestrel Roofing LLC" appears more than once in this file.' },
  ]);
  // The invalid address is dropped, not stored — a chase to a bad address is worse
  // than no chase, because the ledger records it as sent.
  assert.equal(result.rows[1].contactEmail, null);
});

test("unrecognised columns are reported, not silently dropped", () => {
  const result = parseVendorCsv("Name,W-9 on file,Insurance expiry\nAlder Mechanical,Yes,2027-01-01\n");
  assert.deepEqual(result.ignoredColumns, ["W-9 on file", "Insurance expiry"]);
  assert.equal(result.rows.length, 1);
});

test("a header row with nothing under it says so", () => {
  const result = parseVendorCsv("Name,Trade\n");
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /no vendors under it/);
});

test("an empty file says so rather than importing zero vendors quietly", () => {
  assert.match(parseVendorCsv("").errors[0].message, /empty/);
});

test("multi-valued property cells split on ; and |", () => {
  const result = parseVendorCsv("Name,Properties\nAlder Mechanical,Alder Court|Bayview Terrace; Alder Court\n");
  assert.deepEqual(result.rows[0].properties, ["Alder Court", "Bayview Terrace"]);
});
