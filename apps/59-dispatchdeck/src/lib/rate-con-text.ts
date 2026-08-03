/**
 * src/lib/rate-con-text.ts
 *
 * The rate confirmation reader that does not need a model.
 *
 * A broker rate con is unstructured but not unstructured *randomly*: there are
 * maybe a dozen layouts in circulation, and all of them label the rate, print
 * an MC number, and put the shipper above the receiver. This walks the text and
 * pulls out what it can find, scoring each field so the review screen can
 * underline what it is unsure about.
 *
 * It is the deterministic implementation behind the extractor interface in
 * `parse.ts` — the one used when no `ANTHROPIC_API_KEY` is present, and the one
 * the tests exercise. Every hard part of the pipeline (assembling the draft,
 * scoring, deciding whether one tap is enough, failing honestly) is therefore
 * testable without a network call.
 *
 * Pure: text in, extraction out.
 */

import type { ExtractedRateCon } from "@/db/schema";
import { parseDollarsToCents } from "@/lib/money";
import { isJurisdiction } from "@/lib/jurisdictions";

export interface ExtractionScore {
  extraction: ExtractedRateCon;
  /** 0–100 overall. At or above 80 the draft is offered for one-tap confirm. */
  confidence: number;
}

/** Under this, review mode opens with the document alongside the fields. */
export const CONFIDENCE_THRESHOLD = 80;

