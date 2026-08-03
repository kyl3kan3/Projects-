import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProfile,
  isWeekend,
  median,
  profileFromCells,
  profileIsTrustworthy,
  robustSigma,
} from "./baseline";
import {
  correlateDeploy,
  DEFAULT_DETECTOR,
  detect,
  excessSince,
  hourThreshold,
  leadTimeLabel,
  rankContributors,
  shouldResolve,
} from "./anomaly";
import { addHours, floorHour } from "./dates";

const HOUR = 3_600_000;

/** 14 days of hourly samples with a business-hours shape and a nightly batch. */
function history(opts: {
  end: Date;
  hours: number;
  base: number;
  batchMultiplier?: number;
  weekendMultiplier?: number;
  jitter?: number;
}): Array<{ ts: Date; micros: number }> {
  const out: Array<{ ts: Date; micros: number }> = [];
  for (let i = opts.hours; i > 0; i--) {
    const ts = addHours(opts.end, -i);
    const hour = ts.getUTCHours();
    let micros = opts.base;
    if (opts.batchMultiplier && (hour === 3 || hour === 4)) micros *= opts.batchMultiplier;
    if (opts.weekendMultiplier && isWeekend(ts.getUTCDay())) micros *= opts.weekendMultiplier;
    // Deterministic jitter so the test never flakes.
    const wobble = 1 + ((i % 7) - 3) * (opts.jitter ?? 0.02);
    out.push({ ts, micros: Math.round(micros * wobble) });
  }
  return out;
}

test("median and robust sigma ignore a single runaway sample", () => {
  assert.equal(median([1, 2, 3, 4, 5]), 3);
  assert.equal(median([1, 2, 3, 4]), 3); // rounds the midpoint
  assert.equal(median([]), 0);
  const steady = [100, 102, 98, 101, 99];
  const poisoned = [...steady, 100_000];
  assert.equal(median(steady), 100);
  assert.equal(median(poisoned), 101);
  // A mean would have moved by 16,000; the robust sigma barely moves.
  assert.ok(Math.abs(robustSigma(poisoned) - robustSigma(steady)) < 2000);
  assert.equal(robustSigma([5]), 0);
});

test("the profile is per day-of-week and hour, and covers all 168 cells", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  const cells = buildProfile(history({ end, hours: 24 * 14, base: 1_000_000 }));
  assert.equal(cells.length, 168);
  assert.ok(profileIsTrustworthy(cells));
});

test("a two-day-old account does not get a trustworthy profile", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  const cells = buildProfile(history({ end, hours: 48, base: 1_000_000 }));
  assert.equal(profileIsTrustworthy(cells), false);
});

test("the nightly 03:00 batch window does not fire — that is the seasonality", () => {
  const end = floorHour(new Date("2026-07-14T06:00:00Z"));
  const samples = history({ end, hours: 24 * 14, base: 1_000_000, batchMultiplier: 1.45 });
  const profile = profileFromCells(buildProfile(samples));
  // Evaluate the most recent hours, which include a 03:00–04:00 batch run.
  assert.equal(detect(samples.slice(-12), profile), null);
});

test("a weekend-idle service does not fire when the weekday shape returns", () => {
  // Monday morning after a quiet weekend.
  const end = floorHour(new Date("2026-07-13T10:00:00Z"));
  const samples = history({
    end,
    hours: 24 * 21,
    base: 4_000_000,
    weekendMultiplier: 0.3,
  });
  const profile = profileFromCells(buildProfile(samples));
  assert.equal(detect(samples.slice(-12), profile), null);
});

test("one noisy hour is not an anomaly", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  const samples = history({ end, hours: 24 * 14, base: 2_000_000 });
  const profile = profileFromCells(buildProfile(samples));
  const spiked = [...samples];
  spiked[spiked.length - 1] = {
    ts: spiked[spiked.length - 1].ts,
    micros: 40_000_000,
  };
  assert.equal(detect(spiked.slice(-12), profile), null);
});

test("a sustained run fires, reports its true onset and a per-day delta", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  const samples = history({ end, hours: 24 * 14, base: 2_000_000 });
  const profile = profileFromCells(buildProfile(samples));
  // Six hours of +$1.00/hr on top of a $2.00/hr baseline.
  const withSpike = samples.map((s, i) =>
    i >= samples.length - 6 ? { ts: s.ts, micros: s.micros + 1_000_000 } : s,
  );
  const verdict = detect(withSpike.slice(-24), profile);
  assert.ok(verdict, "expected the sustained run to fire");
  assert.equal(verdict.hoursSustained, 6);
  assert.equal(verdict.startedAt.getTime(), withSpike[withSpike.length - 6].ts.getTime());
  // ≈ $1/hr × 24 = $24/day, allowing for the deterministic jitter.
  assert.ok(verdict.deltaPerDayMicros > 22_000_000, `${verdict.deltaPerDayMicros}`);
  assert.ok(verdict.deltaPerDayMicros < 26_000_000, `${verdict.deltaPerDayMicros}`);
  assert.ok(verdict.baselinePerDayMicros > 45_000_000);
  assert.ok(verdict.excessMicros > 5_500_000);
});

