import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFeed,
  feedEtag,
  hashIcsToken,
  icsFeedPath,
  icsHashMatches,
  newIcsToken,
  type FeedDeadline,
} from "./ics";

const NOW = new Date("2026-08-01T09:00:00Z");

function deadline(overrides: Partial<FeedDeadline> = {}): FeedDeadline {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "report",
    dueOn: "2026-09-15",
    label: "Final report to Sample Community Foundation",
    funderName: "Sample Community Foundation of the Cuyahoga",
    grantTitle: "Summer literacy camp, 2026",
    askAmountCents: 1_000_000,
    completedAt: null,
    updatedAt: new Date("2026-07-20T10:11:12Z"),
    ...overrides,
  };
}

const OPTIONS = {
  orgName: "Riverside Youth Collective",
  timezone: "America/New_York",
  appUrl: "https://app.grantgrid.org",
};

test("deadlines are emitted as all-day events, so no viewer sees the wrong day", () => {
  const feed = buildFeed([deadline()], OPTIONS, NOW);
  assert.match(feed, /DTSTART;VALUE=DATE:20260915/);
  // DTEND is exclusive for all-day events: the day after.
  assert.match(feed, /DTEND;VALUE=DATE:20260916/);
  // No timestamped DTSTART anywhere — that is the bug this replaces.
  assert.ok(!/DTSTART:\d{8}T/.test(feed));
});

test("UIDs are stable, so re-fetching updates instead of duplicating", () => {
  const first = buildFeed([deadline()], OPTIONS, NOW);
  const second = buildFeed([deadline()], OPTIONS, new Date("2026-08-02T09:00:00Z"));
  const uid = /UID:(.+)/.exec(first)![1];
  assert.equal(uid, "11111111-1111-4111-8111-111111111111@grantgrid");
  assert.match(second, /UID:11111111-1111-4111-8111-111111111111@grantgrid/);
});

test("the feed is a well-formed VCALENDAR with CRLF line endings", () => {
  const feed = buildFeed([deadline(), deadline({ id: "22", kind: "loi" })], OPTIONS, NOW);
  assert.ok(feed.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(feed.endsWith("END:VCALENDAR\r\n"));
  assert.equal((feed.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.equal((feed.match(/END:VEVENT/g) ?? []).length, 2);
  for (const line of feed.split("\r\n")) {
    assert.ok(line.length <= 75, `line too long: ${line}`);
  }
});

test("commas and newlines in funder names are escaped, not left to break the parse", () => {
  const feed = buildFeed(
    [deadline({ funderName: "Sample Trust, Ltd.; Ohio", label: "Line one\nLine two" })],
    OPTIONS,
    NOW,
  );
  assert.match(feed, /SUMMARY:Report — Sample Trust\\, Ltd\.\\; Ohio/);
  assert.match(feed, /Line one\\nLine two/);
});

test("a completed deadline is cancelled in the calendar rather than vanishing", () => {
  const feed = buildFeed([deadline({ completedAt: new Date("2026-09-10T00:00:00Z") })], OPTIONS, NOW);
  assert.match(feed, /STATUS:CANCELLED/);
});

test("kind is visible in the summary and the categories", () => {
  const feed = buildFeed([deadline({ kind: "loi" })], OPTIONS, NOW);
  assert.match(feed, /SUMMARY:LOI — Sample Community Foundation/);
  assert.match(feed, /CATEGORIES:LOI/);
});

test("an empty pipeline still produces a valid, subscribable calendar", () => {
  const feed = buildFeed([], OPTIONS, NOW);
  assert.ok(feed.includes("BEGIN:VCALENDAR"));
  assert.ok(feed.includes("END:VCALENDAR"));
  assert.ok(!feed.includes("BEGIN:VEVENT"));
  assert.match(feed, /X-WR-CALNAME:Riverside Youth Collective/);
});

test("tokens are stored as HMACs and rotation invalidates the old URL", () => {
  const secret = "test-secret-not-a-real-key";
  const token = newIcsToken();
  const hash = hashIcsToken(token, secret);
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
  assert.ok(icsHashMatches(hashIcsToken(token, secret), hash));

  const rotated = newIcsToken();
  assert.notEqual(rotated, token);
  assert.equal(icsHashMatches(hashIcsToken(rotated, secret), hash), false);

  // A different secret must not validate the same token.
  assert.equal(icsHashMatches(hashIcsToken(token, "other-secret"), hash), false);
  // Length mismatch must not throw out of timingSafeEqual.
  assert.equal(icsHashMatches("short", hash), false);
});

test("the feed path carries the raw token and nothing else", () => {
  assert.equal(icsFeedPath("abc123"), "/api/calendar/abc123/grantgrid.ics");
});

test("the ETag changes only when the feed does", () => {
  const a = buildFeed([deadline()], OPTIONS, NOW);
  const b = buildFeed([deadline()], OPTIONS, NOW);
  const c = buildFeed([deadline({ dueOn: "2026-09-16" })], OPTIONS, NOW);
  assert.equal(feedEtag(a), feedEtag(b));
  assert.notEqual(feedEtag(a), feedEtag(c));
});
