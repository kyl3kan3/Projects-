/**
 * Review import: CSV, plus the Judge.me and Loox export formats.
 *
 * This is a growth lever, not a utility (README go-to-market 3): losing review
 * history is the single biggest reason a merchant will not switch, so "keep every
 * review" has to actually work on the file the competitor's dashboard produced,
 * unedited.
 *
 * The parser and the column mapping are pure functions over strings. That is
 * deliberate — a bad CSV parser silently truncates a merchant's history at the
 * first quoted comma, and that is exactly the class of bug that gets discovered
 * six months later.
 */

import { dedupeHash } from "@/lib/crypto";
import type { NewReview, ReviewSource } from "@/db/schema";

/* ------------------------------------------------------------------- parser --- */

/**
 * RFC 4180 CSV: quoted fields, escaped quotes (`""`), embedded commas and
 * newlines, and CRLF or LF line endings. Rows are returned as raw string arrays;
 * nothing is trimmed here because a leading space can be significant inside a
 * quoted field.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM: Excel writes one, and it otherwise becomes part of the
  // first header name, which breaks every column lookup.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  // A file with no trailing newline still has a last row.
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty — a trailing newline should not import a
  // blank review.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/* ------------------------------------------------------------------ mapping --- */

export interface ParsedReview {
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  authorEmail: string | null;
  productExternalId: string | null;
  productTitle: string | null;
  createdAt: Date | null;
  verifiedPurchase: boolean;
  photoUrl: string | null;
}

export interface ImportPreview {
  source: ReviewSource;
  rows: ParsedReview[];
  errors: { row: number; reason: string }[];
  /** Header names we did not recognise, so the merchant can see what was ignored. */
  ignoredColumns: string[];
}

/** Column aliases, lower-cased and stripped of punctuation. */
const FIELD_ALIASES: Record<keyof Omit<ParsedReview, "verifiedPurchase">, string[]> = {
  rating: ["rating", "stars", "score", "review rating", "star rating"],
  title: ["title", "review title", "headline", "subject"],
  body: ["body", "review", "review body", "content", "comment", "text", "review content"],
  authorName: [
    "author",
    "reviewer",
    "name",
    "reviewer name",
    "author name",
    "customer name",
    "display name",
  ],
  authorEmail: ["email", "reviewer email", "author email", "customer email"],
  productExternalId: [
    "product id",
    "product handle",
    "handle",
    "sku",
    "product sku",
    "productid",
  ],
  productTitle: ["product", "product title", "product name", "item"],
  createdAt: ["date", "created at", "review date", "published at", "submitted at", "timestamp"],
  photoUrl: [
    "picture urls",
    "photo",
    "photo url",
    "image",
    "image url",
    "media",
    "picture",
    "photos",
  ],
};

const VERIFIED_ALIASES = ["verified", "verified buyer", "verified purchase", "is verified"];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Which export produced this file?
 *
 * Judge.me and Loox both export CSV with their own column names, and knowing
 * which one it is only matters for the `source` we record — the column mapping is
 * alias-driven, so an unrecognised exporter still imports as a generic CSV rather
 * than failing.
 */
export function detectSource(headers: string[]): ReviewSource {
  const set = new Set(headers.map(normalizeHeader));
  // Judge.me's export is the only one with these two together.
  if (set.has("reviewer email") && (set.has("picture urls") || set.has("product handle"))) {
    return "import_judgeme";
  }
  if (set.has("review id") && set.has("product handle")) return "import_judgeme";
  // Loox exports "Photo" plus a "Reviewer" column and no email.
  if (set.has("photo") && (set.has("reviewer") || set.has("review date"))) return "import_loox";
  return "import_csv";
}

function indexFor(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const at = normalized.indexOf(alias);
    if (at !== -1) return at;
  }
  return -1;
}

function parseRating(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  // "4", "4.0", "4 out of 5", "4/5", "★★★★"
  const stars = (cleaned.match(/[★]/g) ?? []).length;
  if (stars) return Math.min(5, stars);
  const match = cleaned.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Math.round(Number(match[0].replace(",", ".")));
  if (!Number.isFinite(value) || value < 1 || value > 5) return null;
  return value;
}

function parseDate(raw: string): Date | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  // Unix seconds or milliseconds, which Loox has used.
  if (/^\d{10}$/.test(cleaned)) return new Date(Number(cleaned) * 1000);
  if (/^\d{13}$/.test(cleaned)) return new Date(Number(cleaned));
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  // A date in the future is a parse failure dressed up as data.
  if (parsed.getTime() > Date.now() + 86_400_000) return null;
  return parsed;
}

