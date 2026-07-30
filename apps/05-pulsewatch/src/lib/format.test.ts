import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ago, duration, interval, latency, latencyPair, until, uptimePct } from "@/lib/format";

const now = new Date("2026-03-10T12:00:00Z");

describe("latency", () => {
  it("renders sub-second values in ms", () => {
    assert.equal(latency(212), "212ms");
    assert.equal(latency(0), "0ms");
  });

  it("switches to seconds past a second", () => {
    assert.equal(latency(1480), "1.48s");
  });

  it("shows an em dash for no measurement rather than 0ms", () => {
    assert.equal(latency(null), "—");
    assert.equal(latency(undefined), "—");
  });

  it("renders the p50/p99 pair the monitor row shows", () => {
    assert.equal(latencyPair(212, 480), "212ms · 480ms");
    assert.equal(latencyPair(null, null), "— · —");
  });
});

describe("duration", () => {
  it("uses two units, largest first", () => {
    assert.equal(duration(42), "42s");
    assert.equal(duration(252), "4m 12s");
    assert.equal(duration(7560), "2h 06m");
    assert.equal(duration(273_600), "3d 04h");
  });

  it("never goes negative", () => {
    assert.equal(duration(-10), "0s");
  });
});

describe("ago", () => {
  it("reads as a human interval", () => {
    assert.equal(ago(new Date("2026-03-10T11:38:00Z"), now), "22m ago");
    assert.equal(ago(new Date("2026-03-10T11:59:30Z"), now), "30s ago");
    assert.equal(ago(new Date("2026-03-07T12:00:00Z"), now), "3d ago");
  });

  it("says never for a heartbeat that has not pinged", () => {
    assert.equal(ago(null, now), "never");
  });

  it("collapses the last few seconds", () => {
    assert.equal(ago(new Date("2026-03-10T11:59:59Z"), now), "just now");
  });
});

describe("until", () => {
  it("counts down in the largest useful unit", () => {
    assert.equal(until(new Date("2026-04-20T12:00:00Z"), now), "in 41d");
    assert.equal(until(new Date("2026-03-10T18:00:00Z"), now), "in 6h");
    assert.equal(until(new Date("2026-03-10T12:30:00Z"), now), "in 30m");
  });

  it("says expired rather than a negative number", () => {
    assert.equal(until(new Date("2026-03-01T12:00:00Z"), now), "expired");
  });

  it("says unknown when never scanned", () => {
    assert.equal(until(null, now), "unknown");
  });
});

describe("uptimePct", () => {
  it("reports two decimals", () => {
    assert.equal(uptimePct(9998, 10_000), "99.98%");
    assert.equal(uptimePct(1, 1), "100.00%");
  });

  it("does not claim uptime it never measured", () => {
    assert.equal(uptimePct(0, 0), "—");
  });
});

describe("interval", () => {
  it("reads as the UI labels it", () => {
    assert.equal(interval(30), "30s");
    assert.equal(interval(60), "1 min");
    assert.equal(interval(300), "5 min");
    assert.equal(interval(3600), "1 hr");
  });
});
