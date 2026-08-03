/**
 * Reading fields out of the *text* a document carried with it.
 *
 * Most forwarded invoices are text, not pixels: an emailed Home Depot Pro invoice,
 * a Stripe receipt, a Verizon bill. For those there is nothing to look at — the
 * total is written down. This parser is the cheap path, and it is also what the
 * deterministic extractor uses when no model key is configured, which is why it is
 * pure, has no dependencies, and is tested directly.
 *
 * It reports per-field confidence honestly: a labelled "Total: $148.32" is a 0.97,
 * a bare largest-dollar-amount-on-the-page fallback is a 0.55, and a field it could
 * not find at all is absent rather than zero.
 */

import { parseAmountToCents } from "@/lib/money";
import { isIsoDate, type IsoDate } from "@/lib/dates";

export type DocType = "receipt" | "invoice" | "statement" | "other";

export interface ParsedField<T> {
  value: T;
  confidence: number;
  /** The line the value was read from — the provenance the review sheet shows. */
  evidence: string;
}

export interface ParsedReceipt {
  vendor?: ParsedField<string>;
  docDate?: ParsedField<IsoDate>;
  total?: ParsedField<number>;
  tax?: ParsedField<number>;
  currency: string;
  docType: DocType;
  lineSummary?: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const AMOUNT = String.raw`\(?-?(?:[$€£]\s*)?\d[\d.,]*\)?`;

/** Labels that mean "this is the number", strongest first. */
const TOTAL_LABELS: { re: RegExp; confidence: number }[] = [
  { re: new RegExp(String.raw`(?:^|\n)[^\n\S]*(?:grand\s+total|amount\s+due|total\s+due|balance\s+due|total\s+charged|amount\s+paid|order\s+total)\s*[:\-]?\s*(?:usd|cad|eur|gbp)?\s*(${AMOUNT})`, "i"), confidence: 0.97 },
  { re: new RegExp(String.raw`(?:^|\n)[^\n\S]*(?<!sub)total\s*[:\-]?\s*(?:usd|cad|eur|gbp)?\s*(${AMOUNT})`, "i"), confidence: 0.96 },
  { re: new RegExp(String.raw`\b(?:amount\s+due|total\s+due|grand\s+total)\b[^\n\d]{0,20}(${AMOUNT})`, "i"), confidence: 0.9 },
  { re: new RegExp(String.raw`\b(?<!sub)total\b[^\n\d]{0,20}(${AMOUNT})`, "i"), confidence: 0.88 },
];

const TAX_LABELS: { re: RegExp; confidence: number }[] = [
  { re: new RegExp(String.raw`(?:^|\n)[^\n\S]*(?:sales\s+tax|tax|vat|gst|hst)(?:\s*\([^)]*\))?\s*[:\-]?\s*(${AMOUNT})`, "i"), confidence: 0.95 },
  { re: new RegExp(String.raw`\b(?:sales\s+tax|tax|vat|gst|hst)\b[^\n\d]{0,20}(${AMOUNT})`, "i"), confidence: 0.86 },
];

/**
 * Explicit vendor labels, strongest first.
 *
 * A bare `From:` is deliberately NOT here. On a *forwarded* email the From header is the
 * operator's own address, so treating it as the vendor would file every forwarded invoice
 * under the operator's own name — confidently, which is the worst kind of wrong.
 */
const VENDOR_LABELS = [
  /(?:^|\n)\s*(?:vendor|merchant|sold\s+by|bill\s+from|supplier|store\s+name)\s*[:\-]\s*([^\n]{2,60})/i,
  /(?:^|\n)\s*(?:receipt|invoice|statement)\s+from\s+([^\n]{2,60})/i,
];

/** "March 12, 2026" on its own line is a date, not a merchant. */
const BARE_DATE_LINE = /^[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}$/;

const NOISE_LINE =
  /^(?:receipt|invoice|statement|tax invoice|thank you|customer copy|merchant copy|order confirmation|your receipt|payment receipt)\b/i;

export function detectCurrency(text: string): string {
  if (/\bUSD\b|\$/.test(text)) {
    if (/\bCAD\b|\bC\$/.test(text)) return "CAD";
    return "USD";
  }
  if (/\bEUR\b|€/.test(text)) return "EUR";
  if (/\bGBP\b|£/.test(text)) return "GBP";
  return "USD";
}

export function detectDocType(text: string): DocType {
  const t = text.toLowerCase();
  if (/\bstatement\b/.test(t) && /\bperiod\b|\bopening balance\b/.test(t)) return "statement";
  if (/\binvoice\s*(?:#|no|number|date)/.test(t) || /\binvoice\b/.test(t)) return "invoice";
  if (/\breceipt\b|\bthank you for your (?:order|purchase)\b/.test(t)) return "receipt";
  return "other";
}

/** Every date-ish string in the text, in document order. */
export function findDates(text: string): { date: IsoDate; evidence: string; labelled: boolean }[] {
  const out: { date: IsoDate; evidence: string; labelled: boolean }[] = [];
  const push = (date: string | null, evidence: string, labelled: boolean) => {
    if (date && isIsoDate(date)) out.push({ date, evidence: evidence.trim(), labelled });
  };
  const labelWindow = (index: number) =>
    /(?:date|dated|invoice date|transaction date|purchase date|issued|sold on)\s*[:\-]?\s*$/i.test(
      text.slice(Math.max(0, index - 28), index),
    );

  // 2026-03-12
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(`${m[1]}-${m[2]}-${m[3]}`, m[0], labelWindow(m.index));
  }
  // 03/12/2026 and 3/12/26 — US order, which is what a US receipt prints.
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    push(
      `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
      m[0],
      labelWindow(m.index),
    );
  }
  // March 12, 2026 / Mar 12 2026
  for (const m of text.matchAll(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g,
  )) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    if (!month) continue;
    push(
      `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`,
      m[0],
      labelWindow(m.index),
    );
  }
  // 12 March 2026
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/g)) {
    const month = MONTH_NAMES[m[2].toLowerCase()];
    if (!month) continue;
    push(
      `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      m[0],
      labelWindow(m.index),
    );
  }
  return out;
}

function firstMatch(
  text: string,
  patterns: { re: RegExp; confidence: number }[],
): { cents: number; confidence: number; evidence: string } | null {
  for (const { re, confidence } of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const cents = parseAmountToCents(m[1]);
    if (cents === null) continue;
    return { cents, confidence, evidence: m[0].trim().replace(/\s+/g, " ") };
  }
  return null;
}

function guessVendorFromLines(text: string): ParsedField<string> | null {
  for (const pattern of VENDOR_LABELS) {
    const m = pattern.exec(text);
    if (m) {
      const value = cleanVendor(m[1]);
      if (value) return { value, confidence: 0.94, evidence: m[0].trim() };
    }
  }
  // Fall back to the first line that looks like a merchant name rather than a heading,
  // a street address, or a priced line item. A receipt prints the merchant at the top;
  // an email forwards it under headers, so those are skipped by name.
  //
  // A store number in the name is fine ("THE HOME DEPOT #4412") — what disqualifies a
  // line is being *mostly* digits, starting with a house number, or ending in a price.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (NOISE_LINE.test(line)) continue;
    if (/^(?:subject|to|from|date|sent|cc|reply-to|order|ref|tel|phone)\b/i.test(line)) continue;
    if (/[$€£]/.test(line)) continue;
    if (/\d[.,]\d{2}\s*$/.test(line)) continue;
    if (/^\d/.test(line)) continue; // a street address, or a numeric date
    if (BARE_DATE_LINE.test(line)) continue;
    if (line.length < 3 || line.length > 48) continue;
    if (!/[A-Za-z]{3}/.test(line)) continue;
    // The digit ratio is measured on the name *without* its store or terminal number:
    // "SHELL OIL 574288" is a perfectly ordinary merchant line, and judging it on the raw
    // ratio threw the whole document away as "no vendor".
    const stripped = line.replace(/#\s*\d+/g, " ").replace(/\s\d{3,}\b/g, " ").trim();
    const digits = (stripped.match(/\d/g) ?? []).length;
    if (digits / Math.max(1, stripped.length) > 0.35) continue;
    if (!/[A-Za-z]{3}/.test(stripped)) continue;
    const value = cleanVendor(line);
    if (value) return { value, confidence: 0.68, evidence: line };
  }
  return null;
}

function cleanVendor(raw: string): string {
  const v = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/[|•]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—:\s]+|[-–—:\s]+$/g, "")
    .trim();
  return v.length >= 2 && v.length <= 60 ? v : "";
}

