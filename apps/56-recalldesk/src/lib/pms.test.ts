/**
 * The import layer's parsing rules. README risk 1: "CSV imports are messy and
 * PMS-specific. Bad mappings poison the overdue math." These are the cases that
 * poison it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyVisitKind,
  detectSource,
  mappingProblems,
  normalizeEmail,
  normalizeHeader,
  normalizePhone,
  parseBooleanCell,
  parseInterval,
  parsePmsDate,
  splitName,
  suggestMapping,
} from "@/lib/pms";
import { toDayString } from "@/lib/dates";

test("headers normalise to a comparable key", () => {
  assert.equal(normalizeHeader("Pat Chart #"), "patchart");
  assert.equal(normalizeHeader("﻿PatNum"), "patnum");
  assert.equal(normalizeHeader("Wireless_Phone"), "wirelessphone");
});

test("each PMS is detected from its own header row", () => {
  assert.equal(
    detectSource(["Pat Chart #", "First Name", "Last Name", "Continuing Care Interval"]),
    "dentrix",
  );
  assert.equal(
    detectSource(["Account", "Patient Name", "Cell Phone", "Recall Interval"]),
    "eaglesoft",
  );
  assert.equal(
    detectSource(["PatNum", "FName", "LName", "WirelessPhone", "AptDateTime"]),
    "opendental",
  );
});

test("an unrecognised file falls back to the generic recipe rather than guessing", () => {
  assert.equal(detectSource(["Patient", "Phone", "Seen"]), "other");
  assert.equal(detectSource([]), "other");
});

test("Dentrix headers map to fields, preferring the mobile number", () => {
  const mapping = suggestMapping(
    ["Pat Chart #", "First Name", "Last Name", "Email", "Home Phone", "Mobile Phone", "Last Visit Date"],
    "dentrix",
  );
  assert.equal(mapping["Pat Chart #"], "external_id");
  assert.equal(mapping["First Name"], "first_name");
  assert.equal(mapping["Last Name"], "last_name");
  assert.equal(mapping["Email"], "email");
  assert.equal(mapping["Mobile Phone"], "phone");
  assert.equal(mapping["Home Phone"], undefined);
  assert.equal(mapping["Last Visit Date"], "last_visit_on");
});

test("Open Dental's one-row-per-appointment export maps the visit date", () => {
  const mapping = suggestMapping(
    ["PatNum", "FName", "LName", "Email", "WirelessPhone", "AptDateTime", "AptType"],
    "opendental",
  );
  assert.equal(mapping["AptDateTime"], "visited_on");
  assert.equal(mapping["AptType"], "visit_kind");
  assert.equal(mapping["PatNum"], "external_id");
});

test("Eaglesoft's single name column maps to full_name", () => {
  const mapping = suggestMapping(
    ["Account", "Patient Name", "Email", "Cell Phone", "Last Visit"],
    "eaglesoft",
  );
  assert.equal(mapping["Patient Name"], "full_name");
  assert.equal(mapping["Cell Phone"], "phone");
});

test("a mapping without a name or a date is rejected with a sentence, not a code", () => {
  assert.deepEqual(mappingProblems({}).length, 2);
  const nameOnly = mappingProblems({ A: "first_name", B: "last_name" });
  assert.equal(nameOnly.length, 1);
  assert.match(nameOnly[0], /nobody can be overdue/);
  assert.deepEqual(mappingProblems({ A: "full_name", B: "last_visit_on" }), []);
});

test("US month-first dates parse as the PMS writes them", () => {
  assert.equal(toDayString(parsePmsDate("11/14/2024", "mdy")!), "2024-11-14");
  assert.equal(toDayString(parsePmsDate("1/2/2025", "mdy")!), "2025-01-02");
  // The same string read day-first is a different month entirely.
  assert.equal(toDayString(parsePmsDate("1/2/2025", "dmy")!), "2025-02-01");
});

test("a day over 12 disambiguates itself regardless of the recipe", () => {
  assert.equal(toDayString(parsePmsDate("25/03/2025", "mdy")!), "2025-03-25");
});

test("ISO dates and Open Dental datetimes parse", () => {
  assert.equal(toDayString(parsePmsDate("2025-03-04", "ymd")!), "2025-03-04");
  assert.equal(toDayString(parsePmsDate("2026-08-11 09:40:00", "ymd")!), "2026-08-11");
  assert.equal(toDayString(parsePmsDate("2026-08-11T09:40", "ymd")!), "2026-08-11");
});

test("named-month and two-digit-year forms parse", () => {
  assert.equal(toDayString(parsePmsDate("14-Nov-2024", "mdy")!), "2024-11-14");
  assert.equal(toDayString(parsePmsDate("Nov 14, 2024", "mdy")!), "2024-11-14");
  assert.equal(toDayString(parsePmsDate("11/14/24", "mdy")!), "2024-11-14");
  assert.equal(toDayString(parsePmsDate("3.6.2025", "mdy")!), "2025-03-06");
});

test("unreadable and impossible dates return null instead of a guess", () => {
  assert.equal(parsePmsDate("", "mdy"), null);
  assert.equal(parsePmsDate("n/a", "mdy"), null);
  assert.equal(parsePmsDate("00/00/0000", "mdy"), null);
  assert.equal(parsePmsDate("02/31/2025", "mdy"), null); // no 31 February
  assert.equal(parsePmsDate("13/13/2025", "mdy"), null);
  assert.equal(parsePmsDate("1899-01-01", "ymd"), null);
});

test("consent cells read Y/N, and say nothing when the cell says nothing", () => {
  assert.equal(parseBooleanCell("Y"), true);
  assert.equal(parseBooleanCell("yes"), true);
  assert.equal(parseBooleanCell("1"), true);
  assert.equal(parseBooleanCell("N"), false);
  assert.equal(parseBooleanCell(""), false);
  assert.equal(parseBooleanCell("maybe"), null);
});

test("phones normalise to E.164 or refuse", () => {
  assert.equal(normalizePhone("(512) 555-0147"), "+15125550147");
  assert.equal(normalizePhone("512.555.0147"), "+15125550147");
  assert.equal(normalizePhone("1-512-555-0147"), "+15125550147");
  assert.equal(normalizePhone("+1 512 555 0147"), "+15125550147");
  // A switchboard extension is not a mobile; guessing sends a text to a stranger.
  assert.equal(normalizePhone("512-555-0147 x214"), null);
  assert.equal(normalizePhone("555-0147"), null);
  assert.equal(normalizePhone("012-555-0147"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("none"), null);
});

test("emails normalise, and multi-address cells take the first", () => {
  assert.equal(normalizeEmail("  R.Mbeki@Example.COM "), "r.mbeki@example.com");
  assert.equal(normalizeEmail("a@b.co;c@d.co"), "a@b.co");
  assert.equal(normalizeEmail("not an email"), null);
  assert.equal(normalizeEmail("nobody@localhost"), null);
});

test("one-column names split both ways round", () => {
  assert.deepEqual(splitName("Mbeki, Rosalind"), { firstName: "Rosalind", lastName: "Mbeki" });
  assert.deepEqual(splitName("Rosalind Mbeki"), { firstName: "Rosalind", lastName: "Mbeki" });
  assert.deepEqual(splitName("Jae Sun  Park"), { firstName: "Jae Sun", lastName: "Park" });
  assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
  assert.equal(splitName("   "), null);
});

test("appointment types classify as hygiene or not", () => {
  assert.equal(classifyVisitKind("Prophy Adult"), "hygiene");
  assert.equal(classifyVisitKind("RECALL 6MO"), "hygiene");
  assert.equal(classifyVisitKind("Perio Maint"), "hygiene");
  assert.equal(classifyVisitKind("D1110"), "hygiene");
  assert.equal(classifyVisitKind("Crown Seat"), "other");
  assert.equal(classifyVisitKind("Emergency exam"), "other");
  // An unlabelled visit in a hygiene-recall export is a hygiene visit.
  assert.equal(classifyVisitKind(""), "hygiene");
});

test("recall interval cells parse to months, or nothing", () => {
  assert.equal(parseInterval("6"), 6);
  assert.equal(parseInterval("6 months"), 6);
  assert.equal(parseInterval("0004"), 4);
  assert.equal(parseInterval("12M"), 12);
  assert.equal(parseInterval("as needed"), null);
  assert.equal(parseInterval("99"), null);
});
