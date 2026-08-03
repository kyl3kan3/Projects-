/**
 * src/lib/matching.ts
 *
 * The database side of scoring: candidate selection, the profile x opportunity
 * fan-out, and match upserts. The arithmetic itself lives in `lib/scoring.ts`,
 * which is pure — this module only feeds it rows and stores what comes back.
 *
 * Two rules are enforced here rather than in the UI:
 *
 *  1. **Below threshold is suppressed, never deleted.** A suppressed match is a
 *     real row with a real score and real factors, queryable from the radar's
 *     audit view, so a firm can see exactly what was filtered out and why.
 *  2. **A rescore never overwrites a human decision.** Scores and factors are
 *     refreshed on every pass, but a match a person dismissed or pursued keeps
 *     that state.
 */

import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DEFAULT_SCORE_THRESHOLD,
  firmSettings,
  firms,
  keywordProfiles,
  matches,
  opportunities,
  type KeywordProfile,
  type Match,
  type Opportunity,
} from "@/db/schema";
import { scoreOpportunity, type ScoreResult, type ScoringProfile } from "@/lib/scoring";

/** How far back the scorer looks. Older open notices are already matched. */
const CANDIDATE_WINDOW_DAYS = 120;
const CANDIDATE_LIMIT = 2_000;

export function toScoringProfile(profile: KeywordProfile): ScoringProfile {
  return {
    naicsCodes: profile.naicsCodes,
    pscCodes: profile.pscCodes,
    keywords: profile.keywords,
    negativeKeywords: profile.negativeKeywords,
    states: profile.states,
    agencies: profile.agencies,
    valueBand: (profile.valueBand ?? null) as ScoringProfile["valueBand"],
  };
}

/**
 * Candidate notices for a profile: open, recent, and — when the profile has
 * keywords — narrowed by Postgres full-text search so a firm's keywords never
 * scan the whole shared store. The GIN index in the schema matches this
 * expression exactly.
 *
 * The FTS query is a pre-filter only. The score and its reasons come from the
 * pure scorer, which needs the notice text anyway, and which can say *where* a
 * phrase was found — something `@@` cannot.
 */
async function candidateOpportunities(
  profile: KeywordProfile,
  now: Date,
  onlyIds?: string[],
): Promise<Opportunity[]> {
  const db = getDb();
  const since = new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * 86_400_000);

  const conditions = [
    ne(opportunities.oppStatus, "cancelled"),
    gte(opportunities.postedAt, since),
    or(isNull(opportunities.responsesDueAt), gte(opportunities.responsesDueAt, now)),
  ];
  if (onlyIds && onlyIds.length > 0) {
    conditions.push(inArray(opportunities.id, onlyIds));
  }

  const terms = profile.keywords.map((k) => k.trim()).filter(Boolean);
  if (terms.length > 0 && (!onlyIds || onlyIds.length === 0)) {
    // websearch_to_tsquery understands quoted phrases; OR them so one keyword
    // hit is enough to make a notice a candidate.
    const query = terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" or ");
    conditions.push(
      sql`to_tsvector('english', ${opportunities.title} || ' ' || ${opportunities.agency} || ' ' || ${opportunities.description}) @@ websearch_to_tsquery('english', ${query})`,
    );
  }

  return await db
    .select()
    .from(opportunities)
    .where(and(...conditions))
    .orderBy(desc(opportunities.postedAt))
    .limit(CANDIDATE_LIMIT);
}

export interface RescoreSummary {
  profileId: string;
  scored: number;
  surfaced: number;
  suppressed: number;
  hot: string[];
}

/**
 * Score a profile against candidate notices and upsert the matches.
 *
 * `onlyIds` is the ingestion fan-out path: after a poll, only the notices that
 * actually changed are rescored. With no ids it is a full profile rescore, which
 * is what a profile edit triggers.
 */
