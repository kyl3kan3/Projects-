/**
 * Every database read and write the product makes.
 *
 * Kept in one module so the query patterns are auditable in one place, and so the
 * pipeline itself stays I/O-free. Notes on the traps:
 *
 *  - No `Date` is ever interpolated into a raw `sql` fragment. Timestamp
 *    comparisons use the typed operators (`gte`, `lt`), which route through
 *    Drizzle's column encoder; a Date handed to postgres.js inside a raw fragment
 *    throws at runtime while typechecking perfectly.
 *  - Idempotency is enforced by unique indexes and `onConflictDoUpdate`/
 *    `onConflictDoNothing`, not by read-then-write, because two deliveries of the
 *    same webhook can be in flight at once.
 *  - Nothing here derives display state from a stored status column that a later
 *    process reconciles: `review_runs.status` is terminal once written.
 */

import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  feedbackEvents,
  findings,
  installations,
  pullRequests,
  repositories,
  reviewRuns,
  rulebooks,
  rulebookVersions,
  seats,
  subscriptions,
  suppressions,
  type AccountType,
  type DropReason,
  type FeedbackKind,
  type FindingRow,
  type Installation,
  type InstallationSettings,
  type PlanId,
  type PullRequestRow,
  type Repository,
  type ReviewStatus,
  type ReviewTrigger,
  type RulebookVersionRow,
  type SuppressionReason,
  type SuppressionScope,
} from "./schema";
import type { GatedFinding } from "../review/types";

/* --------------------------------------------------------- installations --- */

