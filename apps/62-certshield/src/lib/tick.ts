/**
 * src/lib/tick.ts
 *
 * The scheduled work, in one bounded pass, per org:
 *
 *   1. parse any certificate still sitting at `pending` (a queue outage, or no
 *      queue at all)
 *   2. re-evaluate every engagement and write the verdicts that changed — this is
 *      the expiry rollover: nothing about the certificate changed, the date did
 *   3. run the chasing ladder
 *
 * Written to be correct **at any frequency**. Vercel Hobby cron runs once a day;
 * the worker calls this every ten minutes. Neither assumes the other ran: nothing
 * keeps a cursor, every step works from current state, and every step is
 * idempotent. A time budget stops the pass early rather than timing out — the next
 * pass sees the same facts.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { certificates, orgs, type Org } from "@/db/schema";
import { parseCertificate } from "@/lib/certificates";
import { dueChases, sendChase } from "@/lib/chasing";
import { engagementViews, persistEvaluations } from "@/lib/verdicts";
import { tickBudgetMs } from "@/lib/runtime";

export interface TickResult {
  orgs: number;
  parsed: number;
  parseFailed: number;
  verdictsWritten: number;
  chasesSent: number;
  chasesSkipped: number;
  chasesFailed: number;
  budgetHit: boolean;
  ms: number;
}

export async function runTick(opts: { budgetMs?: number; at?: Date } = {}): Promise<TickResult> {
  const startedAt = Date.now();
  const budget = opts.budgetMs ?? tickBudgetMs();
  const at = opts.at ?? new Date();
  const result: TickResult = {
    orgs: 0,
    parsed: 0,
    parseFailed: 0,
    verdictsWritten: 0,
    chasesSent: 0,
    chasesSkipped: 0,
    chasesFailed: 0,
    budgetHit: false,
    ms: 0,
  };
  const spent = () => Date.now() - startedAt > budget;

  const db = getDb();
  const allOrgs = await db.select().from(orgs).orderBy(asc(orgs.createdAt));

  for (const org of allOrgs) {
    if (spent()) {
      result.budgetHit = true;
      break;
    }
    result.orgs += 1;
    const one = await runTickForOrg(org, { at, spent });
    result.parsed += one.parsed;
    result.parseFailed += one.parseFailed;
    result.verdictsWritten += one.verdictsWritten;
    result.chasesSent += one.chasesSent;
    result.chasesSkipped += one.chasesSkipped;
    result.chasesFailed += one.chasesFailed;
    if (one.budgetHit) {
      result.budgetHit = true;
      break;
    }
  }

  result.ms = Date.now() - startedAt;
  return result;
}

export interface OrgTickResult {
  parsed: number;
  parseFailed: number;
  verdictsWritten: number;
  chasesSent: number;
  chasesSkipped: number;
  chasesFailed: number;
  budgetHit: boolean;
}

export async function runTickForOrg(
  org: Org,
  opts: { at?: Date; spent?: () => boolean } = {},
): Promise<OrgTickResult> {
  const at = opts.at ?? new Date();
  const spent = opts.spent ?? (() => false);
  const out: OrgTickResult = {
    parsed: 0,
    parseFailed: 0,
    verdictsWritten: 0,
    chasesSent: 0,
    chasesSkipped: 0,
    chasesFailed: 0,
    budgetHit: false,
  };

  // 1. Certificates that never got parsed. A PDF sitting at `pending` is a vendor
  //    who thinks they are done and a coordinator who thinks they are chasing.
  const db = getDb();
  const stuck = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(and(eq(certificates.orgId, org.id), eq(certificates.parsedStatus, "pending")))
    .orderBy(asc(certificates.uploadedAt))
    .limit(25);
  for (const row of stuck) {
    if (spent()) {
      out.budgetHit = true;
      return out;
    }
    try {
      const outcome = await parseCertificate(row.id);
      if (outcome.status === "failed") out.parseFailed += 1;
      else out.parsed += 1;
    } catch (err) {
      console.error("[tick] parse failed", row.id, err);
      out.parseFailed += 1;
    }
  }

  // 2. Expiry rollover: re-derive every verdict and record the ones that moved.
  const views = await engagementViews(org, {}, at);
  const persisted = await persistEvaluations(org, views, at);
  out.verdictsWritten = persisted.written;

  // 3. The ladder.
  const due = await dueChases(org, at, views);
  for (const row of due) {
    if (spent()) {
      out.budgetHit = true;
      return out;
    }
    try {
      const { outcome } = await sendChase(org, row, { at });
      if (outcome === "sent") out.chasesSent += 1;
      else if (outcome === "failed") out.chasesFailed += 1;
      else out.chasesSkipped += 1;
    } catch (err) {
      console.error("[tick] chase failed", row.view.engagement.id, row.kind, err);
      out.chasesFailed += 1;
    }
  }

  return out;
}
