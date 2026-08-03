/**
 * src/lib/pms.ts
 *
 * Per-PMS export recipes and the normalisation they feed. Pure: string in,
 * structured patients out, no database and no I/O, because this is where a bad
 * import quietly poisons the overdue math (README risk 1) and it has to be
 * testable line by line.
 *
 * A recipe knows three things a generic CSV importer cannot:
 *
 *   1. **Which header means which field.** Dentrix writes "Pat Chart #", Open
 *      Dental writes "PatNum", Eaglesoft writes "Account". None of them writes
 *      "external_id".
 *   2. **How that PMS writes a date.** Dentrix and Eaglesoft are US
 *      month-first; Open Dental exports ISO. `01/02/2025` is January 2nd in the
 *      first two and February 1st is a plausible reading in neither — but a
 *      generic parser has to guess, and guessing wrong moves every due date by
 *      up to eleven months.
 *   3. **Its own file quirks** — a UTF-8 BOM, tab separation, "Last Name, First"
 *      in one column, `Y`/`N` consent flags.
 */

export type PmsSource = "dentrix" | "eaglesoft" | "opendental" | "other";

/** Every field an import can map a column onto. */
export type ImportField =
  | "external_id"
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "email_consent"
  | "sms_consent"
  | "do_not_contact"
  | "recall_interval_months"
  | "last_visit_on"
  | "visited_on"
  | "visit_kind"
  | "next_appointment_on";

export const IMPORT_FIELDS: ImportField[] = [
  "external_id",
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "email_consent",
  "sms_consent",
  "do_not_contact",
  "recall_interval_months",
  "last_visit_on",
  "visited_on",
  "visit_kind",
  "next_appointment_on",
];

export function fieldLabel(f: ImportField): string {
  switch (f) {
    case "external_id":
      return "Chart / patient ID";
    case "first_name":
      return "First name";
    case "last_name":
      return "Last name";
    case "full_name":
      return "Full name (one column)";
    case "email":
      return "Email";
    case "phone":
      return "Mobile phone";
    case "email_consent":
      return "Email consent";
    case "sms_consent":
      return "Text consent";
    case "do_not_contact":
      return "Do not contact";
    case "recall_interval_months":
      return "Recall interval (months)";
    case "last_visit_on":
      return "Last visit date";
    case "visited_on":
      return "Appointment / visit date";
    case "visit_kind":
      return "Visit type";
    case "next_appointment_on":
      return "Next scheduled appointment";
  }
}

/** Fields without which an import cannot produce a roster. */
export const REQUIRED_FIELDS: ImportField[][] = [
  ["first_name", "full_name"], // one of
  ["last_name", "full_name"], // one of
];

export interface PmsRecipe {
  id: PmsSource;
  name: string;
  /** Shown in the wizard: how to produce the file from this PMS. */
  exportSteps: string[];
  /** Header names that identify the file as this PMS's export. */
  fingerprints: string[];
  /** field -> candidate header names, normalised (lowercase, alphanumeric). */
  aliases: Partial<Record<ImportField, string[]>>;
  /** Date order to assume when a date is ambiguous. */
  dateOrder: "mdy" | "dmy" | "ymd";
  note: string;
}

const COMMON_ALIASES: Partial<Record<ImportField, string[]>> = {
  external_id: ["patientid", "patid", "chartnumber", "chartno", "chart", "id"],
  first_name: ["firstname", "first", "fname", "givenname", "patientfirstname"],
  last_name: ["lastname", "last", "lname", "surname", "patientlastname"],
  full_name: ["name", "patientname", "patient"],
  email: ["email", "emailaddress", "email1", "primaryemail"],
  phone: ["mobilephone", "cellphone", "cell", "mobile", "wirelessphone", "phone", "homephone", "primaryphone"],
  email_consent: ["emailconsent", "emailok", "allowemail", "consentemail"],
  sms_consent: ["smsconsent", "textok", "allowtext", "textmessageok", "consenttext", "smsok"],
  do_not_contact: ["donotcontact", "dnc", "nocontact", "donotcall"],
  recall_interval_months: ["recallinterval", "recallmonths", "recallintervalmonths", "hygieneinterval"],
  last_visit_on: ["lastvisit", "lastvisitdate", "lastseen", "datelastvisit", "lastapptdate"],
  visited_on: ["appointmentdate", "apptdate", "visitdate", "proceduredate", "dateofservice"],
  visit_kind: ["appointmenttype", "appttype", "procedure", "visittype", "proctype"],
  next_appointment_on: ["nextappointment", "nextapptdate", "nextvisit", "scheduledappointment"],
};