export async function rescoreProfile(
  profileId: string,
  options: { onlyIds?: string[]; now?: Date } = {},
): Promise<RescoreSummary> {
  const db = getDb();
  const now = options.now ?? new Date();

  const [profile] = await db
    .select()
    .from(keywordProfiles)
    .where(eq(keywordProfiles.id, profileId));
  if (!profile) throw new Error(`No such keyword profile: ${profileId}`);

  const [firm] = await db.select().from(firms).where(eq(firms.id, profile.firmId));
  const threshold = firmSettings(firm ?? { settings: {} }).scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;

  const summary: RescoreSummary = {
    profileId,
    scored: 0,
    surfaced: 0,
    suppressed: 0,
    hot: [],
  };
  if (profile.status !== "active") return summary;

  const candidates = await candidateOpportunities(profile, now, options.onlyIds);
  const scoringProfile = toScoringProfile(profile);

  for (const opportunity of candidates) {
    const result = scoreOpportunity(
      scoringProfile,
      {
        title: opportunity.title,
        agency: opportunity.agency,
        state: opportunity.state,
        naicsCodes: opportunity.naicsCodes,
        pscCodes: opportunity.pscCodes,
        description: opportunity.description,
        responsesDueAt: opportunity.responsesDueAt,
        estValueBand: (opportunity.estValueBand ?? null) as ScoringProfile["valueBand"],
      },
      { threshold, now },
    );

    const stored = await upsertMatch(profile, opportunity.id, result);
    summary.scored += 1;
    if (result.suppressed) summary.suppressed += 1;
    else summary.surfaced += 1;
    if (result.hot && stored.state === "new") summary.hot.push(stored.id);
  }

  return summary;
}

/**
 * Upsert by `(keyword_profile_id, opportunity_id)`.
 *
 * The score and factors are always refreshed. The *state* is only moved when
 * the machine owns it: `new` <-> `suppressed` flip with the threshold, while
 * `seen`, `dismissed`, and `pursued` are human decisions a rescore must not
 * quietly undo. A previously dismissed notice that later crosses the threshold
 * stays dismissed — with its reason intact, which is what feeds profile tuning.
 */
async function upsertMatch(
  profile: KeywordProfile,
  opportunityId: string,
  result: ScoreResult,
): Promise<Match> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.keywordProfileId, profile.id),
        eq(matches.opportunityId, opportunityId),
      ),
    );

  if (!existing) {
    const [inserted] = await db
      .insert(matches)
      .values({
        firmId: profile.firmId,
        keywordProfileId: profile.id,
        opportunityId,
        score: result.score,
        factors: result.factors,
        state: result.suppressed ? "suppressed" : "new",
      })
      .returning();
    return inserted;
  }

  const machineOwned = existing.state === "new" || existing.state === "suppressed";
  const nextState = machineOwned
    ? result.suppressed
      ? ("suppressed" as const)
      : ("new" as const)
    : existing.state;

  const [updated] = await db
    .update(matches)
    .set({
      score: result.score,
      factors: result.factors,
      state: nextState,
      scoredAt: new Date(),
      updatedAt: new Date(),
      // A match that drops back below threshold has not been "notified" of its
      // new life; clearing the stamp lets it be announced once if it returns.
      notifiedAt: nextState === "suppressed" ? null : existing.notifiedAt,
    })
    .where(eq(matches.id, existing.id))
    .returning();
  return updated;
}

/** Fan out changed notices across every active profile in the system. */
export async function rescoreForOpportunities(
  opportunityIds: string[],
  now: Date = new Date(),
): Promise<RescoreSummary[]> {
  if (opportunityIds.length === 0) return [];
  const db = getDb();
  const profiles = await db
    .select()
    .from(keywordProfiles)
    .where(eq(keywordProfiles.status, "active"));
  const summaries: RescoreSummary[] = [];
  for (const profile of profiles) {
    summaries.push(await rescoreProfile(profile.id, { onlyIds: opportunityIds, now }));
  }
  return summaries;
}

/* ----------------------------------------------------------- match actions */

export async function markMatchSeen(firmId: string, matchId: string): Promise<void> {
  const db = getDb();
  await db
    .update(matches)
    .set({ state: "seen", updatedAt: new Date() })
    .where(and(eq(matches.id, matchId), eq(matches.firmId, firmId), eq(matches.state, "new")));
}

