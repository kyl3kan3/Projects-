/**
 * src/lib/parse.ts
 *
 * Pure parsers the connector framework is built out of: RFC 4180 CSV, RSS/Atom
 * items, dollar amounts, dates, NAICS/PSC code lists, and HTML-to-text. Kept
 * pure and dependency-light so the awkward cases — a quoted comma inside a
 * Texas ESBD title, a Virginia RSS item with a CDATA summary, "$1.2M-$3M" in a
 * Georgia registry cell — are covered by tests rather than discovered in
 * production.
 *
 * Nothing here throws on bad input. A field that cannot be parsed comes back
 * null, and the caller decides whether that makes the notice unusable. A parse
 * failure must never surface as a confident wrong answer.
 */

import { XMLParser } from "fast-xml-parser";

/* -------------------------------------------------------------------- CSV */

/**
 * RFC 4180 CSV -> rows of cells. Handles quoted fields, escaped quotes (""),
 * embedded commas and newlines, and CRLF. Blank trailing lines are dropped.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    row.push(cell);
    cell = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (input[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== "" || row.length > 0) pushRow();
  return rows;
}

/** CSV with a header row -> record objects keyed by trimmed header names. */
export function parseCsvRecords(input: string): Array<Record<string, string>> {
  const rows = parseCsv(input);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

/* -------------------------------------------------------------------- RSS */

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  guid: string;
  pubDate: string | null;
  /** Every other leaf element on the item, flattened for the field mapper. */
  fields: Record<string, string>;
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join(" ").trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Portals wrap descriptions in CDATA about half the time; both shapes have
    // to read the same or the keyword scorer sees an empty notice body.
    if ("#cdata" in record) return textOf(record["#cdata"]);
    if ("#text" in record) return textOf(record["#text"]);
    if ("@_href" in record) return textOf(record["@_href"]);
    return "";
  }
  return "";
}

/**
 * RSS 2.0 and Atom items, normalized to one shape. Unknown leaf elements are
 * kept in `fields` so a portal's custom `<naics>` or `<dueDate>` element can be
 * mapped from source config without a code change.
 */
export function parseFeedItems(xml: string): FeedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: false,
    cdataPropName: "#cdata",
    tagValueProcessor: (_name, value) => value,
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined;
  const rawItems = channel?.item ?? feed?.entry ?? [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(item)) {
        if (key.startsWith("@_")) continue;
        const text = collapse(textOf(value));
        if (text) fields[key] = text;
      }
      const title = fields.title ?? "";
      const link = fields.link ?? fields.id ?? "";
      const description = fields.description ?? fields.summary ?? fields.content ?? "";
      const guid = fields.guid ?? fields.id ?? link ?? title;
      const pubDate = fields.pubDate ?? fields.published ?? fields.updated ?? null;
      return { title, link, description, guid, pubDate, fields };
    })
    .filter((item) => item.title.length > 0 || item.guid.length > 0);
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------- HTML */

const BLOCK_TAGS = /<\/?(?:p|div|br|li|tr|h[1-6]|table|section)\b[^>]*>/gi;
const TAGS = /<[^>]+>/g;
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&sect;": "§",
};

/** HTML fragment -> readable text. Portal summaries arrive as HTML soup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(BLOCK_TAGS, "\n")
    .replace(TAGS, "")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/* ------------------------------------------------------------------ money */

/**
 * "$250,000" -> 25000000 cents · "$1.2M" -> 120000000 · "1.5 million" -> …
 * Returns null when there is no number to read. Integer cents only: money is
 * never a float here, and the single rounding happens at this edge.
 */
export function parseMoneyCents(input: string): number | null {
  const text = input.replace(/,/g, "").trim();
  const m = /(-?\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/i.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = (m[2] ?? "").toLowerCase();
  const multiplier =
    suffix === "k" || suffix === "thousand"
      ? 1_000
      : suffix === "m" || suffix === "million"
        ? 1_000_000
        : suffix === "b" || suffix === "billion"
          ? 1_000_000_000
          : 1;
  return Math.round(value * multiplier * 100);
}

/** "$250,000 - $1,000,000" or "$250k–$1M" -> a value band in integer cents. */
export function parseValueBand(
  input: string,
): { minCents?: number; maxCents?: number } | null {
  const text = input.trim();
  if (!text) return null;
  const parts = text.split(/\s*(?:-|–|—|to)\s*/i).filter(Boolean);
  if (parts.length >= 2) {
    const min = parseMoneyCents(parts[0]);
    const max = parseMoneyCents(parts[1]);
    if (min === null && max === null) return null;
    const band: { minCents?: number; maxCents?: number } = {};
    if (min !== null) band.minCents = min;
    if (max !== null) band.maxCents = max;
    return band;
  }
  const single = parseMoneyCents(text);
  if (single === null) return null;
  if (/^\s*(?:over|above|min(?:imum)?|at least|>)/i.test(text)) return { minCents: single };
  if (/^\s*(?:up to|under|below|max(?:imum)?|<)/i.test(text)) return { maxCents: single };
  // A single published estimate: treat it as a point band so overlap tests work.
  return { minCents: single, maxCents: single };
}

/* ------------------------------------------------------------------- dates */

/**
 * Portal dates arrive in every shape: ISO, "MM/DD/YYYY", "MM/DD/YYYY hh:mm A",
 * RFC 822, and SAM.gov's "2026-03-21-05:00". Returns null rather than an
 * Invalid Date, so a bad date can never become a deadline.
 */
export function parseFlexibleDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const text = String(input).trim();
  if (!text) return null;

  // SAM.gov: "2026-03-21-05:00" / "2026-03-21T17:00:00-05:00"
  const samOffset = /^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2})$/.exec(text);
  if (samOffset) {
    const parsed = Date.parse(`${samOffset[1]}T00:00:00${samOffset[2]}`);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  // Bare date: pin to noon UTC so a timezone shift can't move the calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = Date.parse(`${text}T12:00:00Z`);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  // US format, with or without a time.
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/.exec(
    text,
  );
  if (us) {
    const [, mm, dd, yyyy, hh, min, ss, ampm] = us;
    let hour = hh ? Number(hh) : 12;
    if (ampm) {
      const pm = ampm.toLowerCase() === "pm";
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${(min ?? "00").padStart(2, "0")}:${(ss ?? "00").padStart(2, "0")}Z`;
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/* ------------------------------------------------------------------- codes */

/** "541512, 541519" / "541512;541611" / ["541512"] -> ["541512","541519"]. */
export function parseCodeList(input: unknown): string[] {
  if (input === null || input === undefined) return [];
  const raw = Array.isArray(input) ? input : String(input).split(/[;,\s|]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const code = String(item ?? "").trim().toUpperCase();
    if (!code || code === "N/A" || code === "NONE") continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}
