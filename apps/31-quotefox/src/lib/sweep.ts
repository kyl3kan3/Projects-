/**
 * The daily sweep: follow-up nudges, proposal expiry, trial expiry.
 *
 * Three failure modes were designed against here, because each of them is the
 * classic version of this feature going wrong:
 *
 *  1. **Nudges that never stop.** "Sent 6 days ago and still unviewed" stays true
 *     forever, so a naive sweep mails the homeowner every single day. Rungs are
 *     pinned to fixed distances from `sent_at` (+2d, +5d) and recorded in
 *     `proposal_nudges` with a unique index on (proposal, rung) — so each rung can
 *     fire exactly once, ever.
 *  2. **A ladder that goes silent.** If a sweep that has not run for a week picked
 *     the *loosest* crossed rung it would send the day-2 note and never the day-5
 *     one. It picks the tightest — the latest rung that is due — and writes the
 *     rungs it skipped as skipped, so they cannot fire late either.
 *  3. **Status read from a column a sweep maintains.** Expiry is derived at render
 *     time everywhere in the UI (src/lib/display.ts); this sweep also writes the
 *     column, but only so the nudge query and the proposals list agree. Nothing
 *     depends on the sweep having run.
 *
 * Everything is idempotent, so running it twice in a day sends nothing twice, and
 * a bounded time budget lets it stop cleanly on a serverless host.
 */

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  jobs,
  organizations,
  proposalNudges,
  proposals,
  type Organization,
  type Proposal,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { nudgeMail, sendMail } from "@/lib/email";
import { featureEnabled, isTrialing, orgAsGatable } from "@/lib/plans";
import { appendEvent } from "@/lib/proposals";
import { mintProposalToken, proposalUrl } from "@/lib/tokens";

export const NUDGE_RUNGS = [2, 5] as const;

/**
 * How long after a rung's day it may still be sent.
 *
 * A nudge is pinned to a distance from the send, not to a condition that stays
 * true forever. Without this window, a proposal sent three weeks ago on a plan
 * that did not include nudges — then upgraded — would suddenly receive a "just
 * checking in" note 23 days late, which is the same bug as mailing someone every
 * day, wearing a different hat. Past the window the rung is recorded as skipped
 * and can never fire.
 */
export const NUDGE_WINDOW_DAYS = 3;

export interface SweepResult {
  nudgesSent: number;
  rungsSkipped: number;
  expired: number;
  trialsExpired: number;
  metersReset: number;
  durationMs: number;
  stoppedEarly: boolean;
}

export interface SweepOptions {
  budgetMs?: number;
  /** Overrides "now" — used by tests to look at the world from a later day. */
  asOf?: Date;
  organizationId?: string;
}

export interface RungDecision {
  /** The rung to send now, or null when every crossed rung is too late. */
  rung: number | null;
  /** Rungs that must be written off so they can never fire later. */
  skipped: number[];
}

/**
 * Which rung is due right now?
 *
 * The tightest crossed rung wins — selecting the loosest is how a ladder fires its
 * first rung and then goes quiet forever — and anything older than the window is
 * not sent at all, only recorded.
 */
export function dueRung(sentAt: Date, asOf: Date): RungDecision | null {
  const days = (asOf.getTime() - sentAt.getTime()) / 86_400_000;
  const crossed = NUDGE_RUNGS.filter((rung) => days >= rung);
  if (!crossed.length) return null;
  const tightest = crossed[crossed.length - 1];
  if (days > tightest + NUDGE_WINDOW_DAYS) {
    return { rung: null, skipped: [...crossed] };
  }
  return { rung: tightest, skipped: crossed.slice(0, -1) };
}

