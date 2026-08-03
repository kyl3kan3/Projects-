/**
 * The ICS feed's wire format.
 *
 * Google Calendar does not explain itself when it refuses a feed: the
 * subscription simply stays empty. So the parts that decide whether it parses at
 * all — CRLF endings, 75-octet folding, TEXT escaping — are asserted here rather
 * than eyeballed in a screenshot.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeIcsText, foldIcsLine, renderCalendar, type IcsEvent } from "@/lib/ics";

const NOW = new Date("2026-03-12T09:15:00Z");

function event(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "9f1c-deadline@rfpradar",
    start: new Date("2026-03-21T21:00:00Z"),
    durationMinutes: 30,
    summary: "Proposal due — Managed Detection and Response Services",
    description: "Proposal due\nPursuit: Army MDR",
    url: "https://app.rfpradar.io/pursuits/9f1c",
    sequence: 12,
    ...overrides,
  };
}

test("TEXT values escape the four characters RFC 5545 cares about", () => {
  assert.equal(
    escapeIcsText("Managed Network, Security; and Help Desk"),
    "Managed Network\\, Security\\; and Help Desk",
  );
  assert.equal(escapeIcsText("line one\nline two"), "line one\\nline two");
  assert.equal(escapeIcsText("path\\to\\file"), "path\\\\to\\\\file");
  assert.equal(escapeIcsText("§3.2 Scope"), "§3.2 Scope");
});

test("long lines fold at 75 octets with a leading space on continuations", () => {
  const long = `SUMMARY:${"a".repeat(200)}`;
  const folded = foldIcsLine(long);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1);
  assert.ok(Buffer.byteLength(lines[0]) <= 75, `first line was ${Buffer.byteLength(lines[0])} octets`);
  for (const line of lines.slice(1)) {
    assert.equal(line[0], " ", "continuation lines start with a space");
    assert.ok(Buffer.byteLength(line) <= 75);
  }
  assert.equal(folded.split("\r\n ").join(""), long, "unfolding restores the original");
});

test("folding never splits a multi-byte character", () => {
  const line = `DESCRIPTION:${"§".repeat(80)}`;
  const folded = foldIcsLine(line);
  assert.ok(!folded.includes("�"), "a split UTF-8 sequence would show as a replacement char");
  assert.equal(folded.split("\r\n ").join(""), line);
});

test("a short line is left alone", () => {
  assert.equal(foldIcsLine("VERSION:2.0"), "VERSION:2.0");
});

test("the calendar is CRLF-terminated and well-formed", () => {
  const ics = renderCalendar([event()], "Northgate IT — RFPRadar deadlines", NOW);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every LF must be preceded by a CR");
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.equal((ics.match(/END:VEVENT/g) ?? []).length, 1);
  assert.match(ics, /UID:9f1c-deadline@rfpradar\r\n/);
  assert.match(ics, /DTSTAMP:20260312T091500Z\r\n/);
  assert.match(ics, /DTSTART:20260321T210000Z\r\n/);
  assert.match(ics, /DTEND:20260321T213000Z\r\n/);
  assert.match(ics, /SEQUENCE:12\r\n/);
  assert.match(ics, /X-WR-CALNAME:Northgate IT — RFPRadar deadlines\r\n/);
});

test("an em dash in a summary survives, and commas are escaped", () => {
  const ics = renderCalendar(
    [event({ summary: "Questions due — Managed Network, Security, and Help Desk" })],
    "cal",
    NOW,
  );
  const unfolded = ics.split("\r\n ").join("");
  assert.match(unfolded, /SUMMARY:Questions due — Managed Network\\, Security\\, and Help Desk/);
});

test("an empty calendar is still a valid calendar", () => {
  // A firm with no deadlines must get a parseable, empty feed — not a 500 and
  // not a calendar client that silently drops the subscription.
  const ics = renderCalendar([], "RFPRadar deadlines", NOW);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 0);
});

test("multiple events keep one BEGIN/END pair each", () => {
  const ics = renderCalendar(
    [event(), event({ uid: "b@rfpradar", sequence: 3 }), event({ uid: "c@rfpradar" })],
    "cal",
    NOW,
  );
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.equal((ics.match(/END:VEVENT/g) ?? []).length, 3);
});