const PICKUP_HEADINGS = /^(pick\s?-?up|pickup|shipper|origin|loading|consignor)\b/i;
const DELIVERY_HEADINGS = /^(deliver(y|ies)?|consignee|receiver|destination|drop|unload)\b/i;
const CITY_STATE = /([A-Z][A-Za-z.'\- ]{1,28}),\s*([A-Z]{2})\b(?:\s*,?\s*(\d{5}))?/;
const COMPANY_SUFFIX =
  /\b(llc|l\.l\.c\.?|inc|inc\.|incorporated|corp|corporation|co\.|company|logistics|freight|transport(ation)?|brokerage|carriers?|group|lines|express|trucking)\b/i;

export function extractFromText(rawText: string): ExtractionScore {
  const text = rawText.replace(/\r\n?/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const fieldConfidence: Record<string, number> = {};

  const brokerMc = findMcNumber(text);
  if (brokerMc) fieldConfidence.brokerMc = 92;

  const broker = findBroker(lines);
  if (broker) fieldConfidence.broker = broker.score;

  const rate = findRate(text);
  if (rate) fieldConfidence.rateCents = rate.score;

  const miles = findMiles(text);
  if (miles !== null) fieldConfidence.totalMiles = 80;

  const equipment = findEquipment(text);
  if (equipment) fieldConfidence.equipment = 85;

  const references = findReferences(text);
  if (references.length > 0) fieldConfidence.references = 75;

  const stops = findStops(lines);
  if (stops.stops.length > 0) fieldConfidence.stops = stops.score;

  const extraction: ExtractedRateCon = {
    broker: broker?.name ?? null,
    brokerMc,
    rateCents: rate?.cents ?? null,
    totalMiles: miles,
    equipment,
    references,
    stops: stops.stops,
    fieldConfidence,
    source: "heuristic",
    failureReason: null,
  };

  return { extraction, confidence: scoreOverall(extraction) };
}

/**
 * The overall score. Weighted on what the load record cannot be built without:
 * a rate, at least one pickup and one delivery, and somebody to bill. Missing
 * either of the first two caps the score well below the one-tap threshold, so a
 * half-read document always opens in review.
 */
export function scoreOverall(extraction: ExtractedRateCon): number {
  const fc = extraction.fieldConfidence ?? {};
  const rate = extraction.rateCents ? (fc.rateCents ?? 60) : 0;
  const stopList = extraction.stops ?? [];
  const hasPickup = stopList.some((s) => s.kind === "pickup");
  const hasDelivery = stopList.some((s) => s.kind === "delivery");
  const stops = hasPickup && hasDelivery ? (fc.stops ?? 60) : stopList.length > 0 ? 40 : 0;
  const broker = extraction.broker ? (fc.broker ?? 60) : 0;

  const weighted = Math.round(rate * 0.4 + stops * 0.38 + broker * 0.22);
  if (!extraction.rateCents || !hasPickup || !hasDelivery) return Math.min(weighted, 55);
  return Math.max(0, Math.min(100, weighted));
}

function findMcNumber(text: string): string | null {
  // "MC# 812445", "MC 812445", "MC Number: 812445". Deliberately not a bare
  // 6-digit number: a zip code or a load number would match that.
  const m = /\bMC\s*(?:#|no\.?|number)?\s*:?\s*(\d{5,8})\b/i.exec(text);
  return m ? m[1] : null;
}

function findBroker(lines: string[]): { name: string; score: number } | null {
  // An explicit label beats a guess from the letterhead.
  for (const line of lines.slice(0, 40)) {
    const m = /^(?:broker|brokered by|customer)\s*:?\s*(.{3,60})$/i.exec(line);
    if (m && !/^\s*$/.test(m[1])) return { name: tidy(m[1]), score: 90 };
  }
  // Otherwise: the first company-shaped line in the letterhead, skipping the
  // carrier's own name if it is labelled.
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    if (/^carrier\b/i.test(line)) continue;
    if (line.length < 4 || line.length > 60) continue;
    if (!COMPANY_SUFFIX.test(line)) continue;
    if (/rate\s+confirmation|load\s+confirmation/i.test(line)) continue;
    return { name: tidy(line), score: i < 3 ? 78 : 62 };
  }
  return null;
}

interface RateHit {
  cents: number;
  score: number;
}

function findRate(text: string): RateHit | null {
  const labels: Array<{ pattern: RegExp; score: number }> = [
    { pattern: /\b(?:total\s+(?:carrier\s+)?rate|agreed\s+rate|carrier\s+pay|total\s+pay|total\s+amount|amount\s+payable)\b/i, score: 95 },
    { pattern: /\b(?:line\s?haul(?:\s+rate)?|linehaul|flat\s+rate|freight\s+charge)\b/i, score: 86 },
    { pattern: /\brate\b/i, score: 74 },
    { pattern: /\btotal\b/i, score: 68 },
  ];

  for (const { pattern, score } of labels) {
    for (const line of text.split("\n")) {
      if (!pattern.test(line)) continue;
      const amount = lastAmountIn(line);
      if (amount !== null && amount > 0) return { cents: amount, score };
    }
  }

  // Last resort: the largest dollar figure on the page. Plausible — the total
  // rate usually is — but scored low enough that review always opens.
  const all = [...text.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)]
    .map((m) => parseDollarsToCents(m[1]))
    .filter((c): c is number => c !== null && c > 0);
  if (all.length === 0) return null;
  return { cents: Math.max(...all), score: 45 };
}

function lastAmountIn(line: string): number | null {
  const matches = [...line.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)];
  if (matches.length === 0) {
    // "TOTAL RATE 1850.00" with no dollar sign.
    const bare = [...line.matchAll(/(?:^|\s)([\d,]{3,10}\.\d{2})(?=\s|$)/g)];
    if (bare.length === 0) return null;
    return parseDollarsToCents(bare[bare.length - 1][1]);
  }
  return parseDollarsToCents(matches[matches.length - 1][1]);
}

function findMiles(text: string): number | null {
  const m =
    /\b(?:total\s+miles|loaded\s+miles|miles|mileage)\s*:?\s*([\d,]{2,7})\b/i.exec(text) ??
    /\b([\d,]{2,7})\s*(?:total\s+)?miles\b/i.exec(text);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  // A load between 10 and 5,000 miles. Anything outside that is a phone number
  // or a zip code that happened to sit next to the word "miles".
  return Number.isFinite(value) && value >= 10 && value <= 5000 ? value : null;
}

function findEquipment(text: string): "van" | "reefer" | "flatbed" | "other" | null {
  if (/\breefer|refrigerat|temp\s?-?\s?control/i.test(text)) return "reefer";
  if (/\bflat\s?bed|step\s?deck|conestoga|rgn\b/i.test(text)) return "flatbed";
  if (/\bdry\s?van|\b53'?\s?van|\bvan\b/i.test(text)) return "van";
  return null;
}

function findReferences(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\b(?:load|order|trip|shipment)\s*(?:#|no\.?|number|id)?\s*:?\s*([A-Z0-9][A-Z0-9\-_/]{2,20})\b/gi,
    /\b(?:pro|bol|b\/l|pu|del|pickup|delivery|ref(?:erence)?|confirmation)\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][A-Z0-9\-_/]{2,20})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const value = m[1].replace(/[.,;]+$/, "").toUpperCase();
      // Reject pure words and things that are obviously not references.
      if (!/\d/.test(value)) continue;
      if (/^\d{5}$/.test(value)) continue; // a zip code
      if (value.length < 3) continue;
      found.add(value);
      if (found.size >= 6) break;
    }
  }
  return [...found];
}

interface StopHit {
  stops: NonNullable<ExtractedRateCon["stops"]>;
  score: number;
}

/**
 * Stop blocks. Headings are found first; a document with no headings falls back
 * to "first city/state is the pickup, last is the delivery", which is right
 * often enough to be useful and scored low enough to always open in review.
 */