export async function upsertInstallation(input: {
  githubInstallationId: number;
  accountLogin: string;
  accountType: AccountType;
  suspended?: boolean;
}): Promise<Installation> {
  const db = getDb();
  const rows = await db
    .insert(installations)
    .values({
      githubInstallationId: input.githubInstallationId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      suspendedAt: input.suspended ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: installations.githubInstallationId,
      set: {
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        deletedAt: null,
        ...(input.suspended === undefined ? {} : { suspendedAt: input.suspended ? new Date() : null }),
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("upsertInstallation returned no row");
  return row;
}

export async function markInstallationDeleted(githubInstallationId: number): Promise<void> {
  const db = getDb();
  await db
    .update(installations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(installations.githubInstallationId, githubInstallationId));
}

export async function setInstallationSuspended(
  githubInstallationId: number,
  suspended: boolean,
): Promise<void> {
  const db = getDb();
  await db
    .update(installations)
    .set({ suspendedAt: suspended ? new Date() : null, updatedAt: new Date() })
    .where(eq(installations.githubInstallationId, githubInstallationId));
}

export async function findInstallation(githubInstallationId: number): Promise<Installation | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, githubInstallationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function installationPlanAndSettings(
  installationId: string,
): Promise<{ plan: PlanId; settings: InstallationSettings } | null> {
  const db = getDb();
  const rows = await db
    .select({ plan: installations.plan, settings: installations.settings })
    .from(installations)
    .where(eq(installations.id, installationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateInstallationSettings(
  installationId: string,
  settings: InstallationSettings,
): Promise<void> {
  const db = getDb();
  await db
    .update(installations)
    .set({ settings, updatedAt: new Date() })
    .where(eq(installations.id, installationId));
}

export async function setInstallationPlan(installationId: string, plan: PlanId): Promise<void> {
  const db = getDb();
  await db
    .update(installations)
    .set({ plan, updatedAt: new Date() })
    .where(eq(installations.id, installationId));
}

/* ---------------------------------------------------------- repositories --- */

export async function upsertRepository(input: {
  installationId: string;
  githubRepoId: number;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
}): Promise<Repository> {
  const db = getDb();
  const rows = await db
    .insert(repositories)
    .values(input)
    .onConflictDoUpdate({
      target: repositories.githubRepoId,
      set: {
        installationId: input.installationId,
        fullName: input.fullName,
        isPrivate: input.isPrivate,
        defaultBranch: input.defaultBranch,
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("upsertRepository returned no row");
  return row;
}

export async function findRepositoryByGithubId(githubRepoId: number): Promise<Repository | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(repositories)
    .where(eq(repositories.githubRepoId, githubRepoId))
    .limit(1);
  return rows[0] ?? null;
}

export async function setRepositoryEnabled(repositoryId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(repositories)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(repositories.id, repositoryId));
}

export async function removeRepositories(githubRepoIds: number[]): Promise<void> {
  if (githubRepoIds.length === 0) return;
  const db = getDb();
  await db
    .update(repositories)
    .set({ enabled: false, updatedAt: new Date() })
    .where(inArray(repositories.githubRepoId, githubRepoIds));
}

export async function listRepositories(installationId: string): Promise<Repository[]> {
  const db = getDb();
  return db
    .select()
    .from(repositories)
    .where(eq(repositories.installationId, installationId))
    .orderBy(repositories.fullName);
}

/* -------------------------------------------------------------- rulebook --- */

export async function ensureRulebook(repositoryId: string): Promise<{ id: string; currentVersion: number }> {
  const db = getDb();
  const rows = await db
    .insert(rulebooks)
    .values({ repositoryId })
    .onConflictDoUpdate({
      target: rulebooks.repositoryId,
      set: { updatedAt: new Date() },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("ensureRulebook returned no row");
  return { id: row.id, currentVersion: row.currentVersion };
}

/**
 * Append an immutable rulebook version.
 *
 * The version number comes from the rulebook row's counter, incremented in the
 * same statement, so two concurrent pushes cannot mint the same version — the
 * unique index on (rulebook_id, version) is the backstop.
 */
export async function appendRulebookVersion(input: {
  repositoryId: string;
  commitSha: string;
  rawYaml: string;
  parsed: unknown;
  isValid: boolean;
  validationErrors: string[];
}): Promise<RulebookVersionRow> {
  const db = getDb();
  const book = await ensureRulebook(input.repositoryId);

  const bumped = await db
    .update(rulebooks)
    .set({ currentVersion: sql`${rulebooks.currentVersion} + 1`, updatedAt: new Date() })
    .where(eq(rulebooks.id, book.id))
    .returning({ version: rulebooks.currentVersion });
  const version = bumped[0]?.version ?? book.currentVersion + 1;

  const rows = await db
    .insert(rulebookVersions)
    .values({
      rulebookId: book.id,
      version,
      commitSha: input.commitSha,
      rawYaml: input.rawYaml,
      parsed: input.parsed,
      isValid: input.isValid,
      validationErrors: input.validationErrors,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("appendRulebookVersion returned no row");

  // Only a valid version becomes active. An invalid one is recorded and ignored,
  // so a broken rulebook can never silently switch standards enforcement off.
  if (input.isValid) {
    await db
      .update(repositories)
      .set({ activeRulebookVersionId: row.id, updatedAt: new Date() })
      .where(eq(repositories.id, input.repositoryId));
  }
  return row;
}

export async function activeRulebookVersion(repo: Repository): Promise<RulebookVersionRow | null> {
  if (!repo.activeRulebookVersionId) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(rulebookVersions)
    .where(eq(rulebookVersions.id, repo.activeRulebookVersionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function latestRulebookVersion(repositoryId: string): Promise<RulebookVersionRow | null> {
  const db = getDb();
  const rows = await db
    .select({ v: rulebookVersions })
    .from(rulebookVersions)
    .innerJoin(rulebooks, eq(rulebooks.id, rulebookVersions.rulebookId))
    .where(eq(rulebooks.repositoryId, repositoryId))
    .orderBy(desc(rulebookVersions.version))
    .limit(1);
  return rows[0]?.v ?? null;
}

export async function listRulebookVersions(
  repositoryId: string,
  limit = 20,
): Promise<RulebookVersionRow[]> {
  const db = getDb();
  const rows = await db
    .select({ v: rulebookVersions })
    .from(rulebookVersions)
    .innerJoin(rulebooks, eq(rulebooks.id, rulebookVersions.rulebookId))
    .where(eq(rulebooks.repositoryId, repositoryId))
    .orderBy(desc(rulebookVersions.version))
    .limit(limit);
  return rows.map((r) => r.v);
}

/* --------------------------------------------------------- pull requests --- */

export async function upsertPullRequest(input: {
  repositoryId: string;
  githubPrNumber: number;
  title: string;
  authorLogin: string;
  headSha: string;
  baseRef: string;
  state: string;
  isForkPr: boolean;
}): Promise<PullRequestRow> {
  const db = getDb();
  const rows = await db
    .insert(pullRequests)
    .values(input)
    .onConflictDoUpdate({
      target: [pullRequests.repositoryId, pullRequests.githubPrNumber],
      set: {
        title: input.title,
        headSha: input.headSha,
        state: input.state,
        authorLogin: input.authorLogin,
        baseRef: input.baseRef,
        isForkPr: input.isForkPr,
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("upsertPullRequest returned no row");
  return row;
}

export async function setSummaryCommentId(pullRequestId: string, commentId: number): Promise<void> {
  const db = getDb();
  await db
    .update(pullRequests)
    .set({ summaryCommentId: commentId, updatedAt: new Date() })
    .where(eq(pullRequests.id, pullRequestId));
}

/* ----------------------------------------------------------- review runs --- */

/**
 * Claim a run for (pull request, head sha, trigger).
 *
 * Returns null when a run already exists, which is how a redelivered webhook
 * becomes a no-op: the unique index does the deciding, not a prior SELECT.
 */
export async function claimReviewRun(input: {
  pullRequestId: string;
  headSha: string;
  trigger: ReviewTrigger;
  rulebookVersionId: string | null;
}): Promise<{ id: string } | null> {
  const db = getDb();
  const rows = await db
    .insert(reviewRuns)
    .values({
      pullRequestId: input.pullRequestId,
      headSha: input.headSha,
      trigger: input.trigger,
      rulebookVersionId: input.rulebookVersionId,
      status: "running",
    })
    .onConflictDoNothing({
      target: [reviewRuns.pullRequestId, reviewRuns.headSha, reviewRuns.trigger],
    })
    .returning({ id: reviewRuns.id });
  return rows[0] ?? null;
}

export async function completeReviewRun(input: {
  runId: string;
  status: ReviewStatus;
  detail: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  latencyMs: number;
  findingsTotal: number;
  findingsPosted: number;
  rulebookVersionId?: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(reviewRuns)
    .set({
      status: input.status,
      detail: input.detail,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costMicroUsd: input.costMicroUsd,
      latencyMs: input.latencyMs,
      findingsTotal: input.findingsTotal,
      findingsPosted: input.findingsPosted,
      ...(input.rulebookVersionId === undefined ? {} : { rulebookVersionId: input.rulebookVersionId }),
      updatedAt: new Date(),
    })
    .where(eq(reviewRuns.id, input.runId));
}

export async function failReviewRun(runId: string, detail: string): Promise<void> {
  const db = getDb();
  await db
    .update(reviewRuns)
    .set({ status: "failed", detail: detail.slice(0, 500), updatedAt: new Date() })
    .where(eq(reviewRuns.id, runId));
}

/* -------------------------------------------------------------- findings --- */

export async function saveFindings(
  runId: string,
  gated: GatedFinding[],
  commentIds: Map<string, number>,
): Promise<void> {
  if (gated.length === 0) return;
  const db = getDb();
  await db.insert(findings).values(
    gated.map((f) => ({
      reviewRunId: runId,
      fingerprint: f.fingerprint,
      category: f.category,
      ruleId: f.ruleId,
      filePath: f.filePath,
      startLine: f.anchor?.startLine ?? f.startLine,
      endLine: f.anchor?.line ?? f.endLine,
      title: f.title,
      bodyMd: f.body,
      suggestedPatch: f.suggestedPatch,
      confidenceBp: f.confidenceBp,
      posted: f.posted,
      dropReason: f.dropReason as DropReason | null,
      suppressedBy: f.suppressionId,
      githubCommentId: commentIds.get(f.fingerprint) ?? null,
    })),
  );
}

/** Fingerprints that already carry a live comment on this pull request. */
export async function postedFingerprints(pullRequestId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ fingerprint: findings.fingerprint })
    .from(findings)
    .innerJoin(reviewRuns, eq(reviewRuns.id, findings.reviewRunId))
    .where(and(eq(reviewRuns.pullRequestId, pullRequestId), eq(findings.posted, true)));
  return new Set(rows.map((r) => r.fingerprint));
}

export async function findFindingByCommentId(commentId: number): Promise<
  | {
      finding: FindingRow;
      repositoryId: string;
      installationId: string;
    }
  | null
> {
  const db = getDb();
  const rows = await db
    .select({
      finding: findings,
      repositoryId: repositories.id,
      installationId: repositories.installationId,
    })
    .from(findings)
    .innerJoin(reviewRuns, eq(reviewRuns.id, findings.reviewRunId))
    .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .where(eq(findings.githubCommentId, commentId))
    .limit(1);
  return rows[0] ?? null;
}

/* ---------------------------------------------------------- suppressions --- */

export async function addSuppression(input: {
  scope: SuppressionScope;
  installationId: string;
  repositoryId: string | null;
  fingerprint: string;
  reason: SuppressionReason;
  createdByLogin: string;
}): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .insert(suppressions)
    .values({
      scope: input.scope,
      installationId: input.installationId,
      repositoryId: input.scope === "installation" ? null : input.repositoryId,
      fingerprint: input.fingerprint,
      reason: input.reason,
      createdByLogin: input.createdByLogin,
    })
    .onConflictDoNothing()
    .returning({ id: suppressions.id });
  if (rows[0]) return rows[0].id;
  // Already suppressed: return the existing id so the caller can link the finding.
  const existing = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.installationId, input.installationId),
        eq(suppressions.fingerprint, input.fingerprint),
      ),
    )
    .limit(1);
  return existing[0]?.id ?? null;
}

/**
 * Suppressions in force for one repository: its own, plus any installation-scope
 * (org-wide) ones. Expired rows are excluded by letting the database compare the
 * timestamps — a JS Date truncated to milliseconds against a microsecond-precision
 * `timestamptz` is how a row becomes permanently un-matchable.
 */
export async function activeSuppressions(input: {
  installationId: string;
  repositoryId: string;
}): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({
      id: suppressions.id,
      fingerprint: suppressions.fingerprint,
      scope: suppressions.scope,
    })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.installationId, input.installationId),
        sql`(${suppressions.expiresAt} IS NULL OR ${suppressions.expiresAt} > now())`,
      ),
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.scope === "installation") map.set(row.fingerprint, row.id);
  }
  // Repo-scope rows are filtered in a second pass so an org-wide row cannot be
  // shadowed by a repo row belonging to a different repository.
  const repoRows = await db
    .select({ id: suppressions.id, fingerprint: suppressions.fingerprint })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.scope, "repository"),
        eq(suppressions.repositoryId, input.repositoryId),
        sql`(${suppressions.expiresAt} IS NULL OR ${suppressions.expiresAt} > now())`,
      ),
    );
  for (const row of repoRows) map.set(row.fingerprint, row.id);
  return map;
}

export async function listSuppressions(installationId: string, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(suppressions)
    .where(eq(suppressions.installationId, installationId))
    .orderBy(desc(suppressions.createdAt))
    .limit(limit);
}

/* -------------------------------------------------------------- feedback --- */

export async function recordFeedback(input: {
  findingId: string;
  actorLogin: string;
  kind: FeedbackKind;
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(feedbackEvents)
    .values({
      findingId: input.findingId,
      actorLogin: input.actorLogin,
      kind: input.kind,
      payload: input.payload ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: feedbackEvents.id });
  return rows.length > 0;
}

/**
 * Comments posted recently enough to be worth polling for reactions.
 *
 * GitHub does not deliver reaction webhooks to Apps, so a thumbs-down is only
 * observable by polling. The window is fixed and bounded (see feedback/sweep.ts).
 */
export async function commentsForReactionSweep(input: {
  since: Date;
  limit: number;
}): Promise<
  {
    findingId: string;
    commentId: number;
    repoFullName: string;
    repositoryId: string;
    installationId: string;
    githubInstallationId: number;
    fingerprint: string;
    body: string;
    plan: PlanId;
    settings: InstallationSettings;
  }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      findingId: findings.id,
      commentId: findings.githubCommentId,
      fingerprint: findings.fingerprint,
      body: findings.bodyMd,
      repoFullName: repositories.fullName,
      repositoryId: repositories.id,
      installationId: installations.id,
      githubInstallationId: installations.githubInstallationId,
      plan: installations.plan,
      settings: installations.settings,
    })
    .from(findings)
    .innerJoin(reviewRuns, eq(reviewRuns.id, findings.reviewRunId))
    .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .innerJoin(installations, eq(installations.id, repositories.installationId))
    .where(
      and(
        eq(findings.posted, true),
        gte(findings.createdAt, input.since),
        isNull(installations.deletedAt),
      ),
    )
    .orderBy(desc(findings.createdAt))
    .limit(input.limit);

  return rows.flatMap((r) =>
    r.commentId === null
      ? []
      : [{ ...r, commentId: r.commentId }],
  );
}

/* --------------------------------------------------------------- billing --- */

export async function countSeat(input: {
  installationId: string;
  login: string;
  period: string;
}): Promise<number> {
  const db = getDb();
  await db
    .insert(seats)
    .values({
      installationId: input.installationId,
      githubLogin: input.login,
      billablePeriod: input.period,
    })
    .onConflictDoUpdate({
      target: [seats.installationId, seats.githubLogin, seats.billablePeriod],
      set: { lastPrAt: new Date() },
    });

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(seats)
    .where(
      and(eq(seats.installationId, input.installationId), eq(seats.billablePeriod, input.period)),
    );
  return rows[0]?.count ?? 0;
}

export async function upsertSubscription(input: {
  installationId: string;
  provider: string;
  externalId: string;
  plan: PlanId;
  seatLimit: number;
  status: string;
  billingCycleAnchor: Date | null;
  cancelsAt: Date | null;
  rawPayload: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(subscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: subscriptions.installationId,
      set: {
        provider: input.provider,
        externalId: input.externalId,
        plan: input.plan,
        seatLimit: input.seatLimit,
        status: input.status,
        billingCycleAnchor: input.billingCycleAnchor,
        cancelsAt: input.cancelsAt,
        rawPayload: input.rawPayload,
        updatedAt: new Date(),
      },
    });
}

export async function findSubscription(installationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.installationId, installationId))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------ dashboard ---- */

export async function listInstallations(limit = 50): Promise<Installation[]> {
  const db = getDb();
  return db
    .select()
    .from(installations)
    .where(isNull(installations.deletedAt))
    .orderBy(installations.accountLogin)
    .limit(limit);
}

export interface RunSummaryRow {
  runId: string;
  status: ReviewStatus;
  detail: string | null;
  trigger: ReviewTrigger;
  model: string;
  costMicroUsd: number;
  latencyMs: number;
  findingsTotal: number;
  findingsPosted: number;
  createdAt: Date;
  prNumber: number;
  prTitle: string;
  repoFullName: string;
  repositoryId: string;
}

export async function listRecentRuns(installationId: string, limit = 25): Promise<RunSummaryRow[]> {
  const db = getDb();
  return db
    .select({
      runId: reviewRuns.id,
      status: reviewRuns.status,
      detail: reviewRuns.detail,
      trigger: reviewRuns.trigger,
      model: reviewRuns.model,
      costMicroUsd: reviewRuns.costMicroUsd,
      latencyMs: reviewRuns.latencyMs,
      findingsTotal: reviewRuns.findingsTotal,
      findingsPosted: reviewRuns.findingsPosted,
      createdAt: reviewRuns.createdAt,
      prNumber: pullRequests.githubPrNumber,
      prTitle: pullRequests.title,
      repoFullName: repositories.fullName,
      repositoryId: repositories.id,
    })
    .from(reviewRuns)
    .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .where(eq(repositories.installationId, installationId))
    .orderBy(desc(reviewRuns.createdAt))
    .limit(limit);
}

export async function listRunFindings(runId: string): Promise<FindingRow[]> {
  const db = getDb();
  return db
    .select()
    .from(findings)
    .where(eq(findings.reviewRunId, runId))
    .orderBy(desc(findings.confidenceBp));
}

export interface NoiseStats {
  runs: number;
  postedRuns: number;
  silentRuns: number;
  failedRuns: number;
  findingsTotal: number;
  findingsPosted: number;
  /** Median posted comments per completed run. */
  medianCommentsPerPr: number;
  costMicroUsd: number;
  thumbsUp: number;
  thumbsDown: number;
}

/**
 * Noise statistics for one installation over a window.
 *
 * The window is expressed as a typed `gte` against a JS Date, never as a Date
 * inside a raw `sql` fragment.
 */
export async function noiseStats(input: {
  installationId: string;
  since: Date;
}): Promise<NoiseStats> {
  const db = getDb();
  const runs = await db
    .select({
      status: reviewRuns.status,
      findingsTotal: reviewRuns.findingsTotal,
      findingsPosted: reviewRuns.findingsPosted,
      costMicroUsd: reviewRuns.costMicroUsd,
    })
    .from(reviewRuns)
    .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .where(and(eq(repositories.installationId, input.installationId), gte(reviewRuns.createdAt, input.since)));

  const feedback = await db
    .select({ kind: feedbackEvents.kind, count: sql<number>`count(*)::int` })
    .from(feedbackEvents)
    .innerJoin(findings, eq(findings.id, feedbackEvents.findingId))
    .innerJoin(reviewRuns, eq(reviewRuns.id, findings.reviewRunId))
    .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .where(
      and(
        eq(repositories.installationId, input.installationId),
        gte(feedbackEvents.createdAt, input.since),
      ),
    )
    .groupBy(feedbackEvents.kind);

  const completed = runs.filter((r) => r.status === "posted" || r.status === "silent");
  const counts = completed.map((r) => r.findingsPosted).sort((a, b) => a - b);
  const median =
    counts.length === 0
      ? 0
      : counts.length % 2 === 1
        ? (counts[(counts.length - 1) / 2] as number)
        : ((counts[counts.length / 2 - 1] as number) + (counts[counts.length / 2] as number)) / 2;

  const byKind = new Map(feedback.map((f) => [f.kind, f.count]));

  return {
    runs: runs.length,
    postedRuns: runs.filter((r) => r.status === "posted").length,
    silentRuns: runs.filter((r) => r.status === "silent").length,
    failedRuns: runs.filter((r) => r.status === "failed").length,
    findingsTotal: runs.reduce((n, r) => n + r.findingsTotal, 0),
    findingsPosted: runs.reduce((n, r) => n + r.findingsPosted, 0),
    medianCommentsPerPr: median,
    costMicroUsd: runs.reduce((n, r) => n + r.costMicroUsd, 0),
    thumbsUp: byKind.get("thumbs_up") ?? 0,
    thumbsDown: (byKind.get("thumbs_down") ?? 0) + (byKind.get("ignore_reply") ?? 0),
  };
}

/** Runs older than the retention window, for the housekeeping sweep. */
export async function pruneOldRuns(before: Date, limit = 500): Promise<number> {
  const db = getDb();
  const stale = await db
    .select({ id: reviewRuns.id })
    .from(reviewRuns)
    .where(lt(reviewRuns.createdAt, before))
    .limit(limit);
  if (stale.length === 0) return 0;
  await db.delete(reviewRuns).where(inArray(reviewRuns.id, stale.map((r) => r.id)));
  return stale.length;
}
