/**
 * src/lib/pursuits.ts
 *
 * The response workspace: pursuits and their stages, the go/no-go scorecard
 * record, the requirement checklist, and the win/loss close.
 *
 * Stage machine (ARCHITECTURE.md §4):
 *
 *   watching -> go_no_go -> drafting -> submitted -> won | lost
 *                   \-> no_bid
 *
 * A recorded "no" is a first-class outcome: `no_bid` closes the pursuit
 * immediately with its reason preserved, because that reason is the firm's
 * win-rate denominator. Nothing here silently discards it.
 *
 * `submitted`, `won`, `lost` and `no_bid` are terminal for content: linked
 * blocks and requirements freeze. That is enforced in lib/library.ts and here.
 */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  deadlines,
  matches,
  opportunities,
  pursuits,
  requirements,
  scorecards,
  users,
  type Opportunity,
  type Pursuit,
  type Requirement,
  type Scorecard,
} from "@/db/schema";
import { createDeadlinesFromOpportunity } from "@/lib/deadlines";
import { markWonWith } from "@/lib/library";
import {
  defaultCriteria,
  readCriteria,
  stageForVerdict,
  weightedVerdict,
  type Verdict,
} from "@/lib/scorecard";

export const OPEN_STAGES = ["watching", "go_no_go", "drafting"] as const;
export const TERMINAL_STAGES = ["submitted", "won", "lost", "no_bid"] as const;

export function isClosed(stage: Pursuit["stage"]): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

/** Stages a pursuit may move to next, so the UI never offers a dead end. */
export function nextStages(stage: Pursuit["stage"]): Pursuit["stage"][] {
  switch (stage) {
    case "watching":
      return ["go_no_go", "no_bid"];
    case "go_no_go":
      return ["drafting", "no_bid"];
    case "drafting":
      return ["submitted", "no_bid"];
    case "submitted":
      return ["won", "lost"];
    default:
      return [];
  }
}

/* ---------------------------------------------------------------- creating */

export interface CreateFromMatchResult {
  pursuit: Pursuit;
  deadlinesCreated: number;
  scorecardCreated: boolean;
}

/**
 * Pursue a match. Creates the pursuit at `go_no_go` with the firm's scorecard
 * template, copies the notice's published dates into the deadline calendar, and
 * marks the match pursued — one tap from the radar to a live pursuit.
 *
 * Idempotent: pursuing the same match twice returns the existing pursuit rather
 * than a duplicate.
 */
export async function pursueMatch(input: {
  firmId: string;
  actorUserId: string;
  matchId: string;
  stage?: "watching" | "go_no_go";
}): Promise<CreateFromMatchResult> {
  const db = getDb();
  const [row] = await db
    .select({ match: matches, opportunity: opportunities })
    .from(matches)
    .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
    .where(and(eq(matches.id, input.matchId), eq(matches.firmId, input.firmId)));
  if (!row) throw new Error("That match does not belong to this firm.");

  const [existing] = await db
    .select()
    .from(pursuits)
    .where(
      and(eq(pursuits.firmId, input.firmId), eq(pursuits.opportunityId, row.opportunity.id)),
    );
  if (existing) {
    await db
      .update(matches)
      .set({ state: "pursued", updatedAt: new Date() })
      .where(eq(matches.id, row.match.id));
    return { pursuit: existing, deadlinesCreated: 0, scorecardCreated: false };
  }

  const stage = input.stage ?? "go_no_go";
  const [pursuit] = await db
    .insert(pursuits)
    .values({
      firmId: input.firmId,
      opportunityId: row.opportunity.id,
      title: row.opportunity.title,
      stage,
      ownerUserId: input.actorUserId,
      valueCents: bandMidpointCents(row.opportunity),
    })
    .returning();

  const created = await createDeadlinesFromOpportunity({
    firmId: input.firmId,
    pursuitId: pursuit.id,
    opportunity: row.opportunity,
  });

  let scorecardCreated = false;
  if (stage === "go_no_go") {
    await db
      .insert(scorecards)
      .values({ pursuitId: pursuit.id, criteria: defaultCriteria() })
      .onConflictDoNothing();
    scorecardCreated = true;
  }

  await db
    .update(matches)
    .set({ state: "pursued", updatedAt: new Date() })
    .where(eq(matches.id, row.match.id));

  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: stage === "watching" ? "pursuit.watched" : "pursuit.created",
    target: pursuit.id,
    metadata: { matchId: row.match.id, noticeId: row.opportunity.externalId, stage },
  });

  return { pursuit, deadlinesCreated: created.length, scorecardCreated };
}

