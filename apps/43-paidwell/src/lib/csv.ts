/**
 * CSV / Stripe-Invoicing import.
 *
 * This is a permanent fallback, not a stopgap: QuickBooks and Xero can change
 * their OAuth policy or rate limits at any time (README risk 1), and a firm must
 * always be able to get its own aging picture into PaidWell from a file it
 * exported five minutes ago.
 *
 * The parser is deliberately forgiving about *column names* and unforgiving
 * about *values*. Real exports label the same field "Customer", "Client name" or
 * "Company", so aliases are cheap and worth it. But a cell that does not parse
 * becomes a reported problem on a numbered line, never a silent zero — a wrong
 * aging report is worse than a refused import, because the firm will act on it.
 */

import { addDays, isIsoDate, type IsoDate } from "@/lib/dates";
import { parseAmountToCents } from "@/lib/money";

/* ---------------------------------------------------------------- parsing --- */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF, and a BOM if Excel wrote it. */
export function parseCsv(text: string): ParsedCsv {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const out = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
  return { headers, rows: out };
}

/* ---------------------------------------------------------------- mapping --- */

const ALIASES: Record<string, string[]> = {
  clientName: ["client", "client name", "customer", "customer name", "company", "company name", "account", "bill to"],
  clientEmail: ["email", "client email", "customer email", "contact email", "billing email", "to"],
  contactName: ["contact", "contact name", "attention", "billing contact"],
  number: ["invoice", "invoice number", "invoice no", "invoice #", "number", "no", "doc number", "reference", "id"],
  issuedAt: ["issued", "issue date", "issued at", "invoice date", "date", "created"],
  dueAt: ["due", "due date", "due at", "payment due"],
  // "amount due" deliberately belongs to the balance, not the total: that is
  // what QuickBooks means by it, and treating it as the total would understate
  // what a part-paid invoice was originally worth.
  amountCents: ["amount", "total", "invoice total", "grand total", "subtotal", "invoice amount"],
  balanceCents: [
    "balance",
    "outstanding",
    "open balance",
    "balance due",
    "amount due",
    "amount outstanding",
    "remaining",
  ],
  currency: ["currency", "ccy"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Map a file's headers onto our fields. Returns which of ours we found. */
export function detectColumns(headers: readonly string[]): Record<string, string> {
  const found: Record<string, string> = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (found[field]) continue;
      if (aliases.includes(normalized)) {
        found[field] = header;
        break;
      }
    }
  }
  return found;
}

/**
 * Parse a date cell.
 *
 * ISO is preferred. Slash dates are read US-style (M/D/Y) because QuickBooks and
 * Stripe both export that way for US accounts — unless the first component is
 * greater than 12, in which case it can only be D/M/Y and is read as such. An
 * ambiguous date is therefore possible to get wrong by a few days; the import
 * preview shows every parsed date before anything is written, which is the only
 * honest way to handle it.
 */
