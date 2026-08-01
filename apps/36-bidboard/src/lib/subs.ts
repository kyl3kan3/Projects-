/**
 * The GC's private sub directory, and the CSV import that fills it.
 *
 * The directory is the switching cost and the reason a GC will paste 50 rows in on
 * day one. So the import has to survive what really comes out of a bookkeeper's
 * spreadsheet: quoted commas, semicolon-separated trades, "Div 26", duplicate
 * companies with three contacts each, a header row with different capitalisation
 * — or no header row at all.
 *
 * The parser is pure and tested (subs.test.ts). Nothing about it touches the
 * database, so a preview of "what will be imported" is the same code as the import.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { subCompanies, subContacts, type SubCompany, type SubContact } from "@/db/schema";
import { audit } from "@/lib/audit";
import { parseDivision } from "@/lib/csi";

/* --------------------------------------------------------------- CSV parse --- */

/** RFC4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === "\t") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // handled by the \n that follows
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ImportRow {
  company: string;
  contactName: string;
  email: string;
  phone: string | null;
  trades: string[];
  city: string | null;
  notes: string | null;
}

export interface ImportPreview {
  rows: ImportRow[];
  /** Row number (1-based, counting the header) and why it was skipped. */
  skipped: { line: number; raw: string; reason: string }[];
  /** How the columns were understood, so the estimator can see we read it right. */
  columns: Record<string, number>;
}

const HEADER_ALIASES: Record<string, string[]> = {
  company: ["company", "sub", "subcontractor", "vendor", "firm", "business", "company name"],
  contactName: ["contact", "name", "contact name", "person", "rep"],
  email: ["email", "e-mail", "email address", "mail"],
  phone: ["phone", "telephone", "mobile", "cell", "phone number"],
  trades: ["trade", "trades", "division", "divisions", "csi", "csi division", "scope"],
  city: ["city", "town", "location"],
  notes: ["notes", "note", "comment", "comments"],
};

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/**
 * Read a pasted spreadsheet into rows.
 *
 * A header row is detected, not required: if the first line has no recognisable
 * header, the columns are assumed to be company, contact, email, phone, trades —
 * and any row without a usable email is skipped with a reason rather than silently
 * dropped, because a sub who never gets the invite is a bid that never arrives.
 */
export function parseSubImport(text: string): ImportPreview {
  const grid = parseCsv(text);
  if (grid.length === 0) return { rows: [], skipped: [], columns: {} };

  const columns: Record<string, number> = {};
  const header = grid[0].map((c) => c.trim().toLowerCase());
  let headerFound = false;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex((h) => aliases.includes(h));
    if (idx >= 0) {
      columns[field] = idx;
      headerFound = true;
    }
  }

  if (!headerFound) {
    Object.assign(columns, { company: 0, contactName: 1, email: 2, phone: 3, trades: 4 });
  }

  const body = headerFound ? grid.slice(1) : grid;
  const offset = headerFound ? 2 : 1;
  const rows: ImportRow[] = [];
  const skipped: ImportPreview["skipped"] = [];

  body.forEach((cells, i) => {
    const at = (field: string): string =>
      columns[field] === undefined ? "" : (cells[columns[field]] ?? "").trim();

    const company = at("company");
    let email = at("email").toLowerCase();
    // A spreadsheet that put the email in the contact column is common enough to
    // handle rather than reject.
    if (!EMAIL_RE.test(email)) {
      const anywhere = cells.map((c) => c.trim()).find((c) => EMAIL_RE.test(c.toLowerCase()));
      if (anywhere) email = anywhere.toLowerCase();
    }

    const line = i + offset;
    if (!company) {
      skipped.push({ line, raw: cells.join(", ").slice(0, 120), reason: "no company name" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      skipped.push({
        line,
        raw: cells.join(", ").slice(0, 120),
        reason: "no usable email address",
      });
      return;
    }

    const trades = at("trades")
      .split(/[;|/]+|,\s*(?=\D)/)
      .map((t) => parseDivision(t))
      .filter((t): t is string => t !== null);

    rows.push({
      company: company.slice(0, 120),
      contactName: (at("contactName") || email.split("@")[0]).slice(0, 120),
      email: email.slice(0, 200),
      phone: at("phone").slice(0, 40) || null,
      trades: [...new Set(trades)],
      city: at("city").slice(0, 80) || null,
      notes: at("notes").slice(0, 500) || null,
    });
  });

  return { rows, skipped, columns };
}

/* ------------------------------------------------------------------ writes --- */

export interface ImportResult {
  companiesCreated: number;
  companiesUpdated: number;
  contactsCreated: number;
  contactsSkipped: number;
}

/**
 * Apply an import. Idempotent on (company, name) and (sub, email), so pasting the
 * same sheet twice adds nothing the second time — an estimator will absolutely do
 * that, and duplicate subs mean duplicate invites.
 */
export async function importSubs(
  companyId: string,
  actor: { userId: string; label: string },
  rows: ImportRow[],
): Promise<ImportResult> {
  const db = getDb();
  const result: ImportResult = {
    companiesCreated: 0,
    companiesUpdated: 0,
    contactsCreated: 0,
    contactsSkipped: 0,
  };

  for (const row of rows) {
    const [existing] = await db
      .select()
      .from(subCompanies)
      .where(and(eq(subCompanies.companyId, companyId), eq(subCompanies.name, row.company)));

    let sub: SubCompany;
    if (existing) {
      const mergedTrades = [...new Set([...existing.trades, ...row.trades])].sort();
      const changed =
        mergedTrades.join(",") !== existing.trades.join(",") ||
        (!existing.city && row.city) ||
        (!existing.notes && row.notes);
      if (changed) {
        const [updated] = await db
          .update(subCompanies)
          .set({
            trades: mergedTrades,
            city: existing.city ?? row.city,
            notes: existing.notes ?? row.notes,
          })
          .where(eq(subCompanies.id, existing.id))
          .returning();
        sub = updated;
        result.companiesUpdated += 1;
      } else {
        sub = existing;
      }
    } else {
      const [created] = await db
        .insert(subCompanies)
        .values({
          companyId,
          name: row.company,
          trades: [...row.trades].sort(),
          city: row.city,
          notes: row.notes,
          source: "import",
        })
        .returning();
      sub = created;
      result.companiesCreated += 1;
    }

    const [contact] = await db
      .select()
      .from(subContacts)
      .where(and(eq(subContacts.subCompanyId, sub.id), eq(subContacts.email, row.email)));
    if (contact) {
      result.contactsSkipped += 1;
      continue;
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subContacts)
      .where(eq(subContacts.subCompanyId, sub.id));
    await db.insert(subContacts).values({
      companyId,
      subCompanyId: sub.id,
      name: row.contactName,
      email: row.email,
      phone: row.phone,
      isPrimary: Number(count) === 0,
    });
    result.contactsCreated += 1;
  }

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "subs.imported",
    target: "sub_directory",
    metadata: { ...result, rows: rows.length },
  });

  return result;
}

