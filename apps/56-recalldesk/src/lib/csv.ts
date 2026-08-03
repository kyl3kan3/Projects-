/**
 * src/lib/csv.ts
 *
 * Reading a mapped PMS export into patient drafts, and writing the overdue list
 * back out. Pure — the only I/O is the caller's.
 *
 * `parseRoster` is the dry run: it produces exactly what a commit would write,
 * plus the anomalies that tell an office manager their mapping is wrong before
 * 3,400 patients get the wrong due dates. Nothing here touches the database, so
 * the preview and the commit cannot disagree.
 */

import { parse } from "csv-parse/sync";
import { toDayStart } from "@/lib/dates";
import {
  classifyVisitKind,
  normalizeEmail,
  normalizePhone,
  parseBooleanCell,
  parseInterval,
  parsePmsDate,
  splitName,
  type ImportField,
  type PmsSource,
  RECIPES,
} from "@/lib/pms";

export interface Anomaly {
  code: string;
  message: string;
  severity: "info" | "warn";
}

export interface VisitDraft {
  visitedOn: Date;
  kind: "hygiene" | "other";
}

export interface PatientDraft {
  externalId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** null = the file said nothing; the commit then keeps the existing value. */
  emailConsent: boolean | null;
  smsConsent: boolean | null;
  doNotContact: boolean | null;
  recallIntervalMonths: number | null;
  visits: VisitDraft[];
  /** Rows in the file that fed this patient — shown in the preview sample. */
  rowCount: number;
}

export interface ParsedRoster {
  headers: string[];
  rowCount: number;
  patients: PatientDraft[];
  anomalies: Anomaly[];
  /** First few patients, for the preview sheet. */
  sample: PatientDraft[];
  skippedRows: number;
}