function withCommon(
  own: Partial<Record<ImportField, string[]>>,
): Partial<Record<ImportField, string[]>> {
  const out: Partial<Record<ImportField, string[]>> = {};
  for (const f of IMPORT_FIELDS) {
    const merged = [...(own[f] ?? []), ...(COMMON_ALIASES[f] ?? [])];
    if (merged.length) out[f] = [...new Set(merged)];
  }
  return out;
}

export const RECIPES: Record<PmsSource, PmsRecipe> = {
  dentrix: {
    id: "dentrix",
    name: "Dentrix",
    dateOrder: "mdy",
    note: "Dentrix writes dates month-first and pads chart numbers; consent columns are Y/N.",
    exportSteps: [
      "Open Office Manager → Letters & Custom Lists.",
      "Choose Misc → Patient Report (by filters), then Edit.",
      "Filter on Patient Status = Active, and clear the appointment-date filter.",
      "Under Data Fields tick: Chart Number, First Name, Last Name, Email, Mobile Phone, Last Visit Date, Continuing Care Interval.",
      "Click Create/Merge, then Export to comma-delimited (CSV) rather than opening in Word.",
    ],
    fingerprints: ["patchart", "chartnumber", "continuingcareinterval", "guarantor"],
    aliases: withCommon({
      external_id: ["patchart", "patientchartnumber", "chartnumber"],
      recall_interval_months: ["continuingcareinterval", "ccinterval"],
      last_visit_on: ["lastvisitdate", "lastvisit"],
      phone: ["mobilephone", "homephone", "wirelessphone"],
    }),
  },
  eaglesoft: {
    id: "eaglesoft",
    name: "Eaglesoft",
    dateOrder: "mdy",
    note: "Eaglesoft's list exports put the name in one column as \"Last, First\" and often use a tab delimiter.",
    exportSteps: [
      "Open the Patient List (Lists → Patients).",
      "Set Status to Active and Recall to All.",
      "Right-click the grid → Export → Text/CSV.",
      "Include Account, Patient Name, Email, Cell Phone, Last Visit, Recall Interval.",
      "Save as CSV; if Eaglesoft writes a .txt with tabs, upload it as-is — RecallDesk reads both.",
    ],
    fingerprints: ["account", "patientname", "recallinterval", "responsibleparty"],
    aliases: withCommon({
      external_id: ["account", "accountnumber", "acct"],
      full_name: ["patientname", "name"],
      phone: ["cellphone", "cell", "mobilephone"],
      last_visit_on: ["lastvisit", "lastvisitdate"],
      recall_interval_months: ["recallinterval"],
    }),
  },
  opendental: {
    id: "opendental",
    name: "Open Dental",
    dateOrder: "ymd",
    note: "Open Dental query exports are ISO-dated and use PatNum as the chart id; one row per appointment is normal.",
    exportSteps: [
      "Open Reports → Query (or Tools → Query if your build differs).",
      "Run a query selecting PatNum, FName, LName, Email, WirelessPhone, and the appointment's AptDateTime and AptType.",
      "Right-click the result grid → Export, and save as CSV.",
      "One row per appointment is fine — RecallDesk groups them by PatNum and works out the last hygiene visit.",
    ],
    fingerprints: ["patnum", "wirelessphone", "aptdatetime", "fname", "lname"],
    aliases: withCommon({
      external_id: ["patnum", "patientnum"],
      first_name: ["fname"],
      last_name: ["lname"],
      phone: ["wirelessphone", "wirelesspat", "hmphone"],
      visited_on: ["aptdatetime", "procdate", "aptdate"],
      visit_kind: ["apttype", "proccode", "aptstatus"],
      email_consent: ["emailok"],
      sms_consent: ["txtmsgok", "textmsgok"],
    }),
  },
  other: {
    id: "other",
    name: "Other / generic CSV",
    dateOrder: "mdy",
    note: "Any CSV with one row per patient (or per appointment) works — map the columns yourself and the mapping is saved for next time.",
    exportSteps: [
      "Export an active-patient list from your system as CSV.",
      "Include at minimum a first and last name, and a last-visit date.",
      "Email, mobile number and consent columns unlock the email and SMS channels.",
      "Upload it below; RecallDesk will guess the columns and let you correct them.",
    ],
    fingerprints: [],
    aliases: withCommon({}),
  },
};