export const DISMISS_REASONS = [
  "Wrong vehicle",
  "Too small",
  "Wrong region",
  "Not our work",
  "No capacity",
] as const;

export async function dismissMatch(
  firmId: string,
  matchId: string,
  reason: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(matches)
    .set({ state: "dismissed", dismissReason: reason.slice(0, 200), updatedAt: new Date() })
    .where(and(eq(matches.id, matchId), eq(matches.firmId, firmId)));
}

/**
 * Dismissal reasons, counted — the precision loop's raw material. Rendered on
 * the profile screen as "4 dismissed for 'Wrong vehicle'".
 */
export async function dismissReasonCounts(
  firmId: string,
): Promise<Array<{ reason: string; count: number }>> {
  const db = getDb();
  const rows = await db
    .select({ reason: matches.dismissReason, count: sql<number>`count(*)::int` })
    .from(matches)
    .where(and(eq(matches.firmId, firmId), eq(matches.state, "dismissed")))
    .groupBy(matches.dismissReason);
  return rows
    .filter((row): row is { reason: string; count: number } => Boolean(row.reason))
    .sort((a, b) => b.count - a.count);
}

/* ---------------------------------------------------------------- queries */

export interface MatchRow {
  match: Match;
  opportunity: Opportunity;
  profileName: string;
  sourceKey: string;
  sourceName: string;
  sourceStatus: string;
  sourceNote: string | null;
}

/** Join once, in one place: every screen that lists matches uses this shape. */
export async function listMatches(
  firmId: string,
  options: {
    states?: Array<Match["state"]>;
    dueWithinDays?: number;
    limit?: number;
    now?: Date;
  } = {},
): Promise<MatchRow[]> {
  const db = getDb();
  const now = options.now ?? new Date();
  const { sources } = await import("@/db/schema");

  const conditions = [eq(matches.firmId, firmId)];
  if (options.states && options.states.length > 0) {
    conditions.push(inArray(matches.state, options.states));
  }
  if (typeof options.dueWithinDays === "number") {
    const horizon = new Date(now.getTime() + options.dueWithinDays * 86_400_000);
    conditions.push(gte(opportunities.responsesDueAt, now));
    conditions.push(lte(opportunities.responsesDueAt, horizon));
  }

  const rows = await db
    .select({
      match: matches,
      opportunity: opportunities,
      profileName: keywordProfiles.name,
      sourceKey: sources.key,
      sourceName: sources.name,
      sourceStatus: sources.status,
      sourceNote: sources.statusNote,
    })
    .from(matches)
    .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
    .innerJoin(keywordProfiles, eq(matches.keywordProfileId, keywordProfiles.id))
    .innerJoin(sources, eq(opportunities.sourceId, sources.id))
    .where(and(...conditions))
    .orderBy(desc(matches.score), desc(opportunities.postedAt))
    .limit(options.limit ?? 60);

  return rows;
}

export async function getMatch(firmId: string, matchId: string): Promise<MatchRow | null> {
  const db = getDb();
  const { sources } = await import("@/db/schema");
  const [row] = await db
    .select({
      match: matches,
      opportunity: opportunities,
      profileName: keywordProfiles.name,
      sourceKey: sources.key,
      sourceName: sources.name,
      sourceStatus: sources.status,
      sourceNote: sources.statusNote,
    })
    .from(matches)
    .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
    .innerJoin(keywordProfiles, eq(matches.keywordProfileId, keywordProfiles.id))
    .innerJoin(sources, eq(opportunities.sourceId, sources.id))
    .where(and(eq(matches.id, matchId), eq(matches.firmId, firmId)));
  return row ?? null;
}

export async function countMatches(
  firmId: string,
): Promise<{ new: number; suppressed: number; dismissed: number; total: number }> {
  const db = getDb();
  const rows = await db
    .select({ state: matches.state, count: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.firmId, firmId))
    .groupBy(matches.state);
  const by = new Map(rows.map((row) => [row.state, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {
    new: by.get("new") ?? 0,
    suppressed: by.get("suppressed") ?? 0,
    dismissed: by.get("dismissed") ?? 0,
    total,
  };
}