/** The midpoint of a published band, in integer cents. Never a float. */
function bandMidpointCents(opportunity: Opportunity): number | null {
  const band = (opportunity.estValueBand ?? null) as { minCents?: number; maxCents?: number } | null;
  if (!band) return null;
  const min = typeof band.minCents === "number" ? band.minCents : null;
  const max = typeof band.maxCents === "number" ? band.maxCents : null;
  if (min !== null && max !== null) return Math.round((min + max) / 2);
  return min ?? max ?? null;
}

/** A manual pursuit: the enterprise RFP that never hit a public portal. */
export async function createManualPursuit(input: {
  firmId: string;
  actorUserId: string;
  title: string;
  valueCents: number | null;
  proposalDueAt: Date | null;
}): Promise<Pursuit> {
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error("Give the pursuit a title.");

  const [pursuit] = await db
    .insert(pursuits)
    .values({
      firmId: input.firmId,
      title: title.slice(0, 300),
      stage: "go_no_go",
      ownerUserId: input.actorUserId,
      valueCents: input.valueCents,
    })
    .returning();

  await db
    .insert(scorecards)
    .values({ pursuitId: pursuit.id, criteria: defaultCriteria() })
    .onConflictDoNothing();

  if (input.proposalDueAt) {
    await db.insert(deadlines).values({
      firmId: input.firmId,
      pursuitId: pursuit.id,
      kind: "proposal",
      label: `Proposal due — ${title}`,
      dueAt: input.proposalDueAt,
    });
  }

  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "pursuit.created_manual",
    target: pursuit.id,
    metadata: { title },
  });
  return pursuit;
}

/* ----------------------------------------------------------------- stages */

export async function setStage(input: {
  firmId: string;
  actorUserId: string;
  pursuitId: string;
  stage: Pursuit["stage"];
}): Promise<Pursuit> {
  const db = getDb();
  const [pursuit] = await db
    .select()
    .from(pursuits)
    .where(and(eq(pursuits.id, input.pursuitId), eq(pursuits.firmId, input.firmId)));
  if (!pursuit) throw new Error("That pursuit does not belong to this firm.");
  if (!nextStages(pursuit.stage).includes(input.stage)) {
    throw new Error(`A ${pursuit.stage} pursuit cannot move straight to ${input.stage}.`);
  }

  const closing = isClosed(input.stage) && input.stage !== "submitted";
  const [updated] = await db
    .update(pursuits)
    .set({
      stage: input.stage,
      closedAt: closing ? new Date() : pursuit.closedAt,
      updatedAt: new Date(),
    })
    .where(eq(pursuits.id, pursuit.id))
    .returning();

  if (input.stage === "go_no_go") {
    await db
      .insert(scorecards)
      .values({ pursuitId: pursuit.id, criteria: defaultCriteria() })
      .onConflictDoNothing();
  }

  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "pursuit.stage_changed",
    target: pursuit.id,
    metadata: { from: pursuit.stage, to: input.stage },
  });
  return updated;
}

export async function setOwner(input: {
  firmId: string;
  actorUserId: string;
  pursuitId: string;
  ownerUserId: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(pursuits)
    .set({ ownerUserId: input.ownerUserId, updatedAt: new Date() })
    .where(and(eq(pursuits.id, input.pursuitId), eq(pursuits.firmId, input.firmId)));
  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "pursuit.owner_changed",
    target: input.pursuitId,
    metadata: { ownerUserId: input.ownerUserId },
  });
}

