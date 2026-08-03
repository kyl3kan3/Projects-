/**
 * CSV in and out.
 *
 * In: the student import. Owners arrive with a spreadsheet or an incumbent's
 * export, so the header matcher is forgiving about case, spaces, underscores and
 * the handful of names Kicksite and Zen Planner actually emit ("Member Name",
 * "Current Rank", "Last Promoted"). A row that cannot be understood is reported
 * with its line number rather than silently dropped — a roster import that loses
 * four kids without saying so is worse than one that fails.
 *
 * Out: roster, promotions and certificate data. RFC-4180 quoting, CRLF, and a
 * leading apostrophe defence on anything that would otherwise be read as a
 * formula by a spreadsheet.
 */

import { parse } from "csv-parse/sync";

// ------------------------------------------------------------------ output

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Neutralise spreadsheet formula injection without mangling normal content.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

// ------------------------------------------------------------------- input

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELD_ALIASES: Record<string, string[]> = {
  firstName: ["firstname", "first", "givenname", "studentfirstname"],
  lastName: ["lastname", "last", "surname", "familyname", "studentlastname"],
  fullName: ["name", "studentname", "membername", "student", "member"],
  familyName: ["family", "household", "familyname2", "familygroup", "accountname"],
  guardianEmail: [
    "email",
    "guardianemail",
    "parentemail",
    "familyemail",
    "primaryemail",
    "contactemail",
  ],
  guardianPhone: ["phone", "guardianphone", "parentphone", "familyphone", "mobile", "cellphone"],
  program: ["program", "class", "programname", "discipline"],
  rank: ["rank", "belt", "currentrank", "currentbelt", "beltrank"],
  stripes: ["stripes", "stripe", "currentstripes", "tags"],
  promotedOn: ["promotedon", "lastpromoted", "lastpromotion", "rankdate", "beltdate", "promoted"],
  joinedOn: ["joinedon", "startdate", "joindate", "memberssince", "membersince", "enrolled"],
  birthdate: ["birthdate", "dob", "dateofbirth", "birthday"],
  pin: ["pin", "kioskpin", "checkinpin", "code"],
  notes: ["notes", "note", "comments"],
};

const HEADER_TO_FIELD = new Map<string, string>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) HEADER_TO_FIELD.set(alias, field);
}

export interface ImportRow {
  line: number;
  firstName: string;
  lastName: string;
  familyName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  program: string | null;
  rank: string | null;
  stripes: number;
  promotedOn: string | null;
  joinedOn: string | null;
  birthdate: string | null;
  pin: string | null;
  notes: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  problems: { line: number; message: string }[];
  /** Headers that were recognised, for the "we understood these columns" note. */
  recognised: string[];
  ignored: string[];
}

/**
 * Accepts "2024-03-15", "3/15/2024", "15/03/2024" (only when unambiguous) and
 * "Mar 15 2024". Returns "YYYY-MM-DD" or null. Ambiguity resolves US-first,
 * because the buyer is a US school and that is what their spreadsheet holds.
 */
export function parseDateish(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(text);
  if (m) {
    let [, a, b, y] = m;
    let year = Number(y);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    let month = Number(a);
    let day = Number(b);
    // Only reinterpret as day/month when the first field cannot be a month.
    if (month > 12 && day <= 12) [month, day] = [day, month];
    return iso(year, month, day);
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const stamp = Date.parse(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`,
  );
  if (Number.isNaN(stamp)) return null;
  return new Date(stamp).toISOString().slice(0, 10);
}

export function parseStudentCsv(text: string): ParsedImport {
  const problems: { line: number; message: string }[] = [];
  let records: string[][];
  try {
    records = parse(text.trim(), { skipEmptyLines: true, relaxColumnCount: true, bom: true });
  } catch (err) {
    return {
      rows: [],
      problems: [{ line: 1, message: err instanceof Error ? err.message : "could not read the file" }],
      recognised: [],
      ignored: [],
    };
  }
  if (records.length === 0) {
    return { rows: [], problems: [{ line: 1, message: "the file is empty" }], recognised: [], ignored: [] };
  }

  const headerRow = records[0];
  const mapping: (string | null)[] = headerRow.map(
    (h) => HEADER_TO_FIELD.get(normalizeHeader(h)) ?? null,
  );
  const recognised = [...new Set(mapping.filter((f): f is string => f !== null))];
  const ignored = headerRow.filter((_, i) => mapping[i] === null).map((h) => h.trim()).filter(Boolean);

  if (!recognised.includes("firstName") && !recognised.includes("fullName")) {
    return {
      rows: [],
      problems: [
        {
          line: 1,
          message:
            "No name column found. The file needs a “Name” column, or “First name” and “Last name”.",
        },
      ],
      recognised,
      ignored,
    };
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    const line = i + 1;
    const field = (name: string): string => {
      const idx = mapping.indexOf(name);
      return idx >= 0 ? (record[idx] ?? "").trim() : "";
    };

    let firstName = field("firstName");
    let lastName = field("lastName");
    if (!firstName) {
      const full = field("fullName");
      if (full) {
        // "Okafor, Marcus" and "Marcus Okafor" both happen in the wild.
        if (full.includes(",")) {
          const [last, first] = full.split(",", 2);
          firstName = (first ?? "").trim();
          lastName = last.trim();
        } else {
          const bits = full.split(/\s+/);
          firstName = bits[0] ?? "";
          lastName = bits.slice(1).join(" ");
        }
      }
    }
    if (!firstName) {
      problems.push({ line, message: "no student name in this row" });
      continue;
    }
    if (!lastName) lastName = "—";

    const promotedRaw = field("promotedOn");
    const joinedRaw = field("joinedOn");
    const birthRaw = field("birthdate");
    const promotedOn = promotedRaw ? parseDateish(promotedRaw) : null;
    const joinedOn = joinedRaw ? parseDateish(joinedRaw) : null;
    const birthdate = birthRaw ? parseDateish(birthRaw) : null;
    if (promotedRaw && !promotedOn) {
      problems.push({ line, message: `could not read the promotion date “${promotedRaw}”` });
    }
    if (joinedRaw && !joinedOn) {
      problems.push({ line, message: `could not read the join date “${joinedRaw}”` });
    }

    const stripesRaw = field("stripes");
    const stripes = stripesRaw ? Number.parseInt(stripesRaw.replace(/[^0-9]/g, ""), 10) : 0;
    const pinRaw = field("pin").replace(/[^0-9]/g, "");

    rows.push({
      line,
      firstName,
      lastName,
      familyName: field("familyName") || `${lastName} family`,
      guardianEmail: field("guardianEmail").toLowerCase() || null,
      guardianPhone: field("guardianPhone") || null,
      program: field("program") || null,
      rank: field("rank") || null,
      stripes: Number.isFinite(stripes) ? Math.max(0, stripes) : 0,
      promotedOn,
      joinedOn,
      birthdate,
      pin: pinRaw.length >= 4 ? pinRaw.slice(0, 6) : null,
      notes: field("notes"),
    });
  }

  return { rows, problems, recognised, ignored };
}