/** The first few item-looking lines, joined — the "line summary" on the entry. */
export function summarizeLines(text: string): string | undefined {
  const items: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 72) continue;
    if (!/[$€£]?\s*\d[\d.,]*\s*$/.test(line)) continue;
    if (/(?:sub)?total|tax|balance|amount due|payment|change|cash|card|tender|tip/i.test(line)) {
      continue;
    }
    const label = line.replace(/[$€£]?\s*[\d.,]+\s*$/, "").trim();
    if (label.length < 3 || !/[A-Za-z]{3}/.test(label)) continue;
    items.push(label.replace(/\s{2,}/g, " "));
    if (items.length === 4) break;
  }
  if (items.length === 0) return undefined;
  return items.join(", ").slice(0, 180);
}

/**
 * Read what can be read. Fields that cannot be found are simply absent, so the
 * confidence policy sees "no total" rather than "total: $0.00 at 100% confidence" —
 * the second is how a parser lies.
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const normalized = (text ?? "").replace(/ /g, " ");
  const currency = detectCurrency(normalized);
  const out: ParsedReceipt = { currency, docType: detectDocType(normalized) };

  const total = firstMatch(normalized, TOTAL_LABELS);
  if (total) {
    out.total = { value: total.cents, confidence: total.confidence, evidence: total.evidence };
  } else {
    // Last resort: the largest amount on the page. Plausible, and flagged as such —
    // 0.55 is below every auto threshold, so it always goes to review.
    let best: { cents: number; evidence: string } | null = null;
    for (const m of normalized.matchAll(/[$€£]\s*(\d[\d.,]*)/g)) {
      const cents = parseAmountToCents(m[1]);
      if (cents === null) continue;
      if (!best || cents > best.cents) best = { cents, evidence: m[0] };
    }
    if (best) out.total = { value: best.cents, confidence: 0.55, evidence: best.evidence };
  }

  const tax = firstMatch(normalized, TAX_LABELS);
  if (tax && (!out.total || tax.cents < out.total.value)) {
    out.tax = { value: tax.cents, confidence: tax.confidence, evidence: tax.evidence };
  }

  const dates = findDates(normalized);
  const labelled = dates.find((d) => d.labelled);
  const chosen = labelled ?? dates[0];
  if (chosen) {
    out.docDate = {
      value: chosen.date,
      confidence: labelled ? 0.96 : dates.length === 1 ? 0.9 : 0.72,
      evidence: chosen.evidence,
    };
  }

  const vendor = guessVendorFromLines(normalized);
  if (vendor) out.vendor = vendor;

  out.lineSummary = summarizeLines(normalized);
  return out;
}
