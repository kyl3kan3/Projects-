/**
 * Display helpers, with one test that matters more than the rest:
 * `displayStatus` derives "overdue" and "expired" from the clock rather than from
 * a stored column a nightly job reconciles. Without that, a packet 212 days past
 * its link expiry renders as "Sent" until the sweep next runs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ageLabel,
  bytesLabel,
  clockLocal,
  completionRate,
  dayLocal,
  displayStatus,
  initialsOf,
  shortDate,
  stampLocal,
} from "@/lib/format";

const now = new Date("2026-08-01T15:00:00Z");

function intake(overrides: Partial<Parameters<typeof displayStatus>[0]> = {}) {
  return {
    status: "sent" as const,
    sentAt: new Date("2026-08-01T09:00:00Z"),
    expiresAt: new Date("2026-08-31T09:00:00Z"),
    ...overrides,
  };
}

describe("displayStatus", () => {
  it("shows a fresh packet as sent", () => {
    assert.equal(displayStatus(intake(), 120, now), "sent");
  });

  it("shows a packet the patient opened as started", () => {
    assert.equal(displayStatus(intake({ status: "started" }), 120, now), "started");
  });

  it("derives overdue from the clock, without any stored flag", () => {
    const old = intake({ sentAt: new Date("2026-07-20T09:00:00Z") });
    assert.equal(displayStatus(old, 120, now), "overdue");
    // Same row, a tighter threshold: still the clock, not a column.
    assert.equal(displayStatus(intake(), 5, now), "overdue");
  });

  it("derives expired from the link's own expiry, not from a nightly sweep", () => {
    const stale = intake({ expiresAt: new Date("2026-01-05T09:00:00Z") });
    assert.equal(displayStatus(stale, 120, now), "expired");
    // Even if a sweep has never touched it and the column still says "sent".
    assert.equal(stale.status, "sent");
  });

  it("never downgrades a finished packet to overdue or expired", () => {
    const signed = intake({
      status: "signed",
      sentAt: new Date("2025-01-01T09:00:00Z"),
      expiresAt: new Date("2025-02-01T09:00:00Z"),
    });
    assert.equal(displayStatus(signed, 120, now), "signed");
    const completed = { ...signed, status: "completed" as const };
    assert.equal(displayStatus(completed, 120, now), "completed");
  });
});

describe("ageLabel", () => {
  it("rounds down, so 4d never appears before four full days", () => {
    assert.equal(ageLabel(new Date("2026-08-01T14:30:00Z"), now), "30m");
    assert.equal(ageLabel(new Date("2026-08-01T09:00:00Z"), now), "6h");
    assert.equal(ageLabel(new Date("2026-07-30T16:30:00Z"), now), "46h");
    assert.equal(ageLabel(new Date("2026-07-30T14:00:00Z"), now), "2d");
    assert.equal(ageLabel(new Date("2026-07-28T16:00:00Z"), now), "3d");
    assert.equal(ageLabel(new Date("2026-07-19T15:00:00Z"), now), "13d");
    // Past three weeks the unit changes, so a long-overdue packet stays readable.
    assert.equal(ageLabel(new Date("2026-07-01T15:00:00Z"), now), "4w");
    assert.equal(ageLabel(new Date("2026-06-01T15:00:00Z"), now), "8w");
    assert.equal(ageLabel(new Date("2025-08-01T15:00:00Z"), now), "12mo");
  });

  it("never shows a negative age for a clock-skewed future timestamp", () => {
    assert.equal(ageLabel(new Date("2026-08-02T15:00:00Z"), now), "0m");
  });
});

describe("timestamps in the practice's zone", () => {
  const at = new Date("2026-07-04T02:15:30Z"); // 22:15 on 3 July in New York

  it("renders the practice-local day, not the server's", () => {
    assert.equal(dayLocal(at, "America/New_York"), "2026-07-03");
    assert.equal(dayLocal(at, "UTC"), "2026-07-04");
    assert.equal(shortDate(at, "America/New_York"), "JUL 3");
  });

  it("renders the audit row's clock column with seconds", () => {
    assert.equal(clockLocal(at, "America/New_York"), "22:15:30");
    assert.equal(clockLocal(at, "UTC"), "02:15:30");
  });

  it("renders the version stamp form", () => {
    assert.equal(stampLocal(at, "America/New_York"), "JUL 3 2026 · 22:15");
  });
});

describe("small numbers", () => {
  it("shows an em dash rather than 0% for a practice that has sent nothing", () => {
    assert.equal(completionRate(0, 0), "—");
    assert.equal(completionRate(0, 4), "0%");
    assert.equal(completionRate(11, 12), "92%");
  });

  it("labels bytes", () => {
    assert.equal(bytesLabel(512), "512 B");
    assert.equal(bytesLabel(2048), "2 KB");
    assert.equal(bytesLabel(3_500_000), "3.3 MB");
  });

  it("takes initials from the first two names only", () => {
    assert.equal(initialsOf("Dana Okonkwo"), "DO");
    assert.equal(initialsOf("Maria del Carmen Ruiz"), "MD");
    assert.equal(initialsOf(""), "");
  });
});
