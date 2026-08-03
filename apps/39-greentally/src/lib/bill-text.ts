/**
 * Reading a utility bill out of text.
 *
 * This is the deterministic half of extraction: given the text a PDF carried (or a
 * pasted bill), find the provider, the service period, and the quantity with its
 * unit. It runs first, always, and its output is what a model call is measured
 * against.
 *
 * The rule that shapes every function here: **a field that cannot be read is null,
 * never a guess.** A bill with an unreadable period is worth more to the operator as
 * a review item than as a confident number filed into the wrong month. Confidence is
 * basis points and is earned by the *specificity of the match* — a labelled
 * "Total kWh used" line scores higher than a bare number followed by "kWh", which
 * scores higher than a number that merely sits near one.
 */

import type { ActivityCategory } from "@/db/schema";
import { convertToCanonical, normalizeUnitKey } from "@/lib/units";

export interface ReadField<T> {
  value: T;
  /** Basis points, 0–10 000. */
  confidenceBp: number;
  /** The text this was read from, shown in the review panel. */
  evidence: string;
}

export interface BillReading {
  provider: ReadField<string> | null;
  category: ReadField<ActivityCategory> | null;
  quantity: ReadField<{ quantity: number; unit: string }> | null
  ;
  period: ReadField<{ start: string; end: string }> | null;
  serviceAddress: string | null;
}

/* ------------------------------------------------------------------ dates --- */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parse one date in the formats a bill actually prints.
 *
 * `MM/DD/YYYY` is assumed for US-style slashed dates; a slashed date whose first
 * component exceeds 12 is read as `DD/MM/YYYY`. Ambiguous ones (03/04/2025) are
 * returned with a lower confidence by the caller — this is exactly the field that
 * must reach a human when the bill is not explicit.
 */
export type SlashOrder = "mdy" | "dmy";

/**
 * The ordering a slashed date proves on its own, or null when it proves nothing.
 * `03/31/2025` proves month-first; `31/03/2025` proves day-first; `03/04/2025` proves
 * neither and has to be resolved from context or reviewed by a person.
 */
export function slashOrder(raw: string): SlashOrder | null {
  const m = /^(\d{1,2})[/](\d{1,2})[/](\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a > 12 && b <= 12) return "dmy";
  if (b > 12 && a <= 12) return "mdy";
  return null;
}

export function parseBillDate(
  raw: string,
  order?: SlashOrder,
): { iso: string; ambiguous: boolean } | null {
  const s = raw.trim().replace(/,/g, " ").replace(/\s+/g, " ");

  // 2025-03-01
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const v = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    return v ? { iso: v, ambiguous: false } : null;
  }

  // Mar 1 2025 / March 1 2025
  m = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (!mon) return null;
    const v = iso(Number(m[3]), mon, Number(m[2]));
    return v ? { iso: v, ambiguous: false } : null;
  }

  // 1 March 2025
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]{3,9})\.? (\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (!mon) return null;
    const v = iso(Number(m[3]), mon, Number(m[1]));
    return v ? { iso: v, ambiguous: false } : null;
  }

  // 03/01/2025 or 03/01/25
  m = /^(\d{1,2})[/](\d{1,2})[/](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const own = slashOrder(s);
    // The date's own evidence beats a hint; a hint beats nothing; US convention is the
    // last resort and is reported as ambiguous so a human can check it.
    const decided = own ?? order ?? null;
    if (decided === "dmy") {
      const v = iso(yr, b, a);
      return v ? { iso: v, ambiguous: false } : null;
    }
    if (decided === "mdy") {
      const v = iso(yr, a, b);
      return v ? { iso: v, ambiguous: false } : null;
    }
    const v = iso(yr, a, b);
    return v ? { iso: v, ambiguous: true } : null;
  }

  return null;
}

/**
 * Note the year alternation order: `\d{4}` has to be tried before `\d{2}`, because
 * regex alternation is ordered and `(?:\d{2}|\d{4})` happily matches the first two
 * digits of 2025 and hands back the year 20.
 */
