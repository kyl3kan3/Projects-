/**
 * Cost & Usage Report parsing — the accuracy path.
 *
 * CUR is a CSV with ~200 columns whose names carry a namespace
 * (`lineItem/UnblendedCost`, `resourceTags/user:Team`). Column order is not
 * stable between report versions, so everything is resolved by header name, and
 * a missing *required* column is a hard error rather than a silently-zeroed
 * import. A cost report that quietly parses to $0 is worse than one that fails.
 *
 * Pure module: string in, cost lines out. No AWS, no db.
 */

import { dollarsToMicros } from "@/lib/money";
import { floorHour } from "@/lib/dates";
import type { CostLine } from "./provider";

export interface CurParseResult {
  lines: CostLine[];
  /** Rows read, rows that produced a line, and rows rejected with the reason. */
  rowsRead: number;
  rowsKept: number;
  skipped: Array<{ row: number; reason: string }>;
  /** Earliest and latest usage hour seen, so the caller knows what to replace. */
  coverage: { start: Date; end: Date } | null;
}

const REQUIRED = ["lineItem/UsageStartDate", "lineItem/UnblendedCost"] as const;

/** RFC4180-ish splitter: handles quoted fields and escaped double quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(field);
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out;
}

/**
 * `Amazon Elastic Compute Cloud` in `product/ProductName`, but some report
 * versions only carry `lineItem/ProductCode` (`AmazonEC2`). Prefer the readable
 * one, fall back to the code, and never emit an empty service name — every
 * screen groups on it.
 */
function serviceName(get: (col: string) => string): string {
  return (
    get("product/ProductName") ||
    get("lineItem/ProductCode") ||
    get("product/servicename") ||
    "Unknown service"
  );
}

export function parseCur(csv: string): CurParseResult {
  const rows = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rows.length === 0) throw new Error("CUR file was empty");

  const header = splitCsvLine(rows[0]).map((h) => h.trim());
  const index = new Map<string, number>();
  header.forEach((name, i) => index.set(name, i));
  // Tag columns are dynamic: whatever the customer tags with shows up here.
  const tagColumns = header
    .filter((h) => h.startsWith("resourceTags/user:"))
    .map((h) => ({ column: h, key: h.slice("resourceTags/user:".length) }));

  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length) {
    throw new Error(`CUR file is missing required column(s): ${missing.join(", ")}`);
  }

  const grouped = new Map<string, CostLine>();
  const skipped: Array<{ row: number; reason: string }> = [];
  let rowsKept = 0;
  let min: number | null = null;
  let max: number | null = null;

  for (let r = 1; r < rows.length; r++) {
    const cells = splitCsvLine(rows[r]);
    const get = (col: string): string => {
      const i = index.get(col);
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };

    const startRaw = get("lineItem/UsageStartDate");
    const parsed = Date.parse(startRaw);
    if (!Number.isFinite(parsed)) {
      skipped.push({ row: r, reason: `unparseable usage start "${startRaw}"` });
      continue;
    }
    const costRaw = get("lineItem/UnblendedCost");
    const cost = Number(costRaw);
    if (!Number.isFinite(cost)) {
      skipped.push({ row: r, reason: `unparseable cost "${costRaw}"` });
      continue;
    }
    const micros = dollarsToMicros(cost);
    const ts = floorHour(new Date(parsed));
    if (min === null || parsed < min) min = ts.getTime();
    if (max === null || parsed > max) max = ts.getTime();
    // Credits and refunds are legitimate zero/negative lines; a zero row carries
    // no information for us, a negative one does.
    if (micros === 0) continue;

    const tags: Record<string, string> = {};
    for (const { column, key } of tagColumns) {
      const value = get(column);
      if (value) tags[key] = value;
    }

    const line: CostLine = {
      ts,
      service: serviceName(get),
      region: get("product/region") || get("lineItem/AvailabilityZone").slice(0, -1) || "global",
      usageType: get("lineItem/UsageType") || "all",
      resourceId: get("lineItem/ResourceId") || null,
      amountMicros: micros,
      tags: Object.keys(tags).length ? tags : undefined,
    };

    // Many CUR rows share one grain (per-hour, per-resource, split by pricing
    // term). Sum them here so the caller does one insert per grain.
    const key = [
      line.ts.toISOString(),
      line.service,
      line.region,
      line.usageType,
      line.resourceId ?? "",
      JSON.stringify(line.tags ?? {}),
    ].join("|");
    const existing = grouped.get(key);
    if (existing) existing.amountMicros += line.amountMicros;
    else grouped.set(key, line);
    rowsKept++;
  }

  return {
    lines: [...grouped.values()],
    rowsRead: rows.length - 1,
    rowsKept,
    skipped,
    coverage:
      min !== null && max !== null
        ? { start: new Date(min), end: new Date(max + 3_600_000) }
        : null,
  };
}