test("a spike that already ended is history, not an open anomaly", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  const samples = history({ end, hours: 24 * 14, base: 2_000_000 });
  const profile = profileFromCells(buildProfile(samples));
  const withPastSpike = samples.map((s, i) =>
    i >= samples.length - 12 && i < samples.length - 4
      ? { ts: s.ts, micros: s.micros + 5_000_000 }
      : s,
  );
  assert.equal(detect(withPastSpike.slice(-24), profile), null);
});

test("cheap noise is below the dollar floor even when it doubles", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  // $0.02/hr baseline — doubling it is $0.48/day, under the $5/day floor.
  const samples = history({ end, hours: 24 * 14, base: 20_000 });
  const profile = profileFromCells(buildProfile(samples));
  const doubled = samples.map((s, i) =>
    i >= samples.length - 8 ? { ts: s.ts, micros: s.micros * 2 } : s,
  );
  assert.equal(detect(doubled.slice(-24), profile), null);
});

test("the threshold blends a relative floor, sigma and an absolute floor", () => {
  const flat = { dow: 2, hour: 14, medianMicros: 10_000_000, sigmaMicros: 0, samples: 10 };
  // σ = 0, so the 20% relative floor decides: $10/hr → $12/hr.
  assert.equal(hourThreshold(flat, DEFAULT_DETECTOR), 12_000_000);
  const noisy = { ...flat, sigmaMicros: 2_000_000 };
  // 3σ = $6/hr beats the 20% floor.
  assert.equal(hourThreshold(noisy, DEFAULT_DETECTOR), 16_000_000);
  const tiny = { ...flat, medianMicros: 1_000, sigmaMicros: 0 };
  // Both relative floors are pennies, so the $5/day absolute floor decides.
  assert.equal(hourThreshold(tiny, DEFAULT_DETECTOR), 1_000 + 5_000_000 / 24);
});

test("an hour with no baseline cell never fires and never resolves", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  const samples = history({ end, hours: 24, base: 2_000_000 });
  const empty = profileFromCells([]);
  assert.equal(detect(samples, empty), null);
  assert.equal(shouldResolve(samples, empty), false);
});

test("resolution needs six clean hours, not one", () => {
  const end = floorHour(new Date("2026-07-14T12:00:00Z"));
  const samples = history({ end, hours: 24 * 14, base: 2_000_000 });
  const profile = profileFromCells(buildProfile(samples));
  assert.equal(shouldResolve(samples.slice(-8), profile), true);

  const stillHot = samples.map((s, i) =>
    i >= samples.length - 3 ? { ts: s.ts, micros: s.micros + 5_000_000 } : s,
  );
  assert.equal(shouldResolve(stillHot.slice(-8), profile), false);

  const justCooled = samples.map((s, i) =>
    i >= samples.length - 8 && i < samples.length - 1
      ? { ts: s.ts, micros: s.micros + 5_000_000 }
      : s,
  );
  assert.equal(shouldResolve(justCooled.slice(-8), profile), false);
});

test("correlation is one-sided: a deploy after the onset cannot be the cause", () => {
  const onset = new Date("2026-07-14T14:00:00Z");
  const before = { id: "d1", serviceName: "api-server", sha: "9f3c2ab", deployedAt: new Date(onset.getTime() - 2 * HOUR) };
  const after = { id: "d2", serviceName: "api-server", sha: "aaaa111", deployedAt: new Date(onset.getTime() + 1 * HOUR) };
  const tooOld = { id: "d3", serviceName: "worker", sha: "bbbb222", deployedAt: new Date(onset.getTime() - 30 * HOUR) };

  assert.equal(correlateDeploy(onset, [after, tooOld])?.id, undefined);
  assert.equal(correlateDeploy(onset, [before, after, tooOld])?.id, "d1");
  // The closest deploy before onset wins, not the first one found.
  const closer = { id: "d4", serviceName: "api-server", sha: "cccc333", deployedAt: new Date(onset.getTime() - 30 * 60_000) };
  assert.equal(correlateDeploy(onset, [before, closer])?.id, "d4");
  assert.equal(correlateDeploy(onset, []), null);
});

test("lead time reads in minutes then hours", () => {
  const onset = new Date("2026-07-14T14:00:00Z");
  assert.equal(leadTimeLabel(new Date(onset.getTime() - 12 * 60_000), onset), "12m before onset");
  assert.equal(leadTimeLabel(new Date(onset.getTime() - 2 * HOUR), onset), "2h before onset");
  assert.equal(leadTimeLabel(onset, onset), "0m before onset");
});

test("contributors are dollar-ranked and capped", () => {
  const ranked = rankContributors(
    [
      { label: "a", amountMicros: 100 },
      { label: "b", amountMicros: 900 },
      { label: "c", amountMicros: 500 },
      { label: "d", amountMicros: 700 },
      { label: "e", amountMicros: 300 },
    ],
    3,
  );
  assert.deepEqual(ranked.map((r) => r.label), ["b", "d", "c"]);
});

test("the live counter is derived as of now, never stored", () => {
  const onset = new Date("2026-07-14T14:00:00Z");
  // $240/day for 9 hours = $90.
  assert.equal(excessSince(onset, 240_000_000, new Date(onset.getTime() + 9 * HOUR)), 90_000_000);
  assert.equal(excessSince(onset, 240_000_000, onset), 0);
  // Clock skew must not produce a negative counter.
  assert.equal(excessSince(onset, 240_000_000, new Date(onset.getTime() - HOUR)), 0);
});
