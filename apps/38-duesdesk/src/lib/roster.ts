/**
 * The roster: households, the people in them, and the turnover record.
 *
 * The roster is the association's institutional memory, so nothing here deletes
 * history. A sold home *closes* its household with `left_on` and opens a
 * successor; balances stay with the household that incurred them, because a
 * buyer inheriting the seller's arrears by software default is how a small board
 * ends up in front of a magistrate.
 *
 * CSV import is tolerant about columns and strict about rows: a row it cannot
 * understand is reported, never guessed at. The preview runs the identical
 * parser as the commit, so what the treasurer approves is what happens.
 */

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  households,
  members,
  type Household,
  type Member,
} from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import {
  parseRoster,
  type ImportProblem,
  type ImportRow,
  type ParsedRoster,
} from "@/lib/csv";
import { today, type IsoDate } from "@/lib/dates";
import { mintPortalToken, portalUrl } from "@/lib/portal";
import { csvField, normalizePhone } from "@/lib/text";

export { parseCsv, mapHeader, parseFlexibleDate, parseRoster } from "@/lib/csv";
export type { ImportProblem, ImportRow, ParsedRoster } from "@/lib/csv";

export interface ImportPreview extends ParsedRoster {
  /** Units already on the roster; importing again updates contacts, not history. */
  existingUnits: string[];
}

export async function previewImport(
  associationId: string,
  text: string,
): Promise<ImportPreview> {
  const parsed = parseRoster(text);
  const db = getDb();
  const existing = await db
    .select({ unitLabel: households.unitLabel })
    .from(households)
    .where(and(eq(households.associationId, associationId), isNull(households.leftOn)));
  const existingSet = new Set(existing.map((e) => e.unitLabel.toLowerCase()));
  return {
    ...parsed,
    existingUnits: parsed.rows
      .filter((r) => existingSet.has(r.unitLabel.toLowerCase()))
      .map((r) => r.unitLabel),
  };
}

export interface ImportResult {
  createdHouseholds: number;
  updatedHouseholds: number;
  createdMembers: number;
  problems: ImportProblem[];
}

/**
 * Commit an import. Existing open units gain any new people and an updated
 * mailing address; they never get a second household row, and their `joined_on`
 * is never rewritten — that date is the turnover record.
 */
export async function importRoster(
  associationId: string,
  text: string,
  actor: Actor,
): Promise<ImportResult> {
  const { rows, problems } = parseRoster(text);
  const db = getDb();
  const result: ImportResult = {
    createdHouseholds: 0,
    updatedHouseholds: 0,
    createdMembers: 0,
    problems,
  };

  for (const row of rows) {
    const [existing] = await db
      .select()
      .from(households)
      .where(
        and(
          eq(households.associationId, associationId),
          eq(households.unitLabel, row.unitLabel),
          isNull(households.leftOn),
        ),
      );

    let household = existing;
    if (!household) {
      [household] = await db
        .insert(households)
        .values({
          associationId,
          unitLabel: row.unitLabel,
          mailingAddress: row.mailingAddress,
          joinedOn: row.joinedOn,
        })
        .returning();
      result.createdHouseholds += 1;
    } else {
      if (row.mailingAddress && row.mailingAddress !== household.mailingAddress) {
        await db
          .update(households)
          .set({ mailingAddress: row.mailingAddress })
          .where(eq(households.id, household.id));
      }
      result.updatedHouseholds += 1;
    }

    const current = await db.select().from(members).where(eq(members.householdId, household.id));
    for (const person of row.people) {
      const already = current.find(
        (m) =>
          (person.email && m.email === person.email) ||
          m.name.toLowerCase() === person.name.toLowerCase(),
      );
      if (already) continue;
      await db.insert(members).values({
        householdId: household.id,
        name: person.name,
        email: person.email,
        phone: person.phone,
        // SMS consent is never imported. TCPA consent belongs to the member.
        smsOptIn: false,
        isPrimary: person.isPrimary && current.length === 0,
      });
      result.createdMembers += 1;
    }
  }

  await audit(associationId, actor, "imported_roster", `${rows.length} rows`, {
    createdHouseholds: result.createdHouseholds,
    updatedHouseholds: result.updatedHouseholds,
    createdMembers: result.createdMembers,
    problems: problems.length,
  });
  return result;
}

/* ---------------------------------------------------------------- lifecycle --- */

export async function createHousehold(
  associationId: string,
  input: {
    unitLabel: string;
    mailingAddress?: string | null;
    joinedOn: IsoDate;
    primaryName: string;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
  },
  actor: Actor,
): Promise<Household> {
  if (!input.unitLabel.trim()) throw new Error("Give the unit a label — members recognise it");
  if (!input.primaryName.trim()) throw new Error("Give the primary contact a name");
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({
      associationId,
      unitLabel: input.unitLabel.trim(),
      mailingAddress: input.mailingAddress?.trim() || null,
      joinedOn: input.joinedOn,
    })
    .returning();
  await db.insert(members).values({
    householdId: household.id,
    name: input.primaryName.trim(),
    email: input.primaryEmail?.trim().toLowerCase() || null,
    phone: input.primaryPhone ? normalizePhone(input.primaryPhone) : null,
    isPrimary: true,
  });
  await audit(associationId, actor, "added_household", `unit ${household.unitLabel}`, {
    householdId: household.id,
  });
  return household;
}

