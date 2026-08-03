/**
 * Anomaly detection: sustained deviation above a seasonal baseline, with a
 * dollar floor and a deploy correlation window.
 *
 * The two failure modes this is written against:
 *
 * - **Alerting on one noisy hour.** A single hour above threshold is not an
 *   incident; AWS's own hourly cost data is jittery and arrives late. So a run of
 *   `minHours` consecutive hours must all be above threshold, and the run must
 *   end at the most recent complete hour — a spike that already ended is history,
 *   not an open anomaly.
 * - **Alerting on cheap noise.** A lab account whose $0.30/day Lambda bill
 *   doubles is not worth a Slack message at 3am. The dollar floor is absolute,
 *   not relative.
 *
 * Pure module: samples and a profile in, a verdict out. No db, no clock beyond
 * what the caller passes.
 */

import { profileKey, type BaselineCell, type HourSample, type ProfileKey } from "@/lib/baseline";

export interface DetectorConfig {
  /** Robust-σ multiple a single hour must clear. */
  z: number;
  /** Consecutive hours required, ending at the latest sample. */
  minHours: number;
  /** Minimum dollar impact, as micro-dollars per day. */
  minDeltaPerDayMicros: number;
  /**
   * Relative floor: an hour must also exceed the baseline by this fraction. It
   * covers the case where a service is so steady that σ ≈ 0 and a 2% wobble
   * would otherwise clear `z · σ`.
   */
  minRelative: number;
  /** Consecutive in-band hours needed before an open anomaly resolves. */
  resolveHours: number;
  /** How far back to look for a deploy that could explain the onset. */
  correlationWindowHours: number;
}

export const DEFAULT_DETECTOR: DetectorConfig = {
  z: 3,
  minHours: 4,
  minDeltaPerDayMicros: 5_000_000, // $5/day
  minRelative: 0.2,
  resolveHours: 6,
  correlationWindowHours: 6,
};

/** The threshold one hour has to clear, given its seasonal cell. */
export function hourThreshold(cell: BaselineCell, config: DetectorConfig): number {
  const relative = cell.medianMicros * config.minRelative;
  const statistical = cell.sigmaMicros * config.z;
  const absolute = config.minDeltaPerDayMicros / 24;
  return cell.medianMicros + Math.max(relative, statistical, absolute);
}

export interface Verdict {
  firing: boolean;
  /** First hour of the sustained run. */
  startedAt: Date;
  /** Mean hourly excess over the run, projected to a day. */
  deltaPerDayMicros: number;
  /** The baseline the run is being judged against, projected to a day. */
  baselinePerDayMicros: number;
  /** Total excess accumulated over the run. */
  excessMicros: number;
  hoursSustained: number;
}

/**
 * Evaluate one (account, service, region) series.
 *
 * `hours` must be ascending, complete hours only, with legitimate zeros present.
 * The most recent hour is treated as "now"; the caller is responsible for not
 * passing the current, still-accruing hour, which would always look like a dip.
 */
export function detect(
  hours: HourSample[],
  profile: Map<ProfileKey, BaselineCell>,
  config: DetectorConfig = DEFAULT_DETECTOR,
): Verdict | null {
  if (hours.length < config.minHours) return null;

  // Walk backwards from the latest hour while every hour is above threshold.
  let runStart = hours.length;
  let excess = 0;
  let baselineTotal = 0;
  for (let i = hours.length - 1; i >= 0; i--) {
    const sample = hours[i];
    const cell = profile.get(profileKey(sample.ts.getUTCDay(), sample.ts.getUTCHours()));
    if (!cell) break;
    if (sample.micros <= hourThreshold(cell, config)) break;
    runStart = i;
    excess += sample.micros - cell.medianMicros;
    baselineTotal += cell.medianMicros;
  }

  const hoursSustained = hours.length - runStart;
  if (hoursSustained < config.minHours) return null;

  const deltaPerDay = Math.round((excess / hoursSustained) * 24);
  if (deltaPerDay < config.minDeltaPerDayMicros) return null;

  return {
    firing: true,
    startedAt: hours[runStart].ts,
    deltaPerDayMicros: deltaPerDay,
    baselinePerDayMicros: Math.round((baselineTotal / hoursSustained) * 24),
    excessMicros: Math.round(excess),
    hoursSustained,
  };
}

/**
 * Has an open anomaly recovered? Requires `resolveHours` consecutive in-band
 * hours at the tail. Deliberately stricter than "the last hour looks fine",
 * because AWS backfills hourly data and the freshest hour is the least reliable.
 */
export function shouldResolve(
  hours: HourSample[],
  profile: Map<ProfileKey, BaselineCell>,
  config: DetectorConfig = DEFAULT_DETECTOR,
): boolean {
  if (hours.length < config.resolveHours) return false;
  const tail = hours.slice(-config.resolveHours);
  for (const sample of tail) {
    const cell = profile.get(profileKey(sample.ts.getUTCDay(), sample.ts.getUTCHours()));
    // No baseline for that hour means no opinion — never resolve on ignorance.
    if (!cell) return false;
    if (sample.micros > hourThreshold(cell, config)) return false;
  }
  return true;
}

export interface DeployMarker {
  id: string;
  serviceName: string;
  sha: string;
  deployedAt: Date;
}

/**
 * The deploy most likely to explain an onset: the latest one inside
 * [onset − window, onset]. A deploy *after* the spike began cannot have caused
 * it, and saying so anyway is the kind of confident wrong answer that costs
 * trust — so the window is one-sided.
 */
export function correlateDeploy(
  startedAt: Date,
  deploys: DeployMarker[],
  config: DetectorConfig = DEFAULT_DETECTOR,
): DeployMarker | null {
  const windowStart = startedAt.getTime() - config.correlationWindowHours * 3_600_000;
  let best: DeployMarker | null = null;
  for (const deploy of deploys) {
    const at = deploy.deployedAt.getTime();
    if (at > startedAt.getTime() || at < windowStart) continue;
    if (!best || at > best.deployedAt.getTime()) best = deploy;
  }
  return best;
}

/** "2h before onset" / "12m before onset" — the probable-cause sentence. */
export function leadTimeLabel(deployedAt: Date, startedAt: Date): string {
  const minutes = Math.max(0, Math.round((startedAt.getTime() - deployedAt.getTime()) / 60_000));
  if (minutes < 90) return `${minutes}m before onset`;
  return `${Math.round(minutes / 60)}h before onset`;
}

/** Dollar-rank contributors and keep the ones worth naming. */
export function rankContributors<T extends { amountMicros: number }>(
  lines: T[],
  limit = 4,
): T[] {
  return [...lines].sort((a, b) => b.amountMicros - a.amountMicros).slice(0, limit);
}

/**
 * The live "$127 since Tue 14:00" counter on the detail screen, derived as of a
 * given instant rather than read from a stored column.
 */
export function excessSince(
  startedAt: Date,
  deltaPerDayMicros: number,
  asOf: Date,
): number {
  const hours = Math.max(0, (asOf.getTime() - startedAt.getTime()) / 3_600_000);
  return Math.round((deltaPerDayMicros / 24) * hours);
}