export function parseDateCell(value: string): IsoDate | null {
  const text = value.trim();
  if (!text) return null;
  if (isIsoDate(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return iso(y, m, d);
  }

  const slash = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (slash) {
    let [, a, b, c] = slash;
    if (a.length === 4) return iso(Number(a), Number(b), Number(c)); // Y/M/D
    let year = Number(c);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const first = Number(a);
    const second = Number(b);
    return first > 12 ? iso(year, second, first) : iso(year, first, second);
  }

  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const words = /^(\d{1,2})\s+([a-z]{3,})\s+(\d{4})$/i.exec(text);
  if (words) {
    const month = MONTHS.indexOf(words[2].slice(0, 3).toLowerCase());
    if (month >= 0) return iso(Number(words[3]), month + 1, Number(words[1]));
  }
  const wordsFirst = /^([a-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text);
  if (wordsFirst) {
    const month = MONTHS.indexOf(wordsFirst[1].slice(0, 3).toLowerCase());
    if (month >= 0) return iso(Number(wordsFirst[3]), month + 1, Number(wordsFirst[2]));
  }
  return null;
}

function iso(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export interface ImportRow {
  line: number;
  clientName: string;
  clientEmail: string | null;
  contactName: string | null;
  number: string;
  issuedAt: IsoDate;
  dueAt: IsoDate;
  amountCents: number;
  balanceCents: number;
  currency: string;
}

export interface ImportProblem {
  line: number;
  message: string;
}

export interface ImportPlan {
  rows: ImportRow[];
  problems: ImportProblem[];
  columns: Record<string, string>;
  /** Column names in the file we did not use — shown so nothing looks lost. */
  ignored: string[];
}

/**
 * Turn a parsed file into invoices we would create. Nothing is written; the
 * caller shows this as a preview first.
 */
export function planImport(parsed: ParsedCsv, defaultTermsDays = 30): ImportPlan {
  const columns = detectColumns(parsed.headers);
  const problems: ImportProblem[] = [];
  const rows: ImportRow[] = [];
  const ignored = parsed.headers.filter((h) => !Object.values(columns).includes(h));

  // An open-invoice-only export may carry just a balance column. Treating it as
  // the amount is right for those files: every invoice in them is unpaid.
  if (!columns.amountCents && columns.balanceCents) {
    columns.amountCents = columns.balanceCents;
  }

  for (const required of ["clientName", "number", "amountCents"] as const) {
    if (!columns[required]) {
      const label = { clientName: "client name", number: "invoice number", amountCents: "amount" }[required];
      problems.push({ line: 0, message: `No ${label} column found. Expected one of: ${ALIASES[required].join(", ")}.` });
    }
  }
  if (problems.length) return { rows: [], problems, columns, ignored };

  const seen = new Set<string>();
  parsed.rows.forEach((record, index) => {
    const line = index + 2; // 1-based, plus the header row
    const clientName = record[columns.clientName]?.trim();
    const number = record[columns.number]?.trim();
    if (!clientName) {
      problems.push({ line, message: "Missing client name." });
      return;
    }
    if (!number) {
      problems.push({ line, message: "Missing invoice number." });
      return;
    }
    const key = `${clientName.toLowerCase()}::${number.toLowerCase()}`;
    if (seen.has(key)) {
      problems.push({ line, message: `Duplicate invoice ${number} for ${clientName} in this file.` });
      return;
    }
    seen.add(key);

    const amountCents = parseAmountToCents(record[columns.amountCents]);
    if (amountCents === null) {
      problems.push({ line, message: `Could not read the amount "${record[columns.amountCents]}".` });
      return;
    }
    if (amountCents <= 0) {
      problems.push({ line, message: `Invoice ${number} has a zero or negative amount.` });
      return;
    }

    const issuedRaw = columns.issuedAt ? record[columns.issuedAt] : "";
    const dueRaw = columns.dueAt ? record[columns.dueAt] : "";
    const issuedAt = parseDateCell(issuedRaw ?? "");
    let dueAt = parseDateCell(dueRaw ?? "");

    if (!issuedAt && !dueAt) {
      problems.push({ line, message: `Invoice ${number} has no readable issue or due date.` });
      return;
    }
    const resolvedIssued = issuedAt ?? addDays(dueAt!, -defaultTermsDays);
    if (!dueAt) dueAt = addDays(resolvedIssued, defaultTermsDays);

    const balanceRaw = columns.balanceCents ? record[columns.balanceCents] : "";
    const parsedBalance = balanceRaw ? parseAmountToCents(balanceRaw) : null;
    if (balanceRaw && parsedBalance === null) {
      problems.push({ line, message: `Could not read the balance "${balanceRaw}" on ${number}.` });
      return;
    }
    const balanceCents = Math.min(
      amountCents,
      Math.max(0, parsedBalance === null ? amountCents : parsedBalance),
    );

    const email = columns.clientEmail ? record[columns.clientEmail]?.trim() : "";
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      problems.push({ line, message: `"${email}" does not look like an email address.` });
      return;
    }

    rows.push({
      line,
      clientName,
      clientEmail: email || null,
      contactName: columns.contactName ? record[columns.contactName]?.trim() || null : null,
      number,
      issuedAt: resolvedIssued,
      dueAt: dueAt!,
      amountCents,
      balanceCents,
      currency: (columns.currency ? record[columns.currency]?.trim() : "") || "USD",
    });
  });

  return { rows, problems, columns, ignored };
}

/** A sample file the import screen offers, so the format is never a guess. */
export const SAMPLE_CSV = [
  "Customer,Contact,Email,Invoice Number,Invoice Date,Due Date,Total,Balance,Currency",
  "Meridian Co,Dana Whitfield,ap@meridian.co,INV-2041,2026-05-20,2026-06-19,12400.00,12400.00,USD",
  "Harbourline Group,Priya Raman,accounts@harbourline.io,INV-2044,2026-06-02,2026-07-02,4850.00,2000.00,USD",
  "Fable & Vine,Owen Serra,owen@fableandvine.com,INV-2050,2026-06-18,2026-07-18,9600.00,9600.00,USD",
].join("\n");