function findStops(lines: string[]): StopHit {
  const blocks: Array<{ kind: "pickup" | "delivery"; lines: string[] }> = [];
  let current: { kind: "pickup" | "delivery"; lines: string[] } | null = null;

  for (const line of lines) {
    const stripped = line.replace(/^[#*\-–\s]+/, "");
    if (PICKUP_HEADINGS.test(stripped)) {
      current = { kind: "pickup", lines: [] };
      blocks.push(current);
      const rest = stripped.replace(PICKUP_HEADINGS, "").replace(/^[:#\s\d]+/, "").trim();
      if (rest) current.lines.push(rest);
      continue;
    }
    if (DELIVERY_HEADINGS.test(stripped)) {
      current = { kind: "delivery", lines: [] };
      blocks.push(current);
      const rest = stripped.replace(DELIVERY_HEADINGS, "").replace(/^[:#\s\d]+/, "").trim();
      if (rest) current.lines.push(rest);
      continue;
    }
    if (current && current.lines.length < 10) current.lines.push(line);
  }

  const stops: NonNullable<ExtractedRateCon["stops"]> = [];
  for (const block of blocks) {
    const parsed = parseStopBlock(block.kind, block.lines);
    if (parsed) stops.push(parsed);
  }

  if (stops.length >= 2) {
    const complete = stops.every((s) => s.windowStart);
    return { stops, score: complete ? 90 : 76 };
  }

  // Headings failed. Take the first and last city/state on the page.
  const cities: Array<{ city: string; state: string; index: number }> = [];
  lines.forEach((line, index) => {
    const m = CITY_STATE.exec(line);
    if (m && isJurisdiction(m[2])) cities.push({ city: tidy(m[1]), state: m[2], index });
  });
  if (cities.length >= 2) {
    const first = cities[0];
    const last = cities[cities.length - 1];
    return {
      stops: [
        { kind: "pickup", facility: null, city: first.city, state: first.state, windowStart: null, windowEnd: null },
        { kind: "delivery", facility: null, city: last.city, state: last.state, windowStart: null, windowEnd: null },
      ],
      score: 48,
    };
  }
  return { stops, score: stops.length > 0 ? 45 : 0 };
}

function parseStopBlock(
  kind: "pickup" | "delivery",
  blockLines: string[],
): NonNullable<ExtractedRateCon["stops"]>[number] | null {
  let city: string | null = null;
  let state: string | null = null;
  let facility: string | null = null;
  let cityLineIndex = -1;

  for (let i = 0; i < blockLines.length; i++) {
    const m = CITY_STATE.exec(blockLines[i]);
    if (m && isJurisdiction(m[2])) {
      city = tidy(m[1]);
      state = m[2].toUpperCase();
      cityLineIndex = i;
      break;
    }
  }
  if (!city || !state) return null;

  // The facility is the first line of the block that is not the address itself.
  for (let i = 0; i < Math.min(cityLineIndex + 1, blockLines.length); i++) {
    const line = blockLines[i];
    if (i === cityLineIndex) continue;
    if (/^\d/.test(line)) continue; // street address
    if (/^(date|time|window|appt|appointment|ref|pu|del|contact|phone)\b/i.test(line)) continue;
    if (line.length < 3 || line.length > 60) continue;
    facility = tidy(line);
    break;
  }

  const window = parseWindow(blockLines.join("\n"));

  return {
    kind,
    facility,
    city,
    state,
    windowStart: window.start,
    windowEnd: window.end,
  };
}

/**
 * "Date: 08/04/2026 Window: 08:00 - 12:00" and its many cousins, returned as
 * wall-time strings ("2026-08-04T08:00") without a zone. The confirm step
 * interprets them in the carrier's timezone, which is the only place that
 * knows which zone was meant.
 */
export function parseWindow(text: string): { start: string | null; end: string | null } {
  const dateMatch =
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/.exec(text) ?? /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (!dateMatch) return { start: null, end: null };

  let year: number;
  let month: number;
  let day: number;
  if (dateMatch[0].includes("-") && dateMatch[1].length === 4) {
    year = Number(dateMatch[1]);
    month = Number(dateMatch[2]);
    day = Number(dateMatch[3]);
  } else {
    month = Number(dateMatch[1]);
    day = Number(dateMatch[2]);
    year = Number(dateMatch[3]);
    if (year < 100) year += 2000;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return { start: null, end: null };

  const times = [...text.matchAll(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi)].map((m) => {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    const meridiem = m[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour: Math.min(23, hour), minute: Math.min(59, minute) };
  });

  const pad = (n: number) => String(n).padStart(2, "0");
  const dayPart = `${year}-${pad(month)}-${pad(day)}`;
  if (times.length === 0) return { start: `${dayPart}T00:00`, end: null };
  const start = `${dayPart}T${pad(times[0].hour)}:${pad(times[0].minute)}`;
  const end = times.length > 1 ? `${dayPart}T${pad(times[1].hour)}:${pad(times[1].minute)}` : null;
  return { start, end };
}

function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[|;]+$/, "")
    .replace(/^[-–:\s]+/, "")
    .trim();
}
