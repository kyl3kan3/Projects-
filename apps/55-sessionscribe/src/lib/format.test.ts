/**
 * Dates, timezones, and derived status.
 *
 * Two classes of bug are what these are for. The first is the timezone one: the
 * Today screen, the monthly note counter and the signature stamp all read the
 * clock in the practice's zone, and a UTC-shaped answer is wrong by a day at
 * exactly the hours a therapist is finishing work. The second is stale status: a
 * row must report what is true *now*, not what a sweep last wrote.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysBetween,
  displayStatus,
  formatBytes,
  formatClock,
  formatDayLabel,
  formatDuration,
  formatMicros,
  formatStamp,
  formatTime,
  localDateKey,
  periodKey,
  relativeAge,
  rowTitle,
  shortHash,
  statusLine,
  timecode,
  UNSIGNED_AGING_HOURS,
  wordCount,
} from "@/lib/format";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

describe("practice-local clock reading", () => {
  it("renders the same instant differently in two zones", () => {
    const at = new Date("2026-07-18T02:30:00.000Z"); // 7:30pm Jul 17 in LA
    assert.equal(formatTime(at, LA), "7:30 PM");
    assert.equal(formatTime(at, NY), "10:30 PM");
    assert.equal(localDateKey(at, LA), "2026-07-17");
    assert.equal(localDateKey(at, NY), "2026-07-17");
  });

  it("puts a late-evening session on the right local day", () => {
    const at = new Date("2026-07-18T05:30:00.000Z"); // 10:30pm Jul 17 in LA, 1:30am Jul 18 in NY
    assert.equal(localDateKey(at, LA), "2026-07-17");
    assert.equal(localDateKey(at, NY), "2026-07-18");
  });

  it("counts a month-boundary note against the local month", () => {
    const at = new Date("2026-08-01T04:00:00.000Z"); // 9pm Jul 31 in LA
    assert.equal(periodKey(at, LA), "2026-07");
    assert.equal(periodKey(at, NY), "2026-08");
  });

  it("drops the meridiem for the clock chip and keeps tabular digits", () => {
    const at = new Date("2026-07-17T19:07:00.000Z");
    assert.equal(formatClock(at, NY), "3:07");
    assert.equal(formatTime(at, NY), "3:07 PM");
  });

  it("stamps a signature as YYYY-MM-DD HH:MM in the practice zone", () => {
    assert.equal(formatStamp(new Date("2026-07-17T19:07:00.000Z"), NY), "2026-07-17 15:07");
    // Midnight is 00:07, not 24:07 — h23, not h24.
    assert.equal(formatStamp(new Date("2026-07-18T04:07:00.000Z"), NY), "2026-07-18 00:07");
  });

  it("writes the day label the way the screen shows it", () => {
    assert.equal(formatDayLabel(new Date("2026-07-17T19:00:00.000Z"), NY), "Friday Jul 17");
  });
});

describe("elapsed time reads like a person wrote it", () => {
  const now = new Date("2026-07-17T19:00:00.000Z");
  it("scales from minutes to days", () => {
    assert.equal(relativeAge(new Date(now.getTime() - 30_000), now), "just now");
    assert.equal(relativeAge(new Date(now.getTime() - 12 * 60_000), now), "12 min");
    assert.equal(relativeAge(new Date(now.getTime() - 3 * 3_600_000), now), "3 hours");
    assert.equal(relativeAge(new Date(now.getTime() - 3_600_000), now), "1 hour");
    assert.equal(relativeAge(new Date(now.getTime() - 50 * 3_600_000), now), "2 days");
    assert.equal(relativeAge(new Date(now.getTime() + 60_000), now), "just now");
  });

  it("floors whole days", () => {
    assert.equal(daysBetween(new Date("2026-07-01T00:00:00Z"), new Date("2026-07-17T23:00:00Z")), 16);
  });

  it("formats durations and timecodes", () => {
    assert.equal(formatDuration(50), "50 min");
    assert.equal(formatDuration(65), "1h 05m");
    assert.equal(formatDuration(null), "—");
    assert.equal(timecode(724_000), "12:04");
    assert.equal(timecode(0), "0:00");
  });
});

describe("status is derived as of now", () => {
  const now = new Date("2026-07-17T19:00:00.000Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it("reports a fresh draft as ready", () => {
    assert.equal(
      displayStatus(
        { sessionStatus: "ready", noteStatus: "draft", draftGeneratedAt: hoursAgo(2) },
        now,
      ),
      "ready",
    );
  });

  it("nudges once a draft has sat past the aging threshold", () => {
    assert.equal(
      displayStatus(
        {
          sessionStatus: "ready",
          noteStatus: "draft",
          draftGeneratedAt: hoursAgo(UNSIGNED_AGING_HOURS + 1),
        },
        now,
      ),
      "unsigned",
    );
    // The row must say so without anything having updated the database.
    assert.match(
      statusLine("unsigned", { since: hoursAgo(50), now }),
      /unsigned for 2 days/,
    );
  });

  it("lets the note's own status win over the session's", () => {
    assert.equal(
      displayStatus(
        { sessionStatus: "ready", noteStatus: "signed", draftGeneratedAt: hoursAgo(80) },
        now,
      ),
      "signed",
    );
    assert.equal(
      displayStatus(
        { sessionStatus: "ready", noteStatus: "amended", draftGeneratedAt: hoursAgo(1) },
        now,
      ),
      "amending",
    );
  });

  it("shows the pipeline stages and the failure reason", () => {
    assert.equal(
      displayStatus({ sessionStatus: "transcribing", noteStatus: "drafting", draftGeneratedAt: null }, now),
      "transcribing",
    );
    assert.equal(
      displayStatus({ sessionStatus: "failed", noteStatus: "drafting", draftGeneratedAt: null }, now),
      "failed",
    );
    assert.equal(
      statusLine("failed", { since: null, now, failureReason: "audio unreadable" }),
      "audio unreadable",
    );
  });
});

describe("small renderings", () => {
  it("truncates a hash in the middle and leaves short ones alone", () => {
    assert.equal(shortHash("a41f4c9d0011223344556677889900aabbccdd9c2e"), "a41f…9c2e");
    assert.equal(shortHash("abc123"), "abc123");
  });

  it("assembles a row title", () => {
    assert.equal(rowTitle("J.R.", "emdr", "dap"), "J.R. — EMDR / DAP");
  });

  it("counts words and formats sizes and costs", () => {
    assert.equal(wordCount("  two  words "), 2);
    assert.equal(wordCount("   "), 0);
    assert.equal(formatBytes(8_808_038), "8.4 MB");
    assert.equal(formatBytes(0), "—");
    assert.equal(formatMicros(42_000), "$0.042");
    assert.equal(formatMicros(0), "$0.00");
    assert.equal(formatMicros(1_250_000), "$1.25");
  });
});