export async function createSubCompany(
  companyId: string,
  input: {
    name: string;
    trades: string[];
    city: string | null;
    notes: string | null;
    contactName: string;
    contactEmail: string;
    contactPhone: string | null;
  },
): Promise<SubCompany> {
  const db = getDb();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Give the sub a company name");
  if (!EMAIL_RE.test(input.contactEmail.trim().toLowerCase())) {
    throw new Error("Enter a valid contact email — it is where the invite goes");
  }

  const [existing] = await db
    .select()
    .from(subCompanies)
    .where(and(eq(subCompanies.companyId, companyId), eq(subCompanies.name, name)));
  if (existing) throw new Error(`${name} is already in your directory`);

  const [sub] = await db
    .insert(subCompanies)
    .values({
      companyId,
      name,
      trades: [...new Set(input.trades)].sort(),
      city: input.city?.trim().slice(0, 80) || null,
      notes: input.notes?.trim().slice(0, 1000) || null,
      source: "manual",
    })
    .returning();

  await db.insert(subContacts).values({
    companyId,
    subCompanyId: sub.id,
    name: input.contactName.trim().slice(0, 120) || input.contactEmail.split("@")[0],
    email: input.contactEmail.trim().toLowerCase().slice(0, 200),
    phone: input.contactPhone?.trim().slice(0, 40) || null,
    isPrimary: true,
  });

  return sub;
}

export async function addSubContact(
  companyId: string,
  subCompanyId: string,
  input: { name: string; email: string; phone: string | null },
): Promise<void> {
  const db = getDb();
  const [sub] = await db
    .select()
    .from(subCompanies)
    .where(and(eq(subCompanies.id, subCompanyId), eq(subCompanies.companyId, companyId)));
  if (!sub) throw new Error("That sub is not in your directory");
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address");

  await db
    .insert(subContacts)
    .values({
      companyId,
      subCompanyId: sub.id,
      name: input.name.trim().slice(0, 120) || email.split("@")[0],
      email: email.slice(0, 200),
      phone: input.phone?.trim().slice(0, 40) || null,
      isPrimary: false,
    })
    .onConflictDoNothing({ target: [subContacts.subCompanyId, subContacts.email] });
}

export async function updateSubNotes(
  companyId: string,
  subCompanyId: string,
  input: { notes: string | null; performanceNote: string | null; trades: string[] },
): Promise<void> {
  const db = getDb();
  await db
    .update(subCompanies)
    .set({
      notes: input.notes?.trim().slice(0, 1000) || null,
      performanceNote: input.performanceNote?.trim().slice(0, 300) || null,
      trades: [...new Set(input.trades)].sort(),
    })
    .where(and(eq(subCompanies.id, subCompanyId), eq(subCompanies.companyId, companyId)));
}

export interface DirectoryEntry {
  sub: SubCompany;
  contacts: SubContact[];
}

export async function listDirectory(
  companyId: string,
  filterTrade?: string | null,
): Promise<DirectoryEntry[]> {
  const db = getDb();
  const subs = await db
    .select()
    .from(subCompanies)
    .where(eq(subCompanies.companyId, companyId))
    .orderBy(asc(subCompanies.name));
  const contacts = await db
    .select()
    .from(subContacts)
    .where(eq(subContacts.companyId, companyId))
    .orderBy(asc(subContacts.name));

  const filtered = filterTrade ? subs.filter((s) => s.trades.includes(filterTrade)) : subs;
  return filtered.map((sub) => ({
    sub,
    contacts: contacts.filter((c) => c.subCompanyId === sub.id),
  }));
}

/** Trade coverage: how many subs the GC can call for each division they cover. */
export async function tradeCoverage(companyId: string): Promise<Map<string, number>> {
  const db = getDb();
  const subs = await db
    .select({ trades: subCompanies.trades })
    .from(subCompanies)
    .where(eq(subCompanies.companyId, companyId));
  const counts = new Map<string, number>();
  for (const s of subs) {
    for (const t of s.trades) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}
