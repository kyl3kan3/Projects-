/**
 * src/server/clients.ts
 *
 * Reading and seeding the stylist's book.
 *
 * The list is the stylist's own asset — README calls it the stored value that makes
 * ChairFlow worth staying with — so it is queried whole, with the cadence line and the
 * card-on-file state attached, and it is readable whatever the subscription is doing.
 */

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  cadences,
  clients,
  services,
  type Cadence,
  type Client,
} from "@/db/schema";
import { seedCadence } from "@/server/cadence";
import { audit } from "@/server/audit";
import { parseImport, type ImportSummary } from "@/lib/csv";
import { normalizePhone } from "@/lib/format";

export interface ClientListRow {
  client: Client;
  cadence: (Cadence & { serviceName: string }) | null;
  lastVisitOn: string | null;
  upcoming: number;
}

/**
 * The Clients screen's rows.
 *
 * The cadence shown is the tightest one — the service they come back for most often —
 * because "every 3 weeks" is the sentence that matters, and a client with three cadences
 * still only has one rhythm the stylist thinks in.
 */
export async function clientList(
  stylistId: string,
  search: string | null,
): Promise<ClientListRow[]> {
  const db = getDb();
  const term = search?.trim();
  const digits = term ? term.replace(/\D/g, "") : "";

  const where = term
    ? and(
        eq(clients.stylistId, stylistId),
        or(
          ilike(clients.firstName, `%${term}%`),
          ilike(clients.lastName, `%${term}%`),
          digits.length >= 3 ? ilike(clients.phone, `%${digits}%`) : undefined,
        ),
      )
    : eq(clients.stylistId, stylistId);

  const rows = await db
    .select()
    .from(clients)
    .where(where)
    .orderBy(asc(clients.firstName))
    .limit(300);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const cadenceRows = await db
    .select({ cadence: cadences, serviceName: services.name })
    .from(cadences)
    .innerJoin(services, eq(services.id, cadences.serviceId))
    .where(inArray(cadences.clientId, ids));

  const lastVisits = await db
    .select({
      clientId: appointments.clientId,
      lastAt: sql<string | null>`max(${appointments.startsAt})`,
    })
    .from(appointments)
    .where(and(inArray(appointments.clientId, ids), eq(appointments.status, "completed")))
    .groupBy(appointments.clientId);

  const upcomingRows = await db
    .select({
      clientId: appointments.clientId,
      count: sql<number>`count(*)::int`,
    })
    .from(appointments)
    .where(and(inArray(appointments.clientId, ids), eq(appointments.status, "booked")))
    .groupBy(appointments.clientId);

  return rows.map((client) => {
    const mine = cadenceRows
      .filter((c) => c.cadence.clientId === client.id)
      .sort((a, b) => a.cadence.medianIntervalDays - b.cadence.medianIntervalDays);
    const tightest = mine[0];
    const lastAt = lastVisits.find((v) => v.clientId === client.id)?.lastAt ?? null;
    return {
      client,
      cadence: tightest
        ? { ...tightest.cadence, serviceName: tightest.serviceName }
        : null,
      lastVisitOn: lastAt ? String(lastAt).slice(0, 10) : null,
      upcoming: upcomingRows.find((u) => u.clientId === client.id)?.count ?? 0,
    };
  });
}

export async function clientById(id: string, stylistId: string): Promise<Client | null> {
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.stylistId, stylistId)));
  return client ?? null;
}

export async function saveClientNotes(input: {
  clientId: string;
  stylistId: string;
  notes: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(clients)
    .set({ notes: input.notes || null, updatedAt: new Date() })
    .where(and(eq(clients.id, input.clientId), eq(clients.stylistId, input.stylistId)));
}

/**
 * Turn SMS consent on or off by hand.
 *
 * Turning it *on* is refused for a client who has replied STOP. A stylist ticking a box
 * cannot overrule a consumer's opt-out — that is the whole point of the opt-out, and
 * TCPA does not care that the box was ticked in good faith.
 */
export async function setSmsConsent(input: {
  clientId: string;
  stylistId: string;
  consent: boolean;
  userId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = getDb();
  const client = await clientById(input.clientId, input.stylistId);
  if (!client) return { ok: false, message: "That client is not in your book." };
  if (input.consent && client.smsOptedOutAt) {
    return {
      ok: false,
      message:
        "This client replied STOP. Only they can re-open texts, by replying START — a checkbox here cannot overrule that.",
    };
  }
  await db
    .update(clients)
    .set({ smsConsent: input.consent, updatedAt: new Date() })
    .where(eq(clients.id, client.id));
  await audit({
    actor: { kind: "user", userId: input.userId },
    action: input.consent ? "client.sms_consent_on" : "client.sms_consent_off",
    target: client.id,
    stylistId: input.stylistId,
  });
  return { ok: true };
}

/**
 * CSV import, to seed a book and its cadences from whatever app the stylist is leaving.
 *
 * One date per client is not a rhythm, so an imported last-visit seeds an *estimated*
 * cadence at the chosen service's assumed interval and the screen says "estimated". The
 * first real completed visit replaces the estimate with arithmetic.
 *
 * Nothing is silently dropped: every refused row comes back with its line number.
 */
export async function importClients(input: {
  stylistId: string;
  userId: string;
  csv: string;
  seedServiceId: string | null;
  assumedIntervalDays: number;
}): Promise<ImportSummary> {
  const db = getDb();
  const parsed = parseImport(input.csv);
  let created = 0;
  let updated = 0;
  let cadencesSeeded = 0;

  for (const row of parsed.rows) {
    const phone = normalizePhone(row.phone);
    if (!phone) continue;
    const [existing] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.stylistId, input.stylistId), eq(clients.phone, phone)));

    let clientId: string;
    if (existing) {
      const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
      if (row.email && !existing.email) patch.email = row.email;
      if (row.lastName && !existing.lastName) patch.lastName = row.lastName;
      await db.update(clients).set(patch).where(eq(clients.id, existing.id));
      clientId = existing.id;
      updated += 1;
    } else {
      const [inserted] = await db
        .insert(clients)
        .values({
          stylistId: input.stylistId,
          firstName: row.firstName,
          lastName: row.lastName,
          phone,
          email: row.email,
          // An import is not consent. A list bought, exported or inherited says nothing
          // about whether these people agreed to be texted, and assuming they did is the
          // TCPA violation this product would be sued for.
          smsConsent: false,
        })
        .returning({ id: clients.id });
      clientId = inserted.id;
      created += 1;
    }

    if (row.lastVisitOn && input.seedServiceId) {
      await seedCadence({
        stylistId: input.stylistId,
        clientId,
        serviceId: input.seedServiceId,
        lastVisitOn: row.lastVisitOn,
        assumedIntervalDays: input.assumedIntervalDays,
      });
      cadencesSeeded += 1;
    }
  }

  await audit({
    actor: { kind: "user", userId: input.userId },
    action: "clients.imported",
    target: input.stylistId,
    stylistId: input.stylistId,
    metadata: { created, updated, cadencesSeeded, refused: parsed.problems.length },
  });

  return {
    created,
    updated,
    cadencesSeeded,
    problems: parsed.problems,
    total: parsed.rows.length,
  };
}

/** The no-show record on a client's card: how many, and when the last one was. */
export async function noShowHistory(clientId: string) {
  const db = getDb();
  return db
    .select({ appointment: appointments, service: services })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.clientId, clientId),
        inArray(appointments.status, ["no_show", "late_cancelled"]),
      ),
    )
    .orderBy(desc(appointments.startsAt))
    .limit(10);
}