export async function runSweep(options: SweepOptions = {}): Promise<SweepResult> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 50_000;
  const asOf = options.asOf ?? new Date();
  const db = getDb();

  const result: SweepResult = {
    nudgesSent: 0,
    rungsSkipped: 0,
    expired: 0,
    trialsExpired: 0,
    metersReset: 0,
    durationMs: 0,
    stoppedEarly: false,
  };

  /* --- 1. expire proposals whose window has closed ---------------------- */

  const expiring = await db
    .select()
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["sent", "viewed"]),
        // A typed operator, not a raw fragment: a Date inside sql`` skips the
        // column encoder and postgres.js throws on it at runtime.
        lte(proposals.expiresAt, asOf),
        ...(options.organizationId ? [eq(proposals.organizationId, options.organizationId)] : []),
      ),
    )
    .limit(500);

  for (const proposal of expiring) {
    await db
      .update(proposals)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(proposals.id, proposal.id));
    await appendEvent(proposal, "expired");
    await audit(proposal.organizationId, SYSTEM, "proposal_expired", proposal.id);
    result.expired += 1;
  }

  /* --- 2. follow-up nudges --------------------------------------------- */

  const candidates = await db
    .select()
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["sent", "viewed"]),
        lte(proposals.sentAt, new Date(asOf.getTime() - NUDGE_RUNGS[0] * 86_400_000)),
        ...(options.organizationId ? [eq(proposals.organizationId, options.organizationId)] : []),
      ),
    )
    .orderBy(asc(proposals.sentAt))
    .limit(500);

  const orgCache = new Map<string, Organization>();
  const orgFor = async (id: string): Promise<Organization | null> => {
    const cached = orgCache.get(id);
    if (cached) return cached;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    if (org) orgCache.set(id, org);
    return org ?? null;
  };

  for (const proposal of candidates) {
    if (Date.now() - startedAt > budgetMs) {
      result.stoppedEarly = true;
      break;
    }
    const due = dueRung(proposal.sentAt, asOf);
    if (!due) continue;

    const org = await orgFor(proposal.organizationId);
    if (!org) continue;

    const existing = await db
      .select()
      .from(proposalNudges)
      .where(eq(proposalNudges.proposalId, proposal.id));
    const done = new Set(existing.map((row) => row.rung));

    // Rungs the sweep passed over are written as skipped so they can never fire
    // late — the "30-day warning fired and nothing else ever did" failure, and its
    // mirror, the note that arrives three weeks after the bid.
    for (const rung of due.skipped) {
      if (done.has(rung)) continue;
      await db
        .insert(proposalNudges)
        .values({
          organizationId: proposal.organizationId,
          proposalId: proposal.id,
          rung,
          skippedReason:
            due.rung === null
              ? `more than ${NUDGE_WINDOW_DAYS} days past the day-${rung} window`
              : "superseded by a later rung",
        })
        .onConflictDoNothing({ target: [proposalNudges.proposalId, proposalNudges.rung] });
      result.rungsSkipped += 1;
    }

    if (due.rung === null || done.has(due.rung)) continue;

    // Nudges are a Crew+ feature; on Solo the rung is recorded as skipped so the
    // proposal is not re-examined every day for the rest of time.
    if (!featureEnabled(orgAsGatable(org), "nudges")) {
      await db
        .insert(proposalNudges)
        .values({
          organizationId: proposal.organizationId,
          proposalId: proposal.id,
          rung: due.rung,
          skippedReason: "plan does not include follow-up nudges",
        })
        .onConflictDoNothing({ target: [proposalNudges.proposalId, proposalNudges.rung] });
      result.rungsSkipped += 1;
      continue;
    }

    const [job] = await db.select().from(jobs).where(eq(jobs.id, proposal.jobId));
    if (!job?.customerEmail) {
      await db
        .insert(proposalNudges)
        .values({
          organizationId: proposal.organizationId,
          proposalId: proposal.id,
          rung: due.rung,
          skippedReason: "no customer email on the job",
        })
        .onConflictDoNothing({ target: [proposalNudges.proposalId, proposalNudges.rung] });
      result.rungsSkipped += 1;
      continue;
    }

    // Claim the rung *before* sending: if the send throws, the row still exists
    // and the homeowner is not mailed twice on the next run.
    const claimed = await db
      .insert(proposalNudges)
      .values({
        organizationId: proposal.organizationId,
        proposalId: proposal.id,
        rung: due.rung,
        sentAt: new Date(),
      })
      .onConflictDoNothing({ target: [proposalNudges.proposalId, proposalNudges.rung] })
      .returning();
    if (!claimed.length) continue;

    const token = await mintProposalToken(proposal.id, proposal.tokenId);
    const mail = await sendMail(
      nudgeMail({
        companyName: org.name,
        companyPhone: org.phone,
        licenseNumber: org.licenseNumber,
        brandColor: org.brandColor,
        customerName: job.customerName,
        customerEmail: job.customerEmail,
        jobTitle: job.title,
        address: job.address,
        totalCents: proposal.totalCents,
        depositCents: proposal.depositCents,
        url: proposalUrl(token),
        expiresAt: proposal.expiresAt,
        rung: due.rung,
        viewed: Boolean(proposal.firstViewedAt),
      }),
    );
    await appendEvent(proposal, "nudge_sent", {
      rung: due.rung,
      delivered: mail.delivered,
      error: mail.error ?? null,
    });
    await audit(proposal.organizationId, SYSTEM, "nudge_sent", `${job.title} day ${due.rung}`, {
      delivered: mail.delivered,
    });
    result.nudgesSent += 1;
  }

  /* --- 3. trials and meters ------------------------------------------- */

  const trialing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.subscriptionStatus, "trialing"));
  for (const org of trialing) {
    if (org.trialEndsAt && org.trialEndsAt.getTime() <= asOf.getTime()) {
      await db
        .update(organizations)
        .set({ subscriptionStatus: "trial_expired", updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
      await audit(org.id, SYSTEM, "trial_expired", org.name);
      result.trialsExpired += 1;
      continue;
    }
    // Trials have no invoices, so their meter is rolled here rather than by the
    // invoice.paid webhook.
    if (
      isTrialing(orgAsGatable(org)) &&
      asOf.getTime() - org.periodStartedAt.getTime() > 31 * 86_400_000
    ) {
      await db
        .update(organizations)
        .set({ quoteCountCurrentPeriod: 0, periodStartedAt: asOf, updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
      result.metersReset += 1;
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

/** Which rungs have already been decided for a proposal — for the timeline. */
export function nudgeSummary(
  rows: ReadonlyArray<{ rung: number; sentAt: Date | null; skippedReason: string | null }>,
): string {
  if (!rows.length) return "Follow-ups scheduled for day 2 and day 5";
  return rows
    .map((row) =>
      row.sentAt
        ? `Day ${row.rung} nudge sent`
        : `Day ${row.rung} skipped — ${row.skippedReason ?? "no reason recorded"}`,
    )
    .join(" · ");
}

export type { Proposal };
