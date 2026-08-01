/**
 * Promise-to-pay: "sending it Friday."
 *
 * This is where most AR conversations end and most cash-flow surprises begin, so
 * it is a first-class object rather than a note in a text field. A promise:
 *
 *   - pauses the ladder immediately (chasing someone who just told you a date is
 *     the fastest way to lose their goodwill),
 *   - feeds the forecast with its own confidence, drawn from that client's record
 *     of keeping promises,
 *   - and, if the date passes with money still owed, resumes the ladder one rung
 *     up with copy that names the date they gave — not a generic nudge.
 *
 * The watcher is date-pinned like everything else: a promise is resolved exactly
 * once, `open → kept | broken`, so it cannot generate a daily reminder about
 * itself.
 */

import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  invoices,
  promises,
  sequenceRuns,
  type Client,
  type Invoice,
  type PromiseSource,
  type PromiseRow,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { compareIso, isIsoDate, today, type IsoDate } from "@/lib/dates";

export interface LogPromiseInput {
  firmId: string;
  invoiceId: string;
  promisedFor: IsoDate;
  amountCents?: number;
  source: PromiseSource;
  note?: string;
  actor?: string;
}

export type LogPromiseResult =
  | { ok: true; promise: PromiseRow }
  | { ok: false; reason: string };

/**
 * Log a promise and pause the sequence.
 *
 * A promise for a date already past is refused: it is either a typo or a promise
 * that has already been broken, and recording it would silence the ladder on the
 * strength of nothing.
 */
export async function logPromise(input: LogPromiseInput): Promise<LogPromiseResult> {
  const db = getDb();
  if (!isIsoDate(input.promisedFor)) return { ok: false, reason: "Pick a date." };
  const asOf = today();
  if (compareIso(input.promisedFor, asOf) < 0) {
    return { ok: false, reason: "Pick today or a date in the future." };
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, input.firmId), eq(invoices.id, input.invoiceId)));
  if (!invoice) return { ok: false, reason: "Invoice not found." };
  if (invoice.balanceCents <= 0) return { ok: false, reason: "This invoice is already settled." };

  const amountCents = Math.min(
    invoice.balanceCents,
    Math.max(1, Math.round(input.amountCents ?? invoice.balanceCents)),
  );

  // One open promise per invoice: a second one supersedes the first.
  await db
    .update(promises)
    .set({ status: "broken", resolvedAt: new Date(), note: "Superseded by a newer promise" })
    .where(and(eq(promises.invoiceId, invoice.id), eq(promises.status, "open")));

  const [promise] = await db
    .insert(promises)
    .values({
      firmId: input.firmId,
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      promisedFor: input.promisedFor,
      amountCents,
      source: input.source,
      status: "open",
      note: input.note ?? null,
    })
    .returning();

  await db
    .update(sequenceRuns)
    .set({
      state: "paused_promise",
      pausedReason: `Promised ${input.promisedFor}`,
      escalateAfterBrokenPromise: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sequenceRuns.invoiceId, invoice.id),
        inArray(sequenceRuns.state, ["scheduled", "running", "awaiting_approval", "paused_reply"]),
      ),
    );

  await audit(
    input.firmId,
    input.actor ?? SYSTEM,
    "promise_logged",
    `${invoice.number} · ${input.promisedFor}`,
    { invoiceId: invoice.id, source: input.source, amountCents },
  );

  return { ok: true, promise };
}

export async function openPromiseFor(invoiceId: string): Promise<PromiseRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(promises)
    .where(and(eq(promises.invoiceId, invoiceId), eq(promises.status, "open")))
    .orderBy(desc(promises.createdAt))
    .limit(1);
  return row ?? null;
}

/** Mark any open promise on an invoice kept. Called when the balance clears. */
export async function keepPromisesFor(invoiceId: string, firmId: string): Promise<number> {
  const db = getDb();
  const kept = await db
    .update(promises)
    .set({ status: "kept", resolvedAt: new Date() })
    .where(and(eq(promises.invoiceId, invoiceId), eq(promises.status, "open")))
    .returning();
  for (const promise of kept) {
    await audit(firmId, SYSTEM, "promise_kept", promise.promisedFor, { invoiceId });
  }
  return kept.length;
}

export interface PromiseWatchSummary {
  broken: number;
  kept: number;
  resumed: number;
}

/**
 * The daily promise watcher.
 *
 * A promise whose date has passed with money still owed becomes `broken` — once —
 * and the run is un-paused with `escalateAfterBrokenPromise` set, which is the
 * one-time licence the ladder needs to move up a rung out of turn. The actual
 * send is still the ladder's decision and still goes through approval if the firm
 * is in approval mode.
 *
 * The comparison `promised_for < today` is done by the database on a `date`
 * column, so there is no JS Date and no millisecond-versus-microsecond hazard.
 */