export const PMS_SOURCES: PmsSource[] = ["dentrix", "eaglesoft", "opendental", "other"];

/** "Pat Chart #" -> "patchart". Headers are matched on this, never verbatim. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Which PMS wrote this file? Scores each recipe's fingerprints against the
 * header row. A tie or a blank goes to the generic recipe, which asks rather than
 * assumes.
 */
export function detectSource(headers: string[]): PmsSource {
  const norm = headers.map(normalizeHeader);
  let best: { id: PmsSource; hits: number } = { id: "other", hits: 0 };
  for (const id of PMS_SOURCES) {
    const recipe = RECIPES[id];
    const hits = recipe.fingerprints.filter((f) => norm.includes(f)).length;
    if (hits > best.hits) best = { id, hits };
  }
  return best.hits >= 2 ? best.id : "other";
}

/**
 * The recipe's suggested mapping for a real header row: `header -> field`.
 * Only the first header that matches a field wins, so a file with both
 * "Mobile Phone" and "Home Phone" maps the mobile one.
 */
export function suggestMapping(
  headers: string[],
  source: PmsSource,
): Record<string, ImportField> {
  const recipe = RECIPES[source];
  const mapping: Record<string, ImportField> = {};
  const taken = new Set<ImportField>();

  // Aliases are ordered by preference inside each field, so walk fields outer and
  // headers inner: "mobilephone" should win over "homephone" regardless of column
  // order in the file.
  for (const field of IMPORT_FIELDS) {
    if (taken.has(field)) continue;
    const aliases = recipe.aliases[field] ?? [];
    for (const alias of aliases) {
      const header = headers.find(
        (h) => normalizeHeader(h) === alias && !(h in mapping),
      );
      if (header) {
        mapping[header] = field;
        taken.add(field);
        break;
      }
    }
  }
  return mapping;
}

/** Is a mapping usable? Returns the human sentence to show when it is not. */
export function mappingProblems(mapping: Record<string, string>): string[] {
  const fields = new Set(Object.values(mapping));
  const problems: string[] = [];
  if (!fields.has("full_name") && !(fields.has("first_name") && fields.has("last_name"))) {
    problems.push("Map a first and last name column, or a single full-name column.");
  }
  if (!fields.has("last_visit_on") && !fields.has("visited_on")) {
    problems.push(
      "Map a last-visit date or an appointment-date column — without one, nobody can be overdue.",
    );
  }
  return problems;
}

/* ------------------------------------------------------------------ values */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse a date out of a PMS export into UTC midnight, honouring the recipe's
 * field order for ambiguous numeric dates.
 *
 * Returns null rather than a guess for anything it cannot read — the preview
 * counts those and shows them, because a silently-dropped date is a patient who
 * looks like they have never been seen.
 */
