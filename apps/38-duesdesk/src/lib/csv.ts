/**
 * Roster CSV parsing. Pure — no database, no Next — so the dry-run preview and
 * the commit run the identical code and can never disagree about what will
 * happen.
 *
 * Tolerant about columns, strict about rows: a row it cannot understand is
 * reported by line number, never guessed at. A treasurer would rather fix four
 * lines than discover in April that eleven households were invented.
 */

import { isIsoDate, type IsoDate } from "@/lib/dates";
import { isEmail, normalizePhone } from "@/lib/text";

/** RFC4180-ish: quoted fields, doubled quotes, CRLF or LF, BOM tolerated. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const src = text.replace(/^﻿/, "");

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Column aliases a real HOA spreadsheet actually uses. */
export const COLUMN_ALIASES: Record<string, string[]> = {
  unit: ["unit", "unit label", "unit number", "unit no", "address", "property", "lot", "lot number", "street address", "home"],
  name: ["name", "owner", "owner name", "member", "member name", "primary contact", "resident", "homeowner"],
  email: ["email", "email address", "e-mail", "primary email", "owner email"],
  phone: ["phone", "phone number", "mobile", "cell", "cell phone", "telephone", "home phone"],
  mailing: ["mailing address", "mailing", "billing address", "mail to", "send bills to"],
  joined: ["joined", "joined on", "purchase date", "start date", "member since", "closing date", "date acquired"],
  secondName: ["second name", "co-owner", "co owner", "spouse", "additional member", "secondary contact", "owner 2"],
  secondEmail: ["second email", "co-owner email", "spouse email", "secondary email", "owner 2 email"],
};

/**
 * Header normalisation, applied to the alias list *and* to the spreadsheet cell.
 *
 * This shape exists because of a real bug: normalising only the cell turned
 * "Co-Owner" into "co owner" and then failed to match the alias "co-owner", so
 * every imported household silently lost its second owner — frequently the one
 * who reads the email.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\-/.]+/g, " ")
    .replace(/\s+/g, " ");
}

export function mapHeader(header: string[]): Record<string, number> {
  const normalized = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([field, aliases]) => [field, aliases.map(normalizeHeader)]),
  );
  const out: Record<string, number> = {};
  header.forEach((raw, index) => {
    const cell = normalizeHeader(raw);
    for (const [field, aliases] of Object.entries(normalized)) {
      if (out[field] === undefined && aliases.includes(cell)) out[field] = index;
    }
  });
  return out;
}

/** Accept "2026-04-01", "4/1/2026", "04/01/26". Anything else is a problem. */
export function parseFlexibleDate(input: string, fallback: IsoDate): IsoDate | null {
  const value = input.trim();
  if (!value) return fallback;
  if (isIsoDate(value)) return value;
  const us = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export interface ImportPerson {
  name: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface ImportRow {
  unitLabel: string;
  mailingAddress: string | null;
  joinedOn: IsoDate;
  people: ImportPerson[];
}

export interface ImportProblem {
  line: number;
  reason: string;
  raw: string;
}

export interface ParsedRoster {
  rows: ImportRow[];
  problems: ImportProblem[];
  columns: Record<string, number>;
}

export function parseRoster(
  text: string,
  options: { defaultJoinedOn?: IsoDate } = {},
): ParsedRoster {
  const table = parseCsv(text);
  const problems: ImportProblem[] = [];
  if (table.length === 0) {
    return { rows: [], problems: [{ line: 0, reason: "The file is empty", raw: "" }], columns: {} };
  }

  const columns = mapHeader(table[0]);
  if (columns.unit === undefined) {
    return {
      rows: [],
      problems: [
        {
          line: 1,
          reason:
            "No unit column found. Name one column Unit, Address, or Lot — every other column is optional.",
          raw: table[0].join(","),
        },
      ],
      columns,
    };
  }

  const fallbackJoined = options.defaultJoinedOn ?? "1970-01-01";
  const rows: ImportRow[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const raw = cells.join(",");
    const at = (key: string) =>
      columns[key] === undefined ? "" : (cells[columns[key]] ?? "").trim();

    const unitLabel = at("unit");
    if (!unitLabel) {
      problems.push({ line: r + 1, reason: "No unit — skipped", raw });
      continue;
    }
    const key = unitLabel.toLowerCase();
    if (seen.has(key)) {
      problems.push({ line: r + 1, reason: `Duplicate of unit "${unitLabel}" — skipped`, raw });
      continue;
    }

    const joinedOn = parseFlexibleDate(at("joined"), fallbackJoined);
    if (!joinedOn) {
      problems.push({
        line: r + 1,
        reason: `Could not read the joined date "${at("joined")}" — use YYYY-MM-DD`,
        raw,
      });
      continue;
    }

    const people: ImportPerson[] = [];
    const primaryEmail = at("email");
    if (primaryEmail && !isEmail(primaryEmail)) {
      problems.push({
        line: r + 1,
        reason: `"${primaryEmail}" is not a usable email — imported without it`,
        raw,
      });
    }
    people.push({
      name: at("name") || `Unit ${unitLabel} owner`,
      email: primaryEmail && isEmail(primaryEmail) ? primaryEmail.toLowerCase() : null,
      phone: at("phone") ? normalizePhone(at("phone")) : null,
      isPrimary: true,
    });

    const secondName = at("secondName");
    if (secondName) {
      const secondEmail = at("secondEmail");
      people.push({
        name: secondName,
        email: secondEmail && isEmail(secondEmail) ? secondEmail.toLowerCase() : null,
        phone: null,
        isPrimary: false,
      });
    }

    seen.add(key);
    rows.push({ unitLabel, mailingAddress: at("mailing") || null, joinedOn, people });
  }

  return { rows, problems, columns };
}