export async function watchPromises(firmId: string | null, asOf: IsoDate = today()): Promise<PromiseWatchSummary> {
  const db = getDb();
  const summary: PromiseWatchSummary = { broken: 0, kept: 0, resumed: 0 };

  const due = await db
    .select({ promise: promises, invoice: invoices })
    .from(promises)
    .innerJoin(invoices, eq(invoices.id, promises.invoiceId))
    .where(
      firmId
        ? and(eq(promises.status, "open"), lt(promises.promisedFor, asOf), eq(promises.firmId, firmId))
        : and(eq(promises.status, "open"), lt(promises.promisedFor, asOf)),
    );

  for (const { promise, invoice } of due) {
    if (invoice.balanceCents <= 0) {
      await db
        .update(promises)
        .set({ status: "kept", resolvedAt: new Date() })
        .where(eq(promises.id, promise.id));
      await audit(promise.firmId, SYSTEM, "promise_kept", promise.promisedFor, {
        invoiceId: invoice.id,
      });
      summary.kept += 1;
      continue;
    }

    await db
      .update(promises)
      .set({ status: "broken", resolvedAt: new Date() })
      .where(eq(promises.id, promise.id));
    summary.broken += 1;

    const [resumed] = await db
      .update(sequenceRuns)
      .set({
        state: "scheduled",
        pausedReason: null,
        escalateAfterBrokenPromise: true,
        updatedAt: new Date(),
      })
      .where(
        and(eq(sequenceRuns.invoiceId, invoice.id), eq(sequenceRuns.state, "paused_promise")),
      )
      .returning();
    if (resumed) summary.resumed += 1;

    await audit(promise.firmId, SYSTEM, "promise_broken", `${invoice.number} · ${promise.promisedFor}`, {
      invoiceId: invoice.id,
      amountCents: promise.amountCents,
    });
  }

  return summary;
}

/* ------------------------------------------------------------------ reads --- */

export interface PromiseListItem {
  promise: PromiseRow;
  invoice: Invoice;
  client: Client;
}

export async function listPromises(firmId: string, limit = 100): Promise<PromiseListItem[]> {
  const db = getDb();
  return db
    .select({ promise: promises, invoice: invoices, client: clients })
    .from(promises)
    .innerJoin(invoices, eq(invoices.id, promises.invoiceId))
    .innerJoin(clients, eq(clients.id, promises.clientId))
    .where(eq(promises.firmId, firmId))
    .orderBy(asc(promises.status), asc(promises.promisedFor))
    .limit(limit);
}

export async function openPromisesByInvoice(firmId: string): Promise<Map<string, PromiseRow>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(promises)
    .where(and(eq(promises.firmId, firmId), eq(promises.status, "open")));
  return new Map(rows.map((row) => [row.invoiceId, row]));
}

/* -------------------------------------------------------- reply date parsing --- */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Guess a date from a reply. This is a **suggestion only** — never auto-created.
 *
 * Silencing a chase sequence on the strength of a regex reading "we'll look at
 * this in the new year" as a commitment would be worse than not parsing at all.
 * The dashboard shows the guess with a one-tap confirm, and a human decides.
 */
export function suggestPromiseDate(text: string, asOf: IsoDate = today()): IsoDate | null {
  const lower = text.toLowerCase();
  const base = new Date(`${asOf}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (days: number) => {
    const d = new Date(base.getTime() + days * 86_400_000);
    return iso(d);
  };

  if (/\btoday\b/.test(lower)) return asOf;
  if (/\btomorrow\b/.test(lower)) return plus(1);
  if (/\bend of (the )?week\b/.test(lower)) {
    const dow = base.getUTCDay();
    return plus((5 - dow + 7) % 7 || 7); // the coming Friday
  }
  if (/\bnext week\b/.test(lower)) return plus(7);
  if (/\bend of (the )?month\b/.test(lower)) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    return iso(d);
  }

  // "on the 14th", "by 14 July", "July 14"
  const explicit = /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)|(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/.exec(
    lower,
  );
  if (explicit) {
    const day = Number(explicit[1] ?? explicit[4]);
    const monthName = explicit[2] ?? explicit[3];
    const month = MONTHS.indexOf(monthName);
    if (month >= 0 && day >= 1 && day <= 31) {
      let year = base.getUTCFullYear();
      let candidate = new Date(Date.UTC(year, month, day));
      if (candidate.getTime() < base.getTime()) {
        year += 1;
        candidate = new Date(Date.UTC(year, month, day));
      }
      if (candidate.getUTCDate() === day) return iso(candidate);
    }
  }

  // A bare weekday means the next one of those.
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(lower)) {
      const dow = base.getUTCDay();
      const ahead = (i - dow + 7) % 7 || 7;
      return plus(ahead);
    }
  }
  return null;
}
