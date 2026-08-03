/**
 * The baseline engine — seasonality-aware, and deliberately robust.
 *
 * ROADMAP phase 1's exit criterion is "false-positive rate < 1 alert per account
 * per week", and two things drive that:
 *
 * 1. **Seasonality.** A nightly backup window at 03:00 is not an anomaly, and a
 *    weekday afternoon is not an anomaly on a service that idles at the weekend.
 *    The profile is therefore per (day-of-week × hour-of-day).
 *
 * 2. **Robust statistics, not mean and standard deviation.** Cost Explorer only
 *    serves hourly data for the last 14 days, so a (dow, hour) cell has ~2 real
 *    samples — far too few for a mean, and an ongoing incident would poison its
 *    own baseline within a day. So cells pool the *day type* (weekday vs
 *    weekend) at that hour, giving 10 and 4 samples respectively, and summarise
 *    them with the **median** and a **median absolute deviation** rather than a
 *    mean and σ. One runaway instance cannot drag a median.
 *
 * Cells are still written per (dow, hour) — the grain ARCHITECTURE.md names —
 * with weekday rows sharing a value. That keeps the detector's lookup a single
 * exact-match read.
 *
 * Pure module: no db, no clock.
 */

export interface HourSample {
  ts: Date;
  micros: number;
}

export interface BaselineCell {
  dow: number;
  hour: number;
  /** Median of the pooled samples. Stored in `baselines.mean_micros`. */
  medianMicros: number;
  /** MAD × 1.4826 — a σ-equivalent that outliers cannot move. */
  sigmaMicros: number;
  samples: number;
}

export const MAD_TO_SIGMA = 1.4826;

export function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Median absolute deviation, scaled to be comparable with a σ. */
export function robustSigma(values: number[]): number {
  if (values.length < 2) return 0;
  const m = median(values);
  return Math.round(median(values.map((v) => Math.abs(v - m))) * MAD_TO_SIGMA);
}

export type ProfileKey = string;

export function profileKey(dow: number, hour: number): ProfileKey {
  return `${dow}:${hour}`;
}

/**
 * Build the 168-cell profile from hourly samples. Samples must already be summed
 * per hour for one (account, service) pair; hours with no spend are legitimate
 * zeros and must be passed in as zero, not omitted, or an idle service would
 * look like it has no baseline at all.
 */
export function buildProfile(samples: HourSample[]): BaselineCell[] {
  // Pool by (day type, hour): weekday hours together, weekend hours together.
  const pools = new Map<string, number[]>();
  for (const s of samples) {
    const key = `${isWeekend(s.ts.getUTCDay()) ? "we" : "wd"}:${s.ts.getUTCHours()}`;
    const pool = pools.get(key);
    if (pool) pool.push(s.micros);
    else pools.set(key, [s.micros]);
  }

  const cells: BaselineCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const pool = pools.get(`${isWeekend(dow) ? "we" : "wd"}:${hour}`);
      if (!pool || pool.length === 0) continue;
      cells.push({
        dow,
        hour,
        medianMicros: median(pool),
        sigmaMicros: robustSigma(pool),
        samples: pool.length,
      });
    }
  }
  return cells;
}

export function profileFromCells(cells: BaselineCell[]): Map<ProfileKey, BaselineCell> {
  const map = new Map<ProfileKey, BaselineCell>();
  for (const cell of cells) map.set(profileKey(cell.dow, cell.hour), cell);
  return map;
}

/**
 * How much confidence the profile deserves. A service connected two days ago has
 * a profile, but not one worth alerting on; the detector requires this to be
 * true before it will open an anomaly.
 */
export function profileIsTrustworthy(cells: BaselineCell[], minSamplesPerCell = 3): boolean {
  if (cells.length < 24) return false;
  const weekdayCells = cells.filter((c) => !isWeekend(c.dow));
  if (weekdayCells.length === 0) return false;
  return weekdayCells.every((c) => c.samples >= minSamplesPerCell);
}
