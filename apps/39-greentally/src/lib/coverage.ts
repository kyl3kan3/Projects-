/**
 * The coverage meter.
 *
 * Twelve cells, one per month of the reporting year. A month is **complete** when
 * every source the org has uploaded at least once covers it, **partial** when some
 * do, and **empty** when none do.
 *
 * The honest limitation, stated in the UI as well as here: coverage can only reason
 * about sources it has seen. An org that never uploads a gas bill has no gas source,
 * so its months read complete on electricity alone. The screen says
 * "counting the sources you have uploaded" for exactly this reason — a meter that
 * silently claimed completeness would be the most damaging number in the product.
 */

export interface CoverageLine {
  siteId: string;
  category: string;
  serviceStart: string;
  serviceEnd: string;
}

export type MonthState = "complete" | "partial" | "empty";

export interface CoverageMonth {
  /** "2025-03" */
  key: string;
  /** 1–12 */
  month: number;
  state: MonthState;
  present: number;
  expected: number;
  missing: string[];
}

export interface Coverage {
  months: CoverageMonth[];
  monthsComplete: number;
  monthsPartial: number;
  monthsWithData: number;
  /** Expected (site, category) pairs — the sources the org has told us about. */
  sources: { siteId: string; category: string }[];
  /** 0–100, whole percent of expected source-months present. */
  pct: number;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Last day of a month, as an ISO date. */
export function monthEnd(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

export function monthStart(year: number, month: number): string {
  return `${monthKey(year, month)}-01`;
}

function covers(line: CoverageLine, year: number, month: number): boolean {
  return line.serviceStart <= monthEnd(year, month) && monthStart(year, month) <= line.serviceEnd;
}

export function computeCoverage(
  lines: CoverageLine[],
  year: number,
  siteNames: Map<string, string> = new Map(),
  categoryLabels: Map<string, string> = new Map(),
): Coverage {
  const sourceKeys = new Set<string>();
  for (const l of lines) sourceKeys.add(`${l.siteId}::${l.category}`);
  const sources = [...sourceKeys]
    .sort()
    .map((k) => {
      const [siteId, category] = k.split("::");
      return { siteId, category };
    });

  const months: CoverageMonth[] = [];
  let present = 0;

  for (let m = 1; m <= 12; m += 1) {
    const missing: string[] = [];
    let have = 0;
    for (const s of sources) {
      const covered = lines.some(
        (l) => l.siteId === s.siteId && l.category === s.category && covers(l, year, m),
      );
      if (covered) have += 1;
      else {
        const site = siteNames.get(s.siteId) ?? "site";
        const cat = categoryLabels.get(s.category) ?? s.category;
        missing.push(`${cat} — ${site}`);
      }
    }
    present += have;
    const state: MonthState =
      sources.length > 0 && have === sources.length ? "complete" : have > 0 ? "partial" : "empty";
    months.push({ key: monthKey(year, m), month: m, state, present: have, expected: sources.length, missing });
  }

  const expectedTotal = sources.length * 12;
  return {
    months,
    monthsComplete: months.filter((m) => m.state === "complete").length,
    monthsPartial: months.filter((m) => m.state === "partial").length,
    monthsWithData: months.filter((m) => m.state !== "empty").length,
    sources,
    pct: expectedTotal === 0 ? 0 : Math.round((present / expectedTotal) * 100),
  };
}

/**
 * Split a quantity across the calendar months a service period touches, pro-rata by
 * day, with the rounding remainder given to the final month so the parts always sum
 * back to the whole. A monthly total that does not add up to the annual total is the
 * kind of thing a procurement analyst notices first.
 */
export function splitAcrossMonths(
  serviceStart: string,
  serviceEnd: string,
  amount: number,
): { key: string; amount: number }[] {
  const start = Date.parse(`${serviceStart}T00:00:00Z`);
  const end = Date.parse(`${serviceEnd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return [{ key: serviceStart.slice(0, 7), amount }];
  }
  const totalDays = Math.round((end - start) / 86_400_000) + 1;
  const buckets = new Map<string, number>();
  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(start + i * 86_400_000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const keys = [...buckets.keys()].sort();
  const out: { key: string; amount: number }[] = [];
  let assigned = 0;
  keys.forEach((key, idx) => {
    if (idx === keys.length - 1) {
      out.push({ key, amount: amount - assigned });
      return;
    }
    const share = Math.round((amount * (buckets.get(key) ?? 0)) / totalDays);
    assigned += share;
    out.push({ key, amount: share });
  });
  return out;
}
