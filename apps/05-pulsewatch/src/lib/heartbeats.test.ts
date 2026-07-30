import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dueBy, parseCron, previousCronOccurrence } from "@/lib/heartbeats";
import type { Monitor } from "@/db/schema";

const at = (iso: string) => new Date(iso);

/** Minimum viable heartbeat monitor for the lateness helpers. */
function heartbeat(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    teamId: "00000000-0000-0000-0000-000000000001",
    name: "nightly-backup",
    type: "heartbeat",
    target: "",
    intervalSeconds: 300,
    nextDueAt: at("2100-01-01T00:00:00Z"),
    regions: ["iad"],
    expectedStatusCodes: [200],
    keyword: null,
    keywordInvert: false,
    requestHeaders: null,
    followRedirects: true,
    timeoutMs: 10_000,
    failureThreshold: 2,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    pingToken: "token",
    scheduleKind: "interval",
    expectedIntervalSeconds: 3600,
    cronExpression: null,
    graceSeconds: 300,
    lastPingAt: null,
    status: "up",
    lastCheckedAt: null,
    lastLatencyMs: null,
    pausedAt: null,
    createdAt: at("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("parseCron", () => {
  it("rejects anything that is not five fields", () => {
    assert.throws(() => parseCron("0 3 * *"));
    assert.throws(() => parseCron("0 3 * * * *"));
  });

  it("rejects an out-of-range step", () => {
    assert.throws(() => parseCron("*/0 * * * *"));
  });

  it("treats 0 and 7 as Sunday", () => {
    assert.ok(parseCron("0 9 * * 7").dayOfWeek.has(0));
    assert.ok(parseCron("0 9 * * 0").dayOfWeek.has(0));
  });

  it("expands lists, ranges and steps", () => {
    const fields = parseCron("0,30 9-11 * * *");
    assert.deepEqual([...fields.minute].sort((a, b) => a - b), [0, 30]);
    assert.deepEqual([...fields.hour].sort((a, b) => a - b), [9, 10, 11]);
  });
});

describe("previousCronOccurrence", () => {
  it("finds the most recent daily run", () => {
    assert.equal(
      previousCronOccurrence("0 3 * * *", at("2026-03-10T05:30:00Z"))?.toISOString(),
      "2026-03-10T03:00:00.000Z",
    );
  });

  it("handles minute steps", () => {
    assert.equal(
      previousCronOccurrence("*/15 * * * *", at("2026-03-10T05:37:00Z"))?.toISOString(),
      "2026-03-10T05:30:00.000Z",
    );
  });

  it("skips days the expression excludes", () => {
    // 2026-03-08 is a Sunday, so a Mon-Fri job last ran on Friday the 6th.
    assert.equal(
      previousCronOccurrence("0 9 * * 1-5", at("2026-03-08T12:00:00Z"))?.toISOString(),
      "2026-03-06T09:00:00.000Z",
    );
  });

  it("ORs the day fields when both are restricted, like Vixie cron", () => {
    // The 1st of the month OR any Monday — 2026-03-02 is a Monday.
    assert.equal(
      previousCronOccurrence("0 0 1 * 1", at("2026-03-02T06:00:00Z"))?.toISOString(),
      "2026-03-02T00:00:00.000Z",
    );
  });

  it("returns null when nothing matches inside the lookback", () => {
    // February 30th never happens.
    assert.equal(previousCronOccurrence("0 0 30 2 *", at("2026-03-10T00:00:00Z"), 60), null);
  });
});

describe("dueBy", () => {
  it("is not late inside the interval plus grace", () => {
    const monitor = heartbeat({ lastPingAt: at("2026-03-10T05:00:00Z") });
    const deadline = dueBy(monitor, at("2026-03-10T05:10:00Z"));
    // 1h interval + 5m grace from 05:00 => 06:05.
    assert.equal(deadline?.toISOString(), "2026-03-10T06:05:00.000Z");
  });

  it("is late once interval plus grace has elapsed", () => {
    const monitor = heartbeat({ lastPingAt: at("2026-03-10T04:00:00Z") });
    const now = at("2026-03-10T05:30:00Z");
    assert.ok((dueBy(monitor, now) as Date) < now);
  });

  it("falls back to createdAt when a heartbeat has never pinged", () => {
    const monitor = heartbeat({ lastPingAt: null, createdAt: at("2026-03-10T00:00:00Z") });
    assert.equal(dueBy(monitor, at("2026-03-10T00:30:00Z"))?.toISOString(), "2026-03-10T01:05:00.000Z");
  });

  it("is not late when a cron job pinged after its last run", () => {
    const monitor = heartbeat({
      scheduleKind: "cron",
      cronExpression: "0 3 * * *",
      lastPingAt: at("2026-03-10T03:01:00Z"),
    });
    assert.equal(dueBy(monitor, at("2026-03-10T09:00:00Z")), null);
  });

  it("sets a deadline of the missed run plus grace", () => {
    const monitor = heartbeat({
      scheduleKind: "cron",
      cronExpression: "0 3 * * *",
      graceSeconds: 900,
      lastPingAt: at("2026-03-09T03:01:00Z"),
    });
    assert.equal(
      dueBy(monitor, at("2026-03-10T09:00:00Z"))?.toISOString(),
      "2026-03-10T03:15:00.000Z",
    );
  });

  it("never pages on an unparseable expression", () => {
    const monitor = heartbeat({ scheduleKind: "cron", cronExpression: "not a cron" });
    assert.equal(dueBy(monitor, at("2026-03-10T09:00:00Z")), null);
  });
});
