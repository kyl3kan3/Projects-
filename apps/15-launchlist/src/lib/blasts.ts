/**
 * Email blasts: segmentation, and a fan-out that survives being interrupted.
 *
 * On Vercel there is no always-on process, so sending runs inside a cron-invoked
 * route with a time budget (DEPLOYING.md). That makes resumability the whole
 * design: recipients are walked in `join_rank` order and `cursor_rank` records
 * how far the last run got, so the next run continues rather than restarting.
 * A blast that times out half-way must never re-mail the first half.
 */

import { and, asc, count as countRows, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  blasts,
  events,
  lists,
  signups,
  type Blast,
  type List,
  type Signup,
} from "@/db/schema";
import { renderBody, type SegmentSpec } from "@/lib/blast-content";
import { sendEmail } from "@/lib/email";
import { pageUrl } from "@/lib/lists";
import { queueSize, unsubscribeUrlFor } from "@/lib/signups";

// Re-exported so server callers have one import for everything about a blast.
export { MERGE_FIELDS, renderBody, segmentLabel, type SegmentSpec } from "@/lib/blast-content";

/** Statuses that may receive a blast. Unsubscribed and blocked never do. */
const MAILABLE = ["active", "review"] as const;

/** Credited referrals for the row being filtered. See the note in signups.ts on
 *  why the outer table is named rather than passed as a Column object. */
const creditedSql = sql<number>`(
  select count(*) from signups r
  where r.referred_by_signup_id = signups.id and r.referral_credited = true
)`;

/** Who would this blast go to? Used by the composer's live count and by sending. */
export async function segmentRecipients(
  listId: string,
  spec: SegmentSpec,
  opts: { afterRank?: number; limit?: number } = {},
): Promise<Signup[]> {
  const db = getDb();
  const limit = opts.limit ?? 100_000;
  const after = opts.afterRank ? gt(signups.joinRank, opts.afterRank) : undefined;
  const mailable = and(
    eq(signups.listId, listId),
    inArray(signups.status, [...MAILABLE]),
  );

  if (spec.segment === "reward_tier") {
    return db
      .select()
      .from(signups)
      .where(and(mailable, after, sql`${creditedSql} >= ${Math.max(1, spec.value)}`))
      .orderBy(asc(signups.joinRank))
      .limit(limit);
  }

  if (spec.segment === "top_referrers") {
    // Resolve the top N by referral count first, then walk them in rank order
    // so the resumable cursor still means something.
    const top = await db
      .select({ id: signups.id })
      .from(signups)
      .where(mailable)
      .orderBy(sql`${creditedSql} desc`, asc(signups.position))
      .limit(Math.max(1, spec.value));
    const ids = top.map((r) => r.id);
    if (!ids.length) return [];
    return db
      .select()
      .from(signups)
      .where(and(inArray(signups.id, ids), after))
      .orderBy(asc(signups.joinRank))
      .limit(limit);
  }

  return db
    .select()
    .from(signups)
    .where(and(mailable, after))
    .orderBy(asc(signups.joinRank))
    .limit(limit);
}

export async function segmentSize(listId: string, spec: SegmentSpec): Promise<number> {
  if (spec.segment === "all") {
    const db = getDb();
    const [row] = await db
      .select({ n: countRows() })
      .from(signups)
      .where(and(eq(signups.listId, listId), inArray(signups.status, [...MAILABLE])));
    return Number(row?.n ?? 0);
  }
  return (await segmentRecipients(listId, spec)).length;
}

/* ----------------------------------------------------------------- sending --- */

export interface BlastRunResult {
  blastId: string;
  sent: number;
  failed: number;
  done: boolean;
}

/**
 * Send one batch of a blast and update its cursor.
 *
 * `budgetMs` bounds the run so the caller (a cron route) returns well inside its
 * function limit; whatever is left is picked up by the next invocation.
 */