const DATE_PATTERN =
  "(\\d{4}-\\d{1,2}-\\d{1,2}|[A-Za-z]{3,9}\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}|\\d{1,2}(?:st|nd|rd|th)? [A-Za-z]{3,9}\\.? \\d{4}|\\d{1,2}/\\d{1,2}/(?:\\d{4}|\\d{2})(?!\\d))";

const PERIOD_LABELS =
  "(?:service period|billing period|statement period|service dates|billing dates|period covered|usage period|read dates|meter read(?:ing)? period|for service from|service from)";

export function readPeriod(text: string): ReadField<{ start: string; end: string }> | null {
  const sep = "(?:\\s*(?:-|–|—|to|through|thru|until|until)\\s*)";

  // A labelled range is the strongest signal a bill offers.
  const labelled = new RegExp(`${PERIOD_LABELS}[^\\n]{0,24}?${DATE_PATTERN}${sep}${DATE_PATTERN}`, "i");
  let m = labelled.exec(text);
  let confidence = 9_800;

  if (!m) {
    // An unlabelled range on its own line — common on gas bills.
    const bare = new RegExp(`(?:^|\\n)[^\\n]{0,20}${DATE_PATTERN}${sep}${DATE_PATTERN}`, "i");
    m = bare.exec(text);
    confidence = 8_200;
  }
  if (!m) return null;

  let a = parseBillDate(m[1]);
  let b = parseBillDate(m[2]);
  if (!a || !b) return null;

  /**
   * A range disambiguates itself. "08/01/2025 to 08/31/2025" has an unambiguous second
   * endpoint — 31 cannot be a month — which fixes the ordering convention for the first,
   * and a human reads it that way without hesitating. Without this, every US gas bill with
   * a slashed range landed in the review queue at 64% with both dates read correctly.
   */
  const aOrder = slashOrder(m[1]);
  const bOrder = slashOrder(m[2]);
  if (a.ambiguous && bOrder) {
    const fixed = parseBillDate(m[1], bOrder);
    if (fixed) a = fixed;
  }
  if (b.ambiguous && aOrder) {
    const fixed = parseBillDate(m[2], aOrder);
    if (fixed) b = fixed;
  }

  if (b.iso <= a.iso) return null;
  if (a.ambiguous || b.ambiguous) confidence = Math.min(confidence, 6_400);

  return {
    value: { start: a.iso, end: b.iso },
    confidenceBp: confidence,
    evidence: m[0].trim().replace(/\s+/g, " ").slice(0, 120),
  };
}

/* --------------------------------------------------------------- quantity --- */

/** Unit spellings a bill prints, mapped to the category they imply. */
const UNIT_CATEGORY: { pattern: RegExp; unit: string; category: ActivityCategory }[] = [
  { pattern: /\bkwh\b|\bkw\.?h\b|kilowatt[- ]?hours?/i, unit: "kWh", category: "electricity_kwh" },
  { pattern: /\bmwh\b|megawatt[- ]?hours?/i, unit: "MWh", category: "electricity_kwh" },
  { pattern: /\btherms?\b|\bthm\b/i, unit: "therms", category: "natural_gas_kwh" },
  { pattern: /\bccf\b|\bhcf\b|hundred cubic feet/i, unit: "CCF", category: "natural_gas_kwh" },
  { pattern: /\bmcf\b/i, unit: "MCF", category: "natural_gas_kwh" },
  { pattern: /\bdth\b|\bmmbtu\b/i, unit: "MMBtu", category: "natural_gas_kwh" },
  { pattern: /cubic met(?:re|er)s?|\bm3\b|\bm³\b/i, unit: "m³", category: "natural_gas_kwh" },
];

const NUM = "([0-9][0-9,\\.]*)";

