/**
 * src/lib/csv.ts
 *
 * CSV import for seeding a book, written by hand rather than pulled in as a
 * dependency: the format is one shape (`name, phone, email, last visit`) exported from
 * Square, Booksy or a phone's contacts, and the parsing rules that matter are the
 * quoting ones.
 *
 * The point of the import is cold-start cadences. A stylist arriving with three years
 * of history in another app has rhythms ChairFlow cannot see, and one date per client
 * is enough to know roughly when they are due.
 */

import { parseDayString } from "@/lib/dates";
import { normalizePhone } from "@/lib/format";

/** Split one CSV line, honouring double quotes and doubled-quote escapes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      out.push(field.trim());
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field.trim());
  return out;
}

export interface ImportRow {
  line: number;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  lastVisitOn: string | null;
}

export interface ImportProblem {
  line: number;
  raw: string;
  reason: string;
}

/** What an import did. Declared here so a client component can render it. */
export interface ImportSummary {
  created: number;
  updated: number;
  cadencesSeeded: number;
  problems: ImportProblem[];
  total: number;
}

export interface ParsedImport {
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Which incoming column ended up mapped to what. Shown before committing. */
  mapping: Record<string, number>;
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "client", "client name", "full name", "customer", "customer name"],
  firstName: ["first name", "first", "firstname", "given name"],
  lastName: ["last name", "last", "lastname", "surname", "family name"],
  phone: ["phone", "mobile", "phone number", "cell", "mobile number", "telephone"],
  email: ["email", "e-mail", "email address"],
  lastVisit: [
    "last visit",
    "last visit date",
    "last appointment",
    "last seen",
    "last_visit",
    "lastvisit",
  ],
};

function headerIndex(headers: string[], field: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[field];
  return headers.findIndex((h) => aliases.includes(h.toLowerCase().trim()));
}

/**
 * Loose date parsing, because a CSV from a scheduling app can hold any of these.
 * Ambiguous shapes are refused rather than guessed: "03/04/2026" could be March or
 * April, and importing the wrong one moves a cadence by a month.
 */
export function parseLooseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = parseDayString(s.slice(0, 10));
  if (iso) return s.slice(0, 10);
  // US-style m/d/yyyy, which is what US scheduling apps export.
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const candidate = `${us[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return parseDayString(candidate) ? candidate : null;
  }
  // "26 Jun 2026" / "Jun 26 2026"
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const words = s.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 3) {
    const monthWord = words.find((w) => months.includes(w.slice(0, 3)));
    if (monthWord) {
      const month = months.indexOf(monthWord.slice(0, 3)) + 1;
      const rest = words.filter((w) => w !== monthWord).map(Number);
      const day = rest.find((n) => n >= 1 && n <= 31);
      const year = rest.find((n) => n >= 1900);
      if (day && year) {
        const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return parseDayString(candidate) ? candidate : null;
      }
    }
  }
  return null;
}

function splitName(raw: string): { firstName: string; lastName: string | null } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Parse an upload into rows and problems.
 *
 * Every rejected line comes back with its number, its text and a reason. An import
 * that silently drops 40 of 300 clients is worse than one that refuses: the stylist
 * would never know which 40.
 */
export function parseImport(text: string): ParsedImport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], problems: [], mapping: {} };

  const headers = splitCsvLine(lines[0]);
  const idx = {
    name: headerIndex(headers, "name"),
    firstName: headerIndex(headers, "firstName"),
    lastName: headerIndex(headers, "lastName"),
    phone: headerIndex(headers, "phone"),
    email: headerIndex(headers, "email"),
    lastVisit: headerIndex(headers, "lastVisit"),
  };

  const problems: ImportProblem[] = [];
  if (idx.phone < 0) {
    problems.push({
      line: 1,
      raw: lines[0],
      reason:
        "No phone column found. A client's phone is their identity in your book, so the file needs one (header: phone, mobile, or cell).",
    });
    return { rows: [], problems, mapping: idx as unknown as Record<string, number> };
  }
  if (idx.name < 0 && idx.firstName < 0) {
    problems.push({
      line: 1,
      raw: lines[0],
      reason: "No name column found (header: name, client, or first name).",
    });
    return { rows: [], problems, mapping: idx as unknown as Record<string, number> };
  }

  const rows: ImportRow[] = [];
  const seenPhones = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cells = splitCsvLine(raw);
    const cell = (at: number): string => (at >= 0 && at < cells.length ? cells[at] : "");

    const phone = normalizePhone(cell(idx.phone));
    if (!phone) {
      problems.push({
        line: i + 1,
        raw,
        reason: `"${cell(idx.phone)}" is not a phone number we can text.`,
      });
      continue;
    }
    if (seenPhones.has(phone)) {
      problems.push({
        line: i + 1,
        raw,
        reason: `Duplicate of an earlier row with the same number (${phone}).`,
      });
      continue;
    }

    let firstName = cell(idx.firstName);
    let lastName: string | null = cell(idx.lastName) || null;
    if (!firstName && idx.name >= 0) {
      const split = splitName(cell(idx.name));
      firstName = split.firstName;
      lastName = lastName ?? split.lastName;
    }
    if (!firstName) {
      problems.push({ line: i + 1, raw, reason: "No name on this row." });
      continue;
    }

    const emailRaw = cell(idx.email);
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw.toLowerCase() : null;
    if (emailRaw && !email) {
      problems.push({
        line: i + 1,
        raw,
        reason: `"${emailRaw}" is not an email address — the row imported without one.`,
      });
    }

    const visitRaw = cell(idx.lastVisit);
    const lastVisitOn = visitRaw ? parseLooseDate(visitRaw) : null;
    if (visitRaw && !lastVisitOn) {
      problems.push({
        line: i + 1,
        raw,
        reason: `"${visitRaw}" is not a date we can read — the row imported without a last visit, so it has no cadence yet.`,
      });
    }

    seenPhones.add(phone);
    rows.push({ line: i + 1, firstName, lastName, phone, email, lastVisitOn });
  }

  return { rows, problems, mapping: idx as unknown as Record<string, number> };
}