/* -------------------------------------------------------------- scorecard */

export async function getScorecard(pursuitId: string): Promise<Scorecard | null> {
  const [row] = await getDb().select().from(scorecards).where(eq(scorecards.pursuitId, pursuitId));
  return row ?? null;
}

/** Save scores and notes without deciding. The verdict stays open. */
export async function saveScorecard(input: {
  firmId: string;
  actorUserId: string;
  pursuitId: string;
  criteria: Array<{ key: string; score1to5: number | null; note: string }>;
}): Promise<Scorecard> {
  const db = getDb();
  const [pursuit] = await db
    .select()
    .from(pursuits)
    .where(and(eq(pursuits.id, input.pursuitId), eq(pursuits.firmId, input.firmId)));
  if (!pursuit) throw new Error("That pursuit does not belong to this firm.");

  const existing = await getScorecard(pursuit.id);
  const base = readCriteria(existing?.criteria ?? defaultCriteria());
  const patch = new Map(input.criteria.map((row) => [row.key, row]));
  const merged = base.map((criterion) => {
    const update = patch.get(criterion.key);
    if (!update) return criterion;
    return { ...criterion, score1to5: update.score1to5, note: update.note.slice(0, 600) };
  });

  if (existing) {
    if (existing.decidedAt) {
      throw new Error("This scorecard has been decided. The recorded decision is permanent.");
    }
    const [updated] = await db
      .update(scorecards)
      .set({ criteria: merged, updatedAt: new Date() })
      .where(eq(scorecards.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(scorecards)
    .values({ pursuitId: pursuit.id, criteria: merged })
    .returning();
  return created;
}

export interface DecisionResult {
  scorecard: Scorecard;
  pursuit: Pursuit;
  verdict: Verdict;
  score: number;
}

/**
 * Record the decision. Stamps who and when, moves the pursuit (a `no_go` closes
 * it there and then), and audit-logs it. A decided scorecard is permanent: the
 * recorded "no" cannot be quietly reopened into a "go" later.
 */
export async function recordDecision(input: {
  firmId: string;
  actorUserId: string;
  pursuitId: string;
  criteria: Array<{ key: string; score1to5: number | null; note: string }>;
  overrideVerdict?: Verdict;
  note?: string;
}): Promise<DecisionResult> {
  const db = getDb();
  const saved = await saveScorecard({
    firmId: input.firmId,
    actorUserId: input.actorUserId,
    pursuitId: input.pursuitId,
    criteria: input.criteria,
  });

  const result = weightedVerdict(readCriteria(saved.criteria));
  if (result.verdict === null || result.score === null) {
    throw new Error(
      `Score all ${result.rows.length} criteria before recording a decision — ${result.unscored} still unscored.`,
    );
  }
  const verdict = input.overrideVerdict ?? result.verdict;

  const [decided] = await db
    .update(scorecards)
    .set({
      verdict,
      decidedByUserId: input.actorUserId,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(scorecards.id, saved.id))
    .returning();

  const stage = stageForVerdict(verdict);
  const [pursuit] = await db
    .update(pursuits)
    .set({
      stage,
      closedAt: stage === "no_bid" ? new Date() : null,
      outcomeNote:
        stage === "no_bid"
          ? (input.note?.trim() || `No-bid: ${result.explanation}`).slice(0, 2_000)
          : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(pursuits.id, input.pursuitId), eq(pursuits.firmId, input.firmId)))
    .returning();

  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "scorecard.decided",
    target: decided.id,
    metadata: {
      pursuitId: pursuit.id,
      verdict,
      score: result.score,
      points: result.points,
      maxPoints: result.maxPoints,
      overridden: Boolean(input.overrideVerdict && input.overrideVerdict !== result.verdict),
    },
  });

  return { scorecard: decided, pursuit, verdict, score: result.score };
}

/* ----------------------------------------------------------- requirements */

export async function addRequirement(input: {
  firmId: string;
  actorUserId: string;
  pursuitId: string;
  label: string;
  ownerUserId: string | null;
  dueAt: Date | null;
}): Promise<Requirement> {
  const db = getDb();
  const [pursuit] = await db
    .select()
    .from(pursuits)
    .where(and(eq(pursuits.id, input.pursuitId), eq(pursuits.firmId, input.firmId)));
  if (!pursuit) throw new Error("That pursuit does not belong to this firm.");
  if (isClosed(pursuit.stage)) {
    throw new Error("This pursuit is closed. Its checklist is history now.");
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requirements)
    .where(eq(requirements.pursuitId, pursuit.id));

  const [row] = await db
    .insert(requirements)
    .values({
      pursuitId: pursuit.id,
      label: input.label.trim().slice(0, 300),
      ownerUserId: input.ownerUserId,
      dueAt: input.dueAt,
      sortOrder: count,
    })
    .returning();
  return row;
}

export async function setRequirementStatus(input: {
  firmId: string;
  requirementId: string;
  status: Requirement["status"];
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ requirement: requirements })
    .from(requirements)
    .innerJoin(pursuits, eq(requirements.pursuitId, pursuits.id))
    .where(and(eq(requirements.id, input.requirementId), eq(pursuits.firmId, input.firmId)));
  if (!row) throw new Error("That checklist item does not belong to this firm.");
  await db
    .update(requirements)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(requirements.id, input.requirementId));
}

