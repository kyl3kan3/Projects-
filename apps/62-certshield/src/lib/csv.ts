/**
 * src/lib/csv.ts
 *
 * CSV in and CSV out. Pure, so the import path can be tested against the messy
 * files people actually paste: a header row exported from AppFolio, quoted commas
 * in a company name, a BOM from Excel, blank trailing lines, CRLF.
 *
 * Import policy: **partial success with named errors.** A 240-row vendor list with
 * two bad rows imports 238 vendors and tells you which two failed and why.
 * Rejecting the whole file over one missing email is how a coordinator ends up back
 * in the spreadsheet.
 */

/* --------------------------------------------------------------------- read */

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A row of nothing but empty strings is a blank line, not a record.
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
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
      endField();
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      endRow();
      continue;
    }
    field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/* -------------------------------------------------------------------- write */

export function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Array<unknown>>): string {
  // CRLF and a trailing newline: Excel is the audience for these files.
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------ vendor import */

export interface VendorImportRow {
  name: string;
  trade: string | null;
  contactName: string | null;
  contactEmail: string | null;
  agentName: string | null;
  agentEmail: string | null;
  phone: string | null;
  notes: string | null;
  /** Property or project names to open engagements against, if the file names any. */
  properties: string[];
}

export interface VendorImportError {
  line: number;
  message: string;
}

export interface VendorImportResult {
  rows: VendorImportRow[];
  errors: VendorImportError[];
  /** The header names that were not recognised, so the UI can say so. */
  ignoredColumns: string[];
}

/** Header aliases: the names these columns carry in real exports. */
const COLUMNS: Record<keyof Omit<VendorImportRow, "properties">, string[]> = {
  name: ["name", "vendor", "vendor name", "company", "company name", "subcontractor"],
  trade: ["trade", "type", "category", "service", "vendor type"],
  contactName: ["contact", "contact name", "primary contact"],
  contactEmail: ["email", "contact email", "vendor email", "e-mail"],
  agentName: ["agent", "agent name", "agency", "producer", "broker"],
  agentEmail: ["agent email", "agency email", "producer email", "broker email"],
  phone: ["phone", "telephone", "contact phone", "phone number"],
  notes: ["notes", "note", "comment", "comments"],
};

const PROPERTY_COLUMNS = ["property", "properties", "project", "projects", "site", "job"];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function parseVendorCsv(text: string): VendorImportResult {
  const table = parseCsv(text);
  if (!table.length) {
    return { rows: [], errors: [{ line: 0, message: "The file is empty." }], ignoredColumns: [] };
  }

  const header = table[0].map(normaliseHeader);
  const index: Partial<Record<keyof VendorImportRow, number>> = {};
  const propertyIndexes: number[] = [];
  const ignoredColumns: string[] = [];

  header.forEach((h, i) => {
    if (PROPERTY_COLUMNS.some((alias) => normaliseHeader(alias) === h)) {
      propertyIndexes.push(i);
      return;
    }
    const key = (Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>).find((k) =>
      COLUMNS[k].some((alias) => normaliseHeader(alias) === h),
    );
    if (key) {
      if (index[key] === undefined) index[key] = i;
      return;
    }
    if (h) ignoredColumns.push(table[0][i].trim());
  });

  const errors: VendorImportError[] = [];
  if (index.name === undefined) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message:
            'No vendor-name column was found. The header row needs a column called "Name", "Vendor" or "Company".',
        },
      ],
      ignoredColumns,
    };
  }

  const at = (row: string[], key: keyof VendorImportRow): string | null => {
    const i = index[key];
    if (i === undefined) return null;
    const value = (row[i] ?? "").trim();
    return value || null;
  };

  const rows: VendorImportRow[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const raw = table[r];
    const name = (raw[index.name] ?? "").trim();
    if (!name) {
      errors.push({ line, message: "Skipped: no vendor name in this row." });
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      errors.push({ line, message: `Skipped: "${name}" appears more than once in this file.` });
      continue;
    }

    const contactEmail = at(raw, "contactEmail");
    const agentEmail = at(raw, "agentEmail");
    if (contactEmail && !EMAIL.test(contactEmail)) {
      errors.push({ line, message: `"${name}": "${contactEmail}" is not a valid email address, so it was left blank.` });
    }
    if (agentEmail && !EMAIL.test(agentEmail)) {
      errors.push({ line, message: `"${name}": agent email "${agentEmail}" is not valid, so it was left blank.` });
    }

    const properties = propertyIndexes
      .flatMap((i) => (raw[i] ?? "").split(/[;|]/))
      .map((p) => p.trim())
      .filter(Boolean);

    seen.add(key);
    rows.push({
      name,
      trade: at(raw, "trade"),
      contactName: at(raw, "contactName"),
      contactEmail: contactEmail && EMAIL.test(contactEmail) ? contactEmail.toLowerCase() : null,
      agentName: at(raw, "agentName"),
      agentEmail: agentEmail && EMAIL.test(agentEmail) ? agentEmail.toLowerCase() : null,
      phone: at(raw, "phone"),
      notes: at(raw, "notes"),
      properties: [...new Set(properties)],
    });
  }

  if (!rows.length && !errors.length) {
    errors.push({ line: 1, message: "The file has a header row but no vendors under it." });
  }

  return { rows, errors, ignoredColumns };
}

/** The template a coordinator downloads before filling it in. */
export const VENDOR_CSV_TEMPLATE = toCsv([
  ["Name", "Trade", "Contact", "Email", "Agent", "Agent email", "Phone", "Properties", "Notes"],
  [
    "Kestrel Roofing LLC",
    "Roofing",
    "Marisol Vega",
    "marisol@kestrelroofing.example",
    "Harbor & Main Insurance Agency",
    "renee@harborandmain.example",
    "(503) 555-0148",
    "Bayview Terrace; Alder Court",
    "Preferred roofer, 3-year MSA",
  ],
]);
