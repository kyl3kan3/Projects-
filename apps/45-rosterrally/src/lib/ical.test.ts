/**
 * The calendar feed's contract, which is easy to get wrong in a way nobody
 * notices until every parent has two of every game in their phone.
 *
 * A feed is subscribed once and re-fetched forever, so an event's UID must be
 * stable across edits while `SEQUENCE` rises with the game's revision. That is
 * what makes a moved game *move* rather than duplicate.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { buildIcs, type FeedEvent } from "./ics";

function event(over: Partial<FeedEvent> = {}): FeedEvent {
  return {
    gameId: "11111111-2222-3333-4444-555555555555",
    revision: 1,
    summary: "Thunder v Rapids · U10 Boys",
    location: "Miller Park · Field 2, 41 Miller Rd",
    description: "SAT SEP 12 9:00A America/New_York",
    startsAt: new Date("2026-09-12T13:00:00Z"),
    endsAt: new Date("2026-09-12T14:30:00Z"),
    canceled: false,
    ...over,
  };
}

test("a feed is a well-formed calendar with CRLF line endings", () => {
  const ics = buildIcs("Millbrook Youth Soccer: Thunder", [event()]);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("VERSION:2.0\r\n"));
  assert.ok(ics.includes("X-WR-CALNAME:Millbrook Youth Soccer: Thunder\r\n"));
  // Every line ends CRLF, as RFC 5545 requires.
  assert.equal(ics.split("\n").every((l) => l === "" || l.endsWith("\r")), true);
});

test("times are emitted as UTC instants, so a client renders the reader's own zone", () => {
  const ics = buildIcs("Feed", [event()]);
  assert.ok(ics.includes("DTSTART:20260912T130000Z"));
  assert.ok(ics.includes("DTEND:20260912T143000Z"));
});

test("the UID is stable across edits and the SEQUENCE follows the revision", () => {
  const first = buildIcs("Feed", [event({ revision: 1 })]);
  const moved = buildIcs("Feed", [
    event({
      revision: 2,
      startsAt: new Date("2026-09-12T18:00:00Z"),
      endsAt: new Date("2026-09-12T19:30:00Z"),
    }),
  ]);
  const uid = "UID:game-11111111-2222-3333-4444-555555555555@rosterrally";
  assert.ok(first.includes(uid));
  assert.ok(moved.includes(uid), "a moved game keeps its UID or it duplicates");
  assert.ok(first.includes("SEQUENCE:1"));
  assert.ok(moved.includes("SEQUENCE:2"), "the sequence must rise or clients ignore the update");
  assert.ok(moved.includes("DTSTART:20260912T180000Z"));
});

test("a cancelled game stays in the feed, marked cancelled", () => {
  const ics = buildIcs("Feed", [event({ canceled: true })]);
  assert.ok(ics.includes("STATUS:CANCELLED"));
  // Still present, so the entry disappears from a calendar rather than lingering
  // as a game nobody turns up to.
  assert.ok(ics.includes("UID:game-11111111"));
  assert.ok(buildIcs("Feed", [event()]).includes("STATUS:CONFIRMED"));
});

test("commas, semicolons, backslashes and newlines are escaped, not emitted raw", () => {
  const ics = buildIcs("Feed", [
    event({
      summary: "Thunder v Rapids, U10; final",
      location: "Miller Park \\ Field 2",
      description: "Bring both jerseys\nGates open 8:30",
    }),
  ]);
  assert.ok(ics.includes("SUMMARY:Thunder v Rapids\\, U10\\; final"));
  assert.ok(ics.includes("LOCATION:Miller Park \\\\ Field 2"));
  assert.ok(ics.includes("DESCRIPTION:Bring both jerseys\\nGates open 8:30"));
  // A raw newline inside a property would break every parser.
  const body = ics.split("\r\n").find((l) => l.startsWith("DESCRIPTION:"));
  assert.ok(body && !body.includes("\n"));
});

test("a long summary is folded, and folded lines continue with a space", () => {
  const long = `Thunder v Rapids ${"and the very long tournament name ".repeat(4)}`;
  const ics = buildIcs("Feed", [event({ summary: long })]);
  const lines = ics.split("\r\n");
  const start = lines.findIndex((l) => l.startsWith("SUMMARY:"));
  assert.ok(lines[start].length <= 75, "the first folded line stays within 75 octets");
  assert.ok(lines[start + 1].startsWith(" "), "continuations begin with a space");
  // Unfolding restores the original text.
  let unfolded = lines[start].slice("SUMMARY:".length);
  for (let i = start + 1; lines[i]?.startsWith(" "); i++) unfolded += lines[i].slice(1);
  assert.equal(unfolded, long.trim() === long ? long : long);
});

test("an empty feed is still a valid calendar", () => {
  const ics = buildIcs("Millbrook: Thunder", []);
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.equal(ics.includes("BEGIN:VEVENT"), false);
});

test("a whole season's events each appear exactly once", () => {
  const events = Array.from({ length: 10 }, (_, i) =>
    event({
      gameId: `game-${i}`,
      startsAt: new Date(`2026-09-${12 + i}T13:00:00Z`),
      endsAt: new Date(`2026-09-${12 + i}T14:30:00Z`),
    }),
  );
  const ics = buildIcs("Feed", events);
  assert.equal(ics.split("BEGIN:VEVENT").length - 1, 10);
  assert.equal(new Set(ics.match(/UID:[^\r]+/g)).size, 10);
});