export async function addMember(
  householdId: string,
  input: { name: string; email?: string | null; phone?: string | null },
  actor: Actor,
): Promise<Member> {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  if (!household) throw new Error("No such household");
  const existing = await db.select().from(members).where(eq(members.householdId, householdId));
  const [member] = await db
    .insert(members)
    .values({
      householdId,
      name: input.name.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone ? normalizePhone(input.phone) : null,
      isPrimary: existing.length === 0,
    })
    .returning();
  await audit(household.associationId, actor, "added_member", `unit ${household.unitLabel}`, {
    householdId,
    memberId: member.id,
  });
  return member;
}

/**
 * A home changed hands. The old household closes on `leftOn` and a new one opens
 * the next day. Outstanding balances stay with the seller's household — visible,
 * unpaid, and attached to the people who owed them.
 */
export async function transferOwnership(
  householdId: string,
  input: {
    leftOn: IsoDate;
    newPrimaryName: string;
    newPrimaryEmail?: string | null;
    newPrimaryPhone?: string | null;
    joinedOn: IsoDate;
  },
  actor: Actor,
): Promise<Household> {
  const db = getDb();
  const [outgoing] = await db.select().from(households).where(eq(households.id, householdId));
  if (!outgoing) throw new Error("No such household");
  if (outgoing.leftOn) throw new Error("That household has already been closed");

  // Close first: the partial unique index only allows one open household per unit.
  await db.update(households).set({ leftOn: input.leftOn }).where(eq(households.id, householdId));

  const [incoming] = await db
    .insert(households)
    .values({
      associationId: outgoing.associationId,
      unitLabel: outgoing.unitLabel,
      mailingAddress: outgoing.mailingAddress,
      joinedOn: input.joinedOn,
      notes: `Succeeded the household that left on ${input.leftOn}.`,
    })
    .returning();

  await db
    .update(households)
    .set({ succeededById: incoming.id })
    .where(eq(households.id, householdId));

  await db.insert(members).values({
    householdId: incoming.id,
    name: input.newPrimaryName.trim(),
    email: input.newPrimaryEmail?.trim().toLowerCase() || null,
    phone: input.newPrimaryPhone ? normalizePhone(input.newPrimaryPhone) : null,
    isPrimary: true,
  });

  await audit(
    outgoing.associationId,
    actor,
    "transferred_ownership",
    `unit ${outgoing.unitLabel}`,
    { from: householdId, to: incoming.id, leftOn: input.leftOn, joinedOn: input.joinedOn },
  );
  return incoming;
}

/* ------------------------------------------------------------------ queries --- */

export interface RosterEntry {
  household: Household;
  members: Member[];
}

export async function roster(
  associationId: string,
  options: { includeClosed?: boolean } = {},
): Promise<RosterEntry[]> {
  const db = getDb();
  const where = options.includeClosed
    ? eq(households.associationId, associationId)
    : and(eq(households.associationId, associationId), isNull(households.leftOn));
  const rows = await db.select().from(households).where(where).orderBy(asc(households.unitLabel));
  if (rows.length === 0) return [];
  const all = await db
    .select({ member: members })
    .from(members)
    .innerJoin(households, eq(members.householdId, households.id))
    .where(eq(households.associationId, associationId))
    .orderBy(desc(members.isPrimary), asc(members.name));
  return rows.map((household) => ({
    household,
    members: all.filter(({ member }) => member.householdId === household.id).map((r) => r.member),
  }));
}

export async function householdWithMembers(
  householdId: string,
): Promise<RosterEntry | null> {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  if (!household) return null;
  const rows = await db
    .select()
    .from(members)
    .where(eq(members.householdId, householdId))
    .orderBy(desc(members.isPrimary), asc(members.name));
  return { household, members: rows };
}

export async function activeHouseholdCount(associationId: string): Promise<number> {
  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(households)
    .where(and(eq(households.associationId, associationId), isNull(households.leftOn)));
  return count;
}

/**
 * The board-turnover artifact: everything a successor needs, as a CSV any
 * spreadsheet opens. Portal tokens are deliberately *not* included — exporting
 * live payment links into a file that gets emailed around is a security hole.
 */
export async function rosterExportCsv(associationId: string): Promise<string> {
  const entries = await roster(associationId, { includeClosed: true });
  const header = [
    "unit",
    "status",
    "joined_on",
    "left_on",
    "mailing_address",
    "member_name",
    "member_email",
    "member_phone",
    "is_primary",
    "sms_opt_in",
  ];
  const escape = csvField;
  const lines = [header.join(",")];
  for (const { household, members: people } of entries) {
    const status = household.leftOn ? "closed" : "active";
    if (people.length === 0) {
      lines.push(
        [
          escape(household.unitLabel),
          status,
          household.joinedOn,
          household.leftOn ?? "",
          escape(household.mailingAddress),
          "",
          "",
          "",
          "",
          "",
        ].join(","),
      );
      continue;
    }
    for (const member of people) {
      lines.push(
        [
          escape(household.unitLabel),
          status,
          household.joinedOn,
          household.leftOn ?? "",
          escape(household.mailingAddress),
          escape(member.name),
          escape(member.email),
          escape(member.phone),
          member.isPrimary ? "yes" : "no",
          member.smsOptIn ? "yes" : "no",
        ].join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}

/** Mint and return a fresh portal link, invalidating any previous one. */
export async function issuePortalLink(memberId: string, actor: Actor): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ member: members, household: households })
    .from(members)
    .innerJoin(households, eq(members.householdId, households.id))
    .where(eq(members.id, memberId));
  if (!row) throw new Error("No such member");
  const link = portalUrl(await mintPortalToken(memberId));
  await audit(
    row.household.associationId,
    actor,
    "issued_portal_link",
    `${row.member.name} · unit ${row.household.unitLabel}`,
    { memberId },
  );
  return link;
}