export async function runBlast(
  blast: Blast,
  opts: { batchSize?: number; budgetMs?: number } = {},
): Promise<BlastRunResult> {
  const db = getDb();
  const batchSize = opts.batchSize ?? 50;
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);

  const [list] = await db.select().from(lists).where(eq(lists.id, blast.listId));
  if (!list) {
    await db
      .update(blasts)
      .set({ status: "failed", lastError: "The list no longer exists" })
      .where(eq(blasts.id, blast.id));
    return { blastId: blast.id, sent: 0, failed: 0, done: true };
  }

  if (blast.status !== "sending") {
    const total = await segmentSize(list.id, { segment: blast.segment, value: blast.segmentValue });
    await db
      .update(blasts)
      .set({ status: "sending", startedAt: blast.startedAt ?? new Date(), recipientCount: total })
      .where(eq(blasts.id, blast.id));
  }

  // Resolved once per run, not per recipient: `{{total}}` means "how many
  // people are in line", which is the queue size — not `last_join_rank`, which
  // also counts addresses that never confirmed and ones that were rejected.
  const queueTotal = await queueSize(list.id);

  let cursor = blast.cursorRank;
  let sent = 0;
  let failed = 0;

  while (Date.now() < deadline) {
    const batch = await segmentRecipients(
      list.id,
      { segment: blast.segment, value: blast.segmentValue },
      { afterRank: cursor, limit: batchSize },
    );
    if (!batch.length) break;

    for (const person of batch) {
      const result = await sendOne(blast, list, person, queueTotal);
      if (result) sent++;
      else failed++;
      cursor = Math.max(cursor, person.joinRank);
      if (Date.now() >= deadline) break;
    }

    await db
      .update(blasts)
      .set({
        cursorRank: cursor,
        sentCount: sql`${blasts.sentCount} + ${sent}`,
        failedCount: sql`${blasts.failedCount} + ${failed}`,
      })
      .where(eq(blasts.id, blast.id));
    sent = 0;
    failed = 0;

    if (batch.length < batchSize) break;
  }

  // Flush any counts from a partial batch.
  if (sent || failed) {
    await db
      .update(blasts)
      .set({
        cursorRank: cursor,
        sentCount: sql`${blasts.sentCount} + ${sent}`,
        failedCount: sql`${blasts.failedCount} + ${failed}`,
      })
      .where(eq(blasts.id, blast.id));
  }

  const remaining = await segmentRecipients(
    list.id,
    { segment: blast.segment, value: blast.segmentValue },
    { afterRank: cursor, limit: 1 },
  );
  const done = remaining.length === 0;

  const [fresh] = await db.select().from(blasts).where(eq(blasts.id, blast.id));
  if (done) {
    await db
      .update(blasts)
      .set({ status: "sent", completedAt: new Date() })
      .where(eq(blasts.id, blast.id));
    await db.insert(events).values({
      listId: list.id,
      kind: "blast_sent",
      metadata: { subject: blast.subject, sent: fresh?.sentCount ?? 0 },
    });
  }

  return {
    blastId: blast.id,
    sent: fresh?.sentCount ?? 0,
    failed: fresh?.failedCount ?? 0,
    done,
  };
}

async function sendOne(
  blast: Blast,
  list: List,
  person: Signup,
  queueTotal: number,
): Promise<boolean> {
  const db = getDb();
  const [credited] = await db
    .select({ n: countRows() })
    .from(signups)
    .where(and(eq(signups.referredBySignupId, person.id), eq(signups.referralCredited, true)));

  const page = pageUrl(list);
  const text = renderBody(blast.body, {
    position: person.position,
    total: queueTotal,
    referrals: Number(credited?.n ?? 0),
    shareUrl: `${page}?ref=${person.referralCode}`,
    pageUrl: page,
  });

  const result = await sendEmail({
    to: person.email,
    subject: blast.subject,
    text,
    unsubscribeUrl: unsubscribeUrlFor(person.id),
  });
  if (result.error) {
    await db.update(blasts).set({ lastError: result.error }).where(eq(blasts.id, blast.id));
    return false;
  }
  return true;
}

/** Blasts whose scheduled time has arrived, plus any left mid-send. */
export async function dueBlasts(limit = 5): Promise<Blast[]> {
  const db = getDb();
  return db
    .select()
    .from(blasts)
    .where(
      and(
        inArray(blasts.status, ["scheduled", "sending"]),
        sql`(${blasts.scheduledAt} is null or ${blasts.scheduledAt} <= now())`,
      ),
    )
    .orderBy(asc(blasts.scheduledAt))
    .limit(limit);
}

export async function blastsFor(listId: string): Promise<Blast[]> {
  const db = getDb();
  return db
    .select()
    .from(blasts)
    .where(eq(blasts.listId, listId))
    .orderBy(sql`${blasts.createdAt} desc`);
}

export async function blastById(id: string): Promise<Blast | null> {
  const db = getDb();
  const [row] = await db.select().from(blasts).where(eq(blasts.id, id));
  return row ?? null;
}

/** Emails sent from this list's blasts in the current calendar month. */
export async function monthlyEmailUsage(listIds: string[]): Promise<number> {
  if (!listIds.length) return 0;
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${blasts.sentCount}), 0)` })
    .from(blasts)
    .where(
      and(
        inArray(blasts.listId, listIds),
        ne(blasts.status, "draft"),
        sql`${blasts.createdAt} >= date_trunc('month', now())`,
      ),
    );
  return Number(row?.n ?? 0);
}