function toNumber(raw: string): number | null {
  // "4,182" and "4.182,5" both appear in the wild; commas as thousands separators are
  // what a US or UK bill prints, and that is the only form accepted here. Anything
  // else is left for a human.
  if (!/^[0-9][0-9,]*(\.[0-9]+)?$/.test(raw)) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Find the billed quantity.
 *
 * Order matters: a labelled total ("Total kWh used", "Electricity you used") beats a
 * number adjacent to a unit, which beats a unit adjacent to a number. The first
 * match wins and carries the confidence of the pattern that found it.
 */
export function readQuantity(
  text: string,
): { field: ReadField<{ quantity: number; unit: string }>; category: ActivityCategory } | null {
  const lines = text.split("\n");

  const labelled = [
    { re: /(?:total|billed|metered)\s+(?:usage|consumption|kwh|energy)[^0-9\n]{0,20}/i, bp: 9_700 },
    { re: /(?:kwh|therms?|ccf|mcf|m³|m3)\s+(?:used|usage|consumed|billed|delivered)[^0-9\n]{0,20}/i, bp: 9_700 },
    // "Gas used 812 therms" / "Electricity you used 4,182 kWh" — the commonest phrasing on
    // a US utility bill, and without it every gas bill fell one rung below the
    // auto-accept threshold and filled the review queue with readings that were right.
    { re: /(?:gas|electricity|energy|fuel)\s+(?:you\s+)?(?:used|usage|consumed|delivered)[^0-9\n]{0,20}/i, bp: 9_700 },
    { re: /(?:you used|usage this period|total (?:gas|electricity|energy))[^0-9\n]{0,24}/i, bp: 9_500 },
  ];

  for (const { re, bp } of labelled) {
    for (const line of lines) {
      const at = re.exec(line);
      if (!at) continue;
      const after = line.slice(at.index + at[0].length);
      const numMatch = new RegExp(`^\\s*${NUM}\\s*([A-Za-z³]*)`).exec(after);
      if (!numMatch) continue;
      const qty = toNumber(numMatch[1]);
      if (qty === null) continue;
      const unitFromLine = unitIn(numMatch[2]) ?? unitIn(line);
      if (!unitFromLine) continue;
      return {
        field: {
          value: { quantity: qty, unit: unitFromLine.unit },
          confidenceBp: bp,
          evidence: line.trim().slice(0, 120),
        },
        category: unitFromLine.category,
      };
    }
  }

  // "4,182 kWh" anywhere on a line.
  for (const line of lines) {
    for (const { pattern, unit, category } of UNIT_CATEGORY) {
      const re = new RegExp(`${NUM}\\s*(?:${pattern.source})`, "i");
      const m = re.exec(line);
      if (!m) continue;
      const qty = toNumber(m[1]);
      if (qty === null || qty === 0) continue;
      // A rate line ("$0.1183 per kWh") is not a quantity.
      if (/\bper\b|\brate\b|\/\s*kwh|\$/i.test(line) && qty < 100) continue;
      return {
        field: {
          value: { quantity: qty, unit },
          confidenceBp: 8_800,
          evidence: line.trim().slice(0, 120),
        },
        category,
      };
    }
  }

  return null;
}

function unitIn(s: string): { unit: string; category: ActivityCategory } | null {
  for (const { pattern, unit, category } of UNIT_CATEGORY) {
    if (pattern.test(s)) return { unit, category };
  }
  return null;
}

/* --------------------------------------------------------------- provider --- */

/**
 * Utility providers seen often enough to name with confidence. Everything else falls
 * back to the first substantial line of the bill, at a confidence that sends the
 * field to review — the provider name is what the duplicate check keys on, so a
 * wrong one is worth catching.
 */
const KNOWN_PROVIDERS = [
  "Consolidated Edison",
  "Con Edison",
  "National Grid",
  "Pacific Gas and Electric",
  "PG&E",
  "Southern California Edison",
  "Duke Energy",
  "Dominion Energy",
  "Georgia Power",
  "Alabama Power",
  "Florida Power & Light",
  "Xcel Energy",
  "Ameren",
  "DTE Energy",
  "Consumers Energy",
  "CenterPoint Energy",
  "Peoples Gas",
  "Nicor Gas",
  "Southwest Gas",
  "Baltimore Gas and Electric",
  "PSE&G",
  "Public Service Electric and Gas",
  "Eversource Energy",
  "Eversource",
  "Austin Energy",
  "Salt River Project",
  "Puget Sound Energy",
  "Portland General Electric",
  "Seattle City Light",
  "British Gas",
  "Octopus Energy",
  "EDF Energy",
  "Scottish Power",
  "SSE Business Energy",
];

export function readProvider(text: string): ReadField<string> | null {
  for (const name of KNOWN_PROVIDERS) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const m = re.exec(text);
    if (m) {
      return { value: name, confidenceBp: 9_900, evidence: m[0] };
    }
  }
  const first = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length >= 4 && l.length <= 60 && /[A-Za-z]{3}/.test(l) && !/^\d/.test(l));
  if (!first) return null;
  return { value: first, confidenceBp: 5_200, evidence: first.slice(0, 120) };
}