export function parsePmsDate(raw: string, order: "mdy" | "dmy" | "ymd"): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO, optionally with a time (Open Dental's AptDateTime).
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?/.exec(s);
  if (iso) return utc(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // 14-Nov-2024 / 14 Nov 2024 / Nov 14, 2024
  const named = /^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/.exec(s);
  if (named) {
    const m = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (m) return utc(expandYear(Number(named[3])), m, Number(named[1]));
  }
  const named2 = /^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(s);
  if (named2) {
    const m = MONTHS[named2[1].slice(0, 3).toLowerCase()];
    if (m) return utc(expandYear(Number(named2[3])), m, Number(named2[2]));
  }

  // Numeric with / . or - separators, optionally followed by a time.
  const numeric = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)?$/.exec(s);
  if (!numeric) return null;
  const a = Number(numeric[1]);
  const b = Number(numeric[2]);
  const c = Number(numeric[3]);

  if (numeric[1].length === 4) return utc(a, b, c); // 2024/11/14
  if (order === "ymd" && c > 31) return utc(c, a, b);

  // Two ambiguous numbers and a year. The recipe decides; a value over 12
  // decides for itself.
  let day: number;
  let month: number;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else if (order === "dmy") {
    day = a;
    month = b;
  } else {
    month = a;
    day = b;
  }
  return utc(expandYear(c), month, day);
}

function expandYear(y: number): number {
  if (y >= 1000) return y;
  // A two-digit year in a dental export is not 1930.
  return y <= 69 ? 2000 + y : 1900 + y;
}

function utc(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

const TRUTHY = new Set(["y", "yes", "true", "t", "1", "on", "ok", "allowed", "x"]);
const FALSY = new Set(["n", "no", "false", "f", "0", "off", "none", "blocked", ""]);

/** Y/N/1/0/true/false, and null when the cell says nothing either way. */
export function parseBooleanCell(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (TRUTHY.has(s)) return true;
  if (FALSY.has(s)) return false;
  return null;
}

/**
 * A phone number reduced to E.164 for the US/Canada, or null.
 *
 * Deliberately strict: `(512) 555-0147 x2` is a workplace switchboard, not a
 * mobile, and `555-0147` has no area code. Sending an SMS to a number we had to
 * guess at is how a practice pays for messages that reach a stranger.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/\b(x|ext|extension)\b/i.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    if (digits[0] === "0" || digits[0] === "1") return null; // not a valid NANP area code
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const rest = digits.slice(1);
    if (rest[0] === "0" || rest[0] === "1") return null;
    return `+${digits}`;
  }
  if (trimmed.startsWith("+") && digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[A-Za-z]{2,}$/;

export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  // Some exports put two addresses in one cell.
  const first = s.split(/[;,]/)[0].trim();
  return EMAIL_RE.test(first) ? first : null;
}

/**
 * Split a one-column name. Eaglesoft writes "Mbeki, Rosalind"; a generic export
 * writes "Rosalind Mbeki". Suffixes and middle names go to the first name so that
 * nothing is silently dropped from a chart.
 */
export function splitName(raw: string): { firstName: string; lastName: string } | null {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.includes(",")) {
    const [last, rest] = s.split(",", 2);
    const first = (rest ?? "").trim();
    if (!last.trim()) return null;
    return { firstName: first || last.trim(), lastName: first ? last.trim() : "" };
  }
  const parts = s.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Hygiene or not, from whatever the PMS calls its appointment types. */
export function classifyVisitKind(raw: string): "hygiene" | "other" {
  const s = raw.toLowerCase();
  if (!s) return "hygiene";
  if (/(hyg|proph|recall|recare|perio|clean|scal|d11\d\d|d43\d\d|adult|child)/.test(s)) {
    return "hygiene";
  }
  return "other";
}

/** Recall interval cells: "6", "6 months", "0006", "12M". */
export function parseInterval(raw: string): number | null {
  const m = /(\d{1,2})/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 24 ? n : null;
}