/** Read the header row (and sniff the delimiter) without parsing the whole file. */
export function readHeaders(content: string): { headers: string[]; delimiter: string } {
  const text = stripBom(content);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = sniffDelimiter(firstLine);
  const rows = parse(text, {
    delimiter,
    to_line: 1,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
  return { headers: (rows[0] ?? []).map((h) => stripBom(h).trim()), delimiter };
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Comma, tab or semicolon. Eaglesoft's "Export to text" writes tabs and calls the
 * file .txt; a practice should not have to know that.
 */
function sniffDelimiter(headerLine: string): string {
  const counts: [string, number][] = [
    [",", (headerLine.match(/,/g) ?? []).length],
    ["\t", (headerLine.match(/\t/g) ?? []).length],
    [";", (headerLine.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/**
 * The dry run. `mapping` is header -> field, exactly as the wizard shows it.
 *
 * Rows are grouped into patients by chart id when there is one, and otherwise by
 * name plus a contact detail — a name alone would merge the two Smiths in every
 * practice in the country.
 */
export function parseRoster(
  content: string,
  mapping: Record<string, string>,
  source: PmsSource,
  today: Date = new Date(),
): ParsedRoster {
  const { headers, delimiter } = readHeaders(content);
  const dateOrder = RECIPES[source].dateOrder;
  const asOf = toDayStart(today);

  const rows = parse(stripBom(content), {
    columns: true,
    delimiter,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  /** field -> the header that supplies it. */
  const byField = new Map<ImportField, string>();
  for (const [header, field] of Object.entries(mapping)) {
    if (field) byField.set(field as ImportField, header);
  }
  const cell = (row: Record<string, string>, field: ImportField): string => {
    const header = byField.get(field);
    if (!header) return "";
    return (row[header] ?? "").toString();
  };

  const drafts = new Map<string, PatientDraft>();
  let skippedRows = 0;
  let unparseableDates = 0;
  let unusablePhones = 0;
  let unusableEmails = 0;
  let futureAppointments = 0;
  let mergedRows = 0;

  for (const row of rows) {
    const identity = readIdentity(row, cell);
    if (!identity) {
      skippedRows++;
      continue;
    }

    const externalId = cell(row, "external_id").trim() || null;
    const rawEmail = cell(row, "email").trim();
    const rawPhone = cell(row, "phone").trim();
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawEmail && !email) unusableEmails++;
    if (rawPhone && !phone) unusablePhones++;

    const key = externalId
      ? `id:${externalId}`
      : `n:${identity.lastName.toLowerCase()}|${identity.firstName.toLowerCase()}|${email ?? phone ?? ""}`;

    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        externalId,
        firstName: identity.firstName,
        lastName: identity.lastName,
        email,
        phone,
        emailConsent: byField.has("email_consent") ? parseBooleanCell(cell(row, "email_consent")) : null,
        smsConsent: byField.has("sms_consent") ? parseBooleanCell(cell(row, "sms_consent")) : null,
        doNotContact: byField.has("do_not_contact") ? parseBooleanCell(cell(row, "do_not_contact")) : null,
        recallIntervalMonths: parseInterval(cell(row, "recall_interval_months")),
        visits: [],
        rowCount: 0,
      };
      drafts.set(key, draft);
    } else {
      mergedRows++;
      // Later rows fill gaps but never overwrite a value already read: the first
      // row for a chart is the patient record, the rest are their appointments.
      draft.email ??= email;
      draft.phone ??= phone;
      draft.recallIntervalMonths ??= parseInterval(cell(row, "recall_interval_months"));
    }
    draft.rowCount++;

    for (const field of ["visited_on", "last_visit_on", "next_appointment_on"] as const) {
      const raw = cell(row, field).trim();
      if (!raw) continue;
      const date = parsePmsDate(raw, dateOrder);
      if (!date) {
        unparseableDates++;
        continue;
      }
      if (date.getTime() > asOf.getTime()) futureAppointments++;
      const kind =
        field === "visited_on" ? classifyVisitKind(cell(row, "visit_kind")) : "hygiene";
      draft.visits.push({ visitedOn: date, kind });
    }
  }

  const patients = [...drafts.values()].map((p) => ({ ...p, visits: dedupeVisits(p.visits) }));

  return {
    headers,
    rowCount: rows.length,
    patients,
    sample: patients.slice(0, 8),
    skippedRows,
    anomalies: findAnomalies({
      rows: rows.length,
      patients,
      mapping,
      skippedRows,
      unparseableDates,
      unusablePhones,
      unusableEmails,
      futureAppointments,
      mergedRows,
    }),
  };
}

function readIdentity(
  row: Record<string, string>,
  cell: (r: Record<string, string>, f: ImportField) => string,
): { firstName: string; lastName: string } | null {
  const first = cell(row, "first_name").trim();
  const last = cell(row, "last_name").trim();
  if (first || last) {
    return { firstName: first || last, lastName: first ? last : "" };
  }
  const full = cell(row, "full_name").trim();
  return full ? splitName(full) : null;
}

/** Same day, same kind is the same appointment seen twice. */
function dedupeVisits(visits: VisitDraft[]): VisitDraft[] {
  const seen = new Set<string>();
  const out: VisitDraft[] = [];
  for (const v of visits) {
    const key = `${v.visitedOn.getTime()}|${v.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.sort((a, b) => a.visitedOn.getTime() - b.visitedOn.getTime());
}

function pct(n: number, of: number): number {
  return of === 0 ? 0 : Math.round((n / of) * 100);
}

/**
 * The preview's anomaly rows. Each one is a sentence an office manager can act
 * on, naming the number and the likely cause — "41% missing phone — check the
 * column you mapped to Mobile phone", not "validation warning".
 */
export function findAnomalies(input: {
  rows: number;
  patients: PatientDraft[];
  mapping: Record<string, string>;
  skippedRows: number;
  unparseableDates: number;
  unusablePhones: number;
  unusableEmails: number;
  futureAppointments: number;
  mergedRows: number;
}): Anomaly[] {
  const out: Anomaly[] = [];
  const total = input.patients.length;
  const mapped = new Set(Object.values(input.mapping));

  if (total === 0) {
    out.push({
      code: "no_patients",
      severity: "warn",
      message: "No patients could be read from this file. Check the name columns in the mapping.",
    });
    return out;
  }

  const noPhone = input.patients.filter((p) => !p.phone).length;
  if (pct(noPhone, total) >= 25) {
    out.push({
      code: "missing_phone",
      severity: "warn",
      message: `${pct(noPhone, total)}% of patients have no usable mobile number (${noPhone} of ${total}) — check the column mapped to Mobile phone.`,
    });
  }

  const noEmail = input.patients.filter((p) => !p.email).length;
  if (pct(noEmail, total) >= 25) {
    out.push({
      code: "missing_email",
      severity: "warn",
      message: `${pct(noEmail, total)}% of patients have no usable email address (${noEmail} of ${total}) — email campaigns will skip them.`,
    });
  }

  const noVisits = input.patients.filter((p) => p.visits.length === 0).length;
  if (noVisits > 0) {
    out.push({
      code: "no_visit_history",
      severity: pct(noVisits, total) >= 20 ? "warn" : "info",
      message: `${noVisits} ${noVisits === 1 ? "patient has" : "patients have"} no visit date in this file. They import, but cannot be counted as overdue.`,
    });
  }

  if (input.unparseableDates > 0) {
    out.push({
      code: "unparseable_dates",
      severity: "warn",
      message: `${input.unparseableDates} date ${input.unparseableDates === 1 ? "cell" : "cells"} could not be read and were ignored — if this is most of the file, the wrong column is mapped to a date.`,
    });
  }

  if (input.unusablePhones > 0) {
    out.push({
      code: "unusable_phones",
      severity: "info",
      message: `${input.unusablePhones} phone ${input.unusablePhones === 1 ? "number was" : "numbers were"} not a mobile-shaped 10-digit number (extensions and short numbers are skipped, never guessed).`,
    });
  }

  if (input.unusableEmails > 0) {
    out.push({
      code: "unusable_emails",
      severity: "info",
      message: `${input.unusableEmails} email ${input.unusableEmails === 1 ? "cell was" : "cells were"} not a valid address.`,
    });
  }

  if (input.skippedRows > 0) {
    out.push({
      code: "skipped_rows",
      severity: "warn",
      message: `${input.skippedRows} ${input.skippedRows === 1 ? "row" : "rows"} had no patient name and were skipped.`,
    });
  }

  if (input.mergedRows > 0) {
    out.push({
      code: "merged_rows",
      severity: "info",
      message: `${input.rows} rows collapsed to ${total} patients — ${input.mergedRows} rows were additional appointments for a patient already in the file.`,
    });
  }

  if (input.futureAppointments > 0) {
    out.push({
      code: "future_appointments",
      severity: "info",
      message: `${input.futureAppointments} ${input.futureAppointments === 1 ? "date is" : "dates are"} in the future. Those patients are already on the schedule and will not be chased.`,
    });
  }

  if (!mapped.has("sms_consent")) {
    out.push({
      code: "no_sms_consent_column",
      severity: "info",
      message: "No text-consent column mapped. SMS stays off for these patients until consent is imported or collected — email is unaffected.",
    });
  }

  return out;
}

/* --------------------------------------------------------------- writing out */

/** RFC 4180 quoting, and a leading-quote guard against CSV formula injection. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