export async function deleteRequirement(firmId: string, requirementId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: requirements.id, stage: pursuits.stage })
    .from(requirements)
    .innerJoin(pursuits, eq(requirements.pursuitId, pursuits.id))
    .where(and(eq(requirements.id, requirementId), eq(pursuits.firmId, firmId)));
  if (!row) throw new Error("That checklist item does not belong to this firm.");
  if (isClosed(row.stage)) throw new Error("Closed pursuits are immutable.");
  await db.delete(requirements).where(eq(requirements.id, requirementId));
}

/* --------------------------------------------------------------- win/loss */

/**
 * Close a submitted pursuit. Wins flag every block they used `won_with`, which
 * is the only automatic signal in the library.
 */
export async function closePursuit(input: {
  firmId: string;
  actorUserId: string;
  pursuitId: string;
  outcome: "won" | "lost";
  valueCents: number | null;
  note: string;
}): Promise<{ pursuit: Pursuit; blocksFlagged: number }> {
  const db = getDb();
  const [pursuit] = await db
    .select()
    .from(pursuits)
    .where(and(eq(pursuits.id, input.pursuitId), eq(pursuits.firmId, input.firmId)));
  if (!pursuit) throw new Error("That pursuit does not belong to this firm.");
  if (pursuit.stage !== "submitted") {
    throw new Error("Only a submitted pursuit can be won or lost.");
  }

  const [updated] = await db
    .update(pursuits)
    .set({
      stage: input.outcome,
      valueCents: input.valueCents ?? pursuit.valueCents,
      outcomeNote: input.note.trim().slice(0, 4_000),
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pursuits.id, pursuit.id))
    .returning();

  let blocksFlagged = 0;
  if (input.outcome === "won") {
    blocksFlagged = (await markWonWith(pursuit.id)).flagged;
  }

  // Completing the pursuit stops its reminder ladder: every open deadline on it
  // is marked done, so nothing keeps mailing about a tender already decided.
  await db
    .update(deadlines)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(deadlines.pursuitId, pursuit.id), eq(deadlines.firmId, input.firmId)));

  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: `pursuit.${input.outcome}`,
    target: pursuit.id,
    metadata: { valueCents: updated.valueCents, blocksFlagged },
  });

  return { pursuit: updated, blocksFlagged };
}

/* ----------------------------------------------------------------- reading */

export interface PursuitRow {
  pursuit: Pursuit;
  opportunity: Opportunity | null;
  ownerName: string | null;
  verdict: Verdict | null;
  decidedAt: Date | null;
  nextDueAt: Date | null;
}