/* ---------------------------------------------------------------- address --- */

export function readServiceAddress(text: string): string | null {
  const m = /(?:service address|service location|premises|supply address)[:\s]+([^\n]{6,80})/i.exec(
    text,
  );
  return m ? m[1].trim() : null;
}

/* ----------------------------------------------------------------- reading --- */

/** Fuel-receipt categories, keyed off words a fuel receipt prints. */
const FUEL_HINTS: { re: RegExp; category: ActivityCategory }[] = [
  { re: /\bdiesel\b|\bdyed diesel\b|\bDEF\b/i, category: "diesel_l" },
  { re: /\bunleaded\b|\bgasoline\b|\bpetrol\b|\bregular gas\b/i, category: "petrol_l" },
  { re: /\bheating oil\b|\bkerosene\b|\bgas oil\b/i, category: "heating_oil_l" },
  { re: /\bpropane\b|\bLPG\b/i, category: "propane_l" },
];

export function readFuelQuantity(
  text: string,
): { field: ReadField<{ quantity: number; unit: string }>; category: ActivityCategory } | null {
  const hint = FUEL_HINTS.find((h) => h.re.test(text));
  if (!hint) return null;
  const unitWord = "(gal(?:lon)?s?|l|litres?|liters?)";
  // Both orders appear on receipts: "486.4 gallons" and "Total gallons 486.4".
  const numberFirst = new RegExp(`${NUM}\\s*\\b${unitWord}\\b`, "i");
  // `\b` on both sides matters: without it the bare `l` alternative matches the "l"
  // inside "Total" and a receipt in gallons is read as litres — a 3.8x understatement.
  const unitFirst = new RegExp(`\\b${unitWord}\\b[^0-9\\n]{0,12}${NUM}`, "i");
  for (const line of text.split("\n")) {
    for (const [re, numIdx, unitIdx] of [
      [numberFirst, 1, 2],
      [unitFirst, 2, 1],
    ] as const) {
      const m = re.exec(line);
      if (!m) continue;
      const qty = toNumber(m[numIdx]);
      if (qty === null || qty === 0) continue;
      const unit = normalizeUnitKey(m[unitIdx]).startsWith("gal") ? "US gal" : "L";
      return {
        field: {
          value: { quantity: qty, unit },
          confidenceBp: 9_100,
          evidence: line.trim().slice(0, 120),
        },
        category: hint.category,
      };
    }
  }
  return null;
}

/**
 * Read a whole bill from text. Every field is independently nullable, and the
 * document's own confidence is the *minimum* across the fields that matter — one
 * unreadable field is enough to require a human, which is the whole point.
 */
export function readBillText(text: string): BillReading {
  const clean = text.replace(/\r\n?/g, "\n");
  const energy = readQuantity(clean);
  const fuel = energy ? null : readFuelQuantity(clean);
  const found = energy ?? fuel;
  return {
    provider: readProvider(clean),
    category: found
      ? { value: found.category, confidenceBp: found.field.confidenceBp, evidence: found.field.evidence }
      : null,
    quantity: found?.field ?? null,
    period: readPeriod(clean),
    serviceAddress: readServiceAddress(clean),
  };
}

/** True when the reading is complete enough to be worth converting at all. */
export function readingIsUsable(r: BillReading): boolean {
  if (!r.quantity || !r.category || !r.period) return false;
  return (
    convertToCanonical(r.category.value, r.quantity.value.quantity, r.quantity.value.unit) !== null
  );
}
