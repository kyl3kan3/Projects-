/**
 * The append-only tenant ledger, over the database.
 *
 * The arithmetic lives in ledger-core.ts and is tested there. This module owns
 * three things a pure function cannot:
 *
 *  - **Serialising writes.** `balance_after_cents` is a cache of a running total,
 *    so two concurrent posts must not both read the same "before". Every write
 *    takes `select … for update` on the tenancy row first, which makes the ledger
 *    per-tenancy serial and costs nothing at this scale.
 *  - **Exactly-once for periodic charges.** Monthly rent and a cycle's late fee
 *    carry a `period` and collide on a unique index instead of doubling up. `post`
 *    reports `duplicate` rather than throwing, so a retried tick is boring.
 *  - **Never editing.** There is no update path in this file. A correction is an
 *    `adjustment` row, and it is audited.
 */

import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ledgerEntries, tenancies, type LedgerEntry, type LedgerKind } from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  delinquency,
  statement as buildStatement,
  withRunningBalance,
  type CoreEntry,
  type Delinquency,
  type Statement,
} from "@/lib/ledger-core";
import { isoDateOf, type IsoDate, type Period } from "@/lib/money";

export interface PostInput {
  tenancyId: string;
  kind: LedgerKind;
  /** Signed cents: charges positive, money received negative. */
  amountCents: number;
  description: string;
  occurredOn: IsoDate;
  /** Set for anything that may exist only once per billing period. */
  period?: Period | null;
  stripePaymentIntentId?: string | null;
}

export interface PostResult {
  entry: LedgerEntry | null;
  balanceAfterCents: number;
  /** True when the unique index already held this row — nothing was written. */
  duplicate: boolean;
}

export async function post(input: PostInput): Promise<PostResult> {
  if (!Number.isInteger(input.amountCents)) {
    throw new Error("Ledger amounts are integer cents");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    // Serialise per tenancy: the running balance is a cache and a cache that two
    // writers computed from the same "before" is wrong for ever after.
    await tx.execute(sql`select id from ${tenancies} where ${tenancies.id} = ${input.tenancyId} for update`);

    const [agg] = await tx
      .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)::int` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.tenancyId, input.tenancyId));
    const before = Number(agg?.total ?? 0);

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenancyId: input.tenancyId,
        kind: input.kind,
        amountCents: input.amountCents,
        description: input.description,
        occurredOn: input.occurredOn,
        period: input.period ?? null,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        balanceAfterCents: before + input.amountCents,
      })
      .onConflictDoNothing()
      .returning();

    if (!entry) return { entry: null, balanceAfterCents: before, duplicate: true };

    /**
     * Re-cache the running balance for the whole tenancy, in **ledger order**.
     *
     * This is not belt-and-braces. A ledger row can be backdated — a payment
     * recorded on Monday for the cash that came in on Friday, a move-out credit
     * dated to the day the tenant left — and "the sum of everything that existed
     * when I was inserted" is then not the balance after that row. Left alone the
     * column drifts from the screen, which derives the balance from the rows, and
     * the two disagree in a document a lien sale depends on.
     *
     * One window function, bounded by the tenancy's own row count.
     */
    await tx.execute(sql`
      update ledger_entries as le
      set balance_after_cents = ordered.running
      from (
        select id,
               (sum(amount_cents) over (
                  order by occurred_on, created_at, id
                  rows between unbounded preceding and current row
               ))::int as running
        from ledger_entries
        where tenancy_id = ${input.tenancyId}
      ) as ordered
      where le.id = ordered.id
        and le.balance_after_cents <> ordered.running
    `);

    const [fresh] = await tx
      .select({ balanceAfterCents: ledgerEntries.balanceAfterCents })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.id, entry.id));

    return {
      entry: { ...entry, balanceAfterCents: fresh?.balanceAfterCents ?? entry.balanceAfterCents },
      balanceAfterCents: fresh?.balanceAfterCents ?? entry.balanceAfterCents,
      duplicate: false,
    };
  });
}

/**
 * A correction. It is a new row, always, and it is logged with who asked for it —
 * the lien packet prints the ledger verbatim and a tidied ledger is a ledger a
 * lawyer takes apart.
 */
export async function postAdjustment(
  ownerId: string,
  actor: string,
  input: Omit<PostInput, "kind" | "period">,
): Promise<PostResult> {
  const result = await post({ ...input, kind: "adjustment" });
  await audit(ownerId, actor, "ledger.adjustment", input.tenancyId, {
    amountCents: input.amountCents,
    description: input.description,
  });
  return result;
}

export async function entriesFor(tenancyId: string): Promise<LedgerEntry[]> {
  return getDb()
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.tenancyId, tenancyId))
    .orderBy(asc(ledgerEntries.occurredOn), asc(ledgerEntries.createdAt));
}

export async function entriesForMany(
  tenancyIds: readonly string[],
): Promise<Map<string, LedgerEntry[]>> {
  const out = new Map<string, LedgerEntry[]>();
  if (tenancyIds.length === 0) return out;
  const rows = await getDb()
    .select()
    .from(ledgerEntries)
    .where(inArray(ledgerEntries.tenancyId, [...tenancyIds]))
    .orderBy(asc(ledgerEntries.occurredOn), asc(ledgerEntries.createdAt));
  for (const row of rows) {
    const list = out.get(row.tenancyId);
    if (list) list.push(row);
    else out.set(row.tenancyId, [row]);
  }
  return out;
}

/** Rows in the shape the pure arithmetic wants. */
export function toCoreEntries(rows: readonly LedgerEntry[]): CoreEntry[] {
  return rows.map((row, index) => ({
    id: row.id,
    kind: row.kind,
    amountCents: row.amountCents,
    occurredOn: row.occurredOn,
    description: row.description,
    period: row.period,
    sequence: index,
  }));
}

export async function balance(tenancyId: string): Promise<number> {
  const [agg] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)::int` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.tenancyId, tenancyId));
  return Number(agg?.total ?? 0);
}

export async function delinquencyFor(tenancyId: string, asOf: IsoDate): Promise<Delinquency> {
  return delinquency(toCoreEntries(await entriesFor(tenancyId)), asOf);
}

export async function runningRowsFor(tenancyId: string) {
  return withRunningBalance(toCoreEntries(await entriesFor(tenancyId)));
}

export function today(): IsoDate {
  return isoDateOf(new Date());
}