export async function listPursuits(
  firmId: string,
  options: { stages?: Pursuit["stage"][] } = {},
): Promise<PursuitRow[]> {
  const db = getDb();
  const conditions = [eq(pursuits.firmId, firmId)];
  if (options.stages && options.stages.length > 0) {
    conditions.push(inArray(pursuits.stage, options.stages));
  }
  const rows = await db
    .select({
      pursuit: pursuits,
      opportunity: opportunities,
      ownerName: users.name,
      verdict: scorecards.verdict,
      decidedAt: scorecards.decidedAt,
    })
    .from(pursuits)
    .leftJoin(opportunities, eq(pursuits.opportunityId, opportunities.id))
    .leftJoin(users, eq(pursuits.ownerUserId, users.id))
    .leftJoin(scorecards, eq(scorecards.pursuitId, pursuits.id))
    .where(and(...conditions))
    .orderBy(desc(pursuits.updatedAt));

  const dueRows = rows.length
    ? await db
        .select({ pursuitId: deadlines.pursuitId, dueAt: deadlines.dueAt })
        .from(deadlines)
        .where(
          and(
            eq(deadlines.firmId, firmId),
            isNotNull(deadlines.pursuitId),
            inArray(
              deadlines.pursuitId,
              rows.map((row) => row.pursuit.id),
            ),
          ),
        )
        .orderBy(asc(deadlines.dueAt))
    : [];
  const nextDue = new Map<string, Date>();
  for (const row of dueRows) {
    if (row.pursuitId && !nextDue.has(row.pursuitId)) nextDue.set(row.pursuitId, row.dueAt);
  }

  return rows.map((row) => ({
    pursuit: row.pursuit,
    opportunity: row.opportunity,
    ownerName: row.ownerName,
    verdict: (row.verdict ?? null) as Verdict | null,
    decidedAt: row.decidedAt,
    nextDueAt: nextDue.get(row.pursuit.id) ?? null,
  }));
}

export async function getPursuit(firmId: string, pursuitId: string): Promise<PursuitRow | null> {
  const rows = await listPursuits(firmId);
  return rows.find((row) => row.pursuit.id === pursuitId) ?? null;
}

/**
 * The win/loss report. Every closed pursuit counts, including the no-bids —
 * that is the honest denominator the segment has never had.
 */
export interface WinLossReport {
  won: number;
  lost: number;
  noBid: number;
  submitted: number;
  open: number;
  wonValueCents: number;
  lostValueCents: number;
  /** Wins as a share of decided bids (won + lost). */
  winRatePercent: number | null;
  /** Bids as a share of all decisions (won + lost + no_bid). */
  bidRatePercent: number | null;
  noBidReasons: Array<{ reason: string; count: number }>;
}

export async function winLossReport(firmId: string): Promise<WinLossReport> {
  const db = getDb();
  const rows = await db.select().from(pursuits).where(eq(pursuits.firmId, firmId));
  const report: WinLossReport = {
    won: 0,
    lost: 0,
    noBid: 0,
    submitted: 0,
    open: 0,
    wonValueCents: 0,
    lostValueCents: 0,
    winRatePercent: null,
    bidRatePercent: null,
    noBidReasons: [],
  };
  const reasons = new Map<string, number>();

  for (const row of rows) {
    switch (row.stage) {
      case "won":
        report.won += 1;
        report.wonValueCents += row.valueCents ?? 0;
        break;
      case "lost":
        report.lost += 1;
        report.lostValueCents += row.valueCents ?? 0;
        break;
      case "no_bid": {
        report.noBid += 1;
        const reason = (row.outcomeNote ?? "No reason recorded").split("\n")[0].slice(0, 120);
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        break;
      }
      case "submitted":
        report.submitted += 1;
        break;
      default:
        report.open += 1;
    }
  }

  const decided = report.won + report.lost;
  if (decided > 0) report.winRatePercent = Math.round((report.won / decided) * 100);
  const decisions = decided + report.noBid;
  if (decisions > 0) report.bidRatePercent = Math.round((decided / decisions) * 100);
  report.noBidReasons = [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  return report;
}