function parseBoolean(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "yes" || value === "1" || value === "verified";
}

function firstUrl(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  // Judge.me packs several photo URLs into one comma- or pipe-separated cell.
  const candidate = cleaned.split(/[|,\s]+/).find((part) => /^https?:\/\//i.test(part));
  return candidate ?? null;
}

/**
 * Parse an export file into reviews plus a per-row error list.
 *
 * Rows are never silently dropped: a row that cannot be imported produces an
 * error with its line number, which the import screen shows and the job stores.
 */
export function parseReviewFile(text: string): ImportPreview {
  const rows = parseCsv(text);
  if (!rows.length) {
    return { source: "import_csv", rows: [], errors: [{ row: 0, reason: "The file is empty" }], ignoredColumns: [] };
  }

  const headers = rows[0];
  const source = detectSource(headers);
  const index = {
    rating: indexFor(headers, FIELD_ALIASES.rating),
    title: indexFor(headers, FIELD_ALIASES.title),
    body: indexFor(headers, FIELD_ALIASES.body),
    authorName: indexFor(headers, FIELD_ALIASES.authorName),
    authorEmail: indexFor(headers, FIELD_ALIASES.authorEmail),
    productExternalId: indexFor(headers, FIELD_ALIASES.productExternalId),
    productTitle: indexFor(headers, FIELD_ALIASES.productTitle),
    createdAt: indexFor(headers, FIELD_ALIASES.createdAt),
    photoUrl: indexFor(headers, FIELD_ALIASES.photoUrl),
    verified: indexFor(headers, VERIFIED_ALIASES),
  };

  const used = new Set(Object.values(index).filter((i) => i >= 0));
  const ignoredColumns = headers
    .map((h, i) => (used.has(i) ? null : h.trim()))
    .filter((h): h is string => Boolean(h));

  const errors: { row: number; reason: string }[] = [];
  if (index.rating === -1) {
    errors.push({ row: 1, reason: "No rating column found — expected one named Rating or Stars" });
    return { source, rows: [], errors, ignoredColumns };
  }

  const cell = (row: string[], at: number): string => (at >= 0 ? (row[at] ?? "") : "");
  const parsed: ParsedReview[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lineNumber = r + 1;

    const rating = parseRating(cell(row, index.rating));
    if (rating === null) {
      errors.push({ row: lineNumber, reason: `Rating "${cell(row, index.rating).trim()}" is not 1–5` });
      continue;
    }

    const body = cell(row, index.body).trim();
    const authorName = cell(row, index.authorName).trim() || "Verified buyer";
    if (!body && !cell(row, index.title).trim()) {
      errors.push({ row: lineNumber, reason: "No review text" });
      continue;
    }

    parsed.push({
      rating,
      title: cell(row, index.title).trim() || null,
      body: body.slice(0, 4_000),
      authorName: authorName.slice(0, 60),
      authorEmail: cell(row, index.authorEmail).trim().toLowerCase() || null,
      productExternalId: cell(row, index.productExternalId).trim() || null,
      productTitle: cell(row, index.productTitle).trim() || null,
      createdAt: parseDate(cell(row, index.createdAt)),
      // Imported reviews are only marked verified when the export says so — we
      // cannot vouch for someone else's data, and claiming otherwise is the exact
      // trust debt the FTC rule is about.
      verifiedPurchase: index.verified >= 0 ? parseBoolean(cell(row, index.verified)) : false,
      photoUrl: firstUrl(cell(row, index.photoUrl)),
    });
  }

  return { source, rows: parsed, errors, ignoredColumns };
}

/**
 * Turn a parsed row into an insertable review.
 *
 * Imported reviews land as `pending` with a bulk-approve action, because a
 * merchant should look once at what they just pulled in from a competitor's
 * database before it appears on their storefront.
 */
export function toReviewRow(
  storeId: string,
  source: ReviewSource,
  parsed: ParsedReview,
): NewReview {
  const createdAt = parsed.createdAt ?? new Date();
  return {
    storeId,
    rating: parsed.rating,
    title: parsed.title,
    body: parsed.body,
    authorName: parsed.authorName,
    authorEmail: parsed.authorEmail,
    productExternalId: parsed.productExternalId,
    productTitle: parsed.productTitle,
    verifiedPurchase: parsed.verifiedPurchase,
    status: "pending",
    source,
    createdAt,
    // The dedupe key: re-importing the same export must not double the history.
    dedupeHash: dedupeHash([
      parsed.authorName,
      parsed.body,
      createdAt.toISOString().slice(0, 10),
    ]),
  };
}
