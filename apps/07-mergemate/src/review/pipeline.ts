/**
 * The review pipeline: diff in, comments on the pull request out.
 *
 * Deliberately free of database access. Everything it needs is passed in and
 * everything it decides comes back in the result, which is what makes three
 * different callers possible over the same code path: the queue worker (real),
 * the golden-set harness (fixtures, no GitHub), and `npm run review:dry-run`
 * (real GitHub reads, no writes).
 *
 * Failure posture, in one place, because this is where a code reviewer earns or
 * loses trust:
 *
 *  - analysis failed (timeout, refusal, unparseable) → status `failed`, nothing
 *    posted. A review that cannot be produced is reported as not produced.
 *  - scoring failed → status `failed`, nothing posted. Findings without a
 *    confidence are not "probably fine": they are unscored, and unscored findings
 *    do not get to speak.
 *  - a finding cannot be anchored to an exact line → dropped.
 *  - nothing cleared the gate → status `silent`. That is a success, not an error.
 */

import type { GitHubGateway, RepoRef, PullRequestInfo, InlineCommentInput } from "../github/client";
import { extractFingerprint, renderInlineComment, renderSummaryComment, suggestionIsSafe } from "../github/comments";
import { anchorFinding, parseFiles, type DiffFile } from "../diff/parse";
import { budgetFiles, renderContext } from "../diff/context";
import type { ResolvedPolicy } from "../rules/rulebook";
import type { ReviewModel } from "./model";
import type { ExpandedFileContext, PullRequestContext } from "./prompt";
import { fingerprint } from "./fingerprint";
import { gate, shouldPostSummary, type GateResult } from "./gate";
import { addUsage, costMicroUsd } from "./cost";
import type { GatedFinding, ModelUsage, ScoredFinding } from "./types";
import { NO_USAGE } from "./types";
import type { ReviewStatus } from "../db/schema";

/** Files we will spend a content fetch on, for context expansion. */
const MAX_CONTEXT_FILES = 12;

export interface PipelineInput {
  gateway: GitHubGateway;
  model: ReviewModel;
  ref: RepoRef;
  pr: PullRequestInfo;
  policy: ResolvedPolicy;
  rulebookVersion: number | null;
  rulebookInvalid: boolean;
  /** fingerprint -> suppression id. */
  suppressions: Map<string, string>;
  /** Fingerprints already carrying a live comment on this pull request. */
  alreadyPosted: Set<string>;
  existingSummaryCommentId: number | null;
  maxDiffLines: number;
  dashboardUrl: string;
  seatNotice: string | null;
  /**
   * False for a dry run: everything is computed, nothing is written to GitHub.
   * Distinct from shadow mode, which is a customer-facing setting on the policy.
   */
  post: boolean;
  now?: () => number;
}

export interface PipelineResult {
  status: ReviewStatus;
  detail: string | null;
  model: string;
  usage: ModelUsage;
  costMicroUsd: number;
  latencyMs: number;
  findings: GatedFinding[];
  counts: GateResult["counts"];
  /** Findings standing on the PR after this run: new + still-live earlier ones. */
  standing: GatedFinding[];
  summaryCommentId: number | null;
  /** fingerprint -> GitHub review comment id, for comments this run created. */
  commentIds: Map<string, number>;
  truncatedFiles: string[];
  files: DiffFile[];
  /** What was (or would have been) sent, exposed for the dry run. */
  plannedComments: InlineCommentInput[];
  summaryBody: string | null;
  discarded: string[];
}

export async function runReviewPipeline(input: PipelineInput): Promise<PipelineResult> {
  const now = input.now ?? (() => Date.now());
  const startedAt = now();
  const model = input.model;

  const base = {
    model: model.id,
    usage: NO_USAGE,
    costMicroUsd: 0,
    latencyMs: 0,
    findings: [] as GatedFinding[],
    counts: gate({ findings: [], policy: input.policy, suppressions: new Map(), alreadyPosted: new Set() }).counts,
    standing: [] as GatedFinding[],
    summaryCommentId: input.existingSummaryCommentId,
    commentIds: new Map<string, number>(),
    truncatedFiles: [] as string[],
    files: [] as DiffFile[],
    plannedComments: [] as InlineCommentInput[],
    summaryBody: null as string | null,
    discarded: [] as string[],
  };

  /* ---- 1. diff ---- */
  const entries = await input.gateway.listPullRequestFiles(input.ref, input.pr.number);
  const allFiles = parseFiles(entries);
  const { included, skipped } = budgetFiles(allFiles, input.maxDiffLines);

  if (included.length === 0) {
    return {
      ...base,
      status: "skipped",
      detail:
        allFiles.length === 0
          ? "pull request has no changed files"
          : "no reviewable text changes in this diff",
      latencyMs: now() - startedAt,
      files: allFiles,
      truncatedFiles: skipped,
    };
  }

  /* ---- 2. context expansion ---- */
  const contexts: ExpandedFileContext[] = [];
  const contextTargets = [...included]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, MAX_CONTEXT_FILES);
  for (const file of contextTargets) {
    const body = await input.gateway.getFileContent(input.ref, file.path, input.pr.headSha);
    if (body === null) continue;
    const numberedBody = renderContext(file, body);
    if (numberedBody.trim() !== "") contexts.push({ path: file.path, numberedBody });
  }

  const prContext: PullRequestContext = {
    repoFullName: `${input.ref.owner}/${input.ref.repo}`,
    number: input.pr.number,
    title: input.pr.title,
    authorLogin: input.pr.authorLogin,
    baseRef: input.pr.baseRef,
    headSha: input.pr.headSha,
    isForkPr: input.pr.isForkPr,
  };

  /* ---- 3. analysis pass ---- */
  const analysis = await model.analyse({
    pr: prContext,
    files: included,
    contexts,
    policy: input.policy,
    truncatedFiles: skipped,
  });

  if (!analysis.ok) {
    const usage = analysis.usage;
    return {
      ...base,
      status: "failed",
      detail: `analysis ${analysis.reason}: ${analysis.message}`.slice(0, 500),
      usage,
      costMicroUsd: costMicroUsd(model.id, usage),
      latencyMs: now() - startedAt,
      files: allFiles,
      truncatedFiles: skipped,
    };
  }

  let usage = analysis.usage;
  const discarded = [...analysis.discarded];

  /* ---- 4. confidence pass ---- */
  let scored: ScoredFinding[] = [];
  if (analysis.findings.length > 0) {
    const scoring = await model.score({ findings: analysis.findings, files: included });
    if (!scoring.ok) {
      usage = addUsage(usage, scoring.usage);
      return {
        ...base,
        status: "failed",
        detail: `confidence scoring ${scoring.reason}: ${scoring.message}`.slice(0, 500),
        usage,
        costMicroUsd: costMicroUsd(model.id, usage),
        latencyMs: now() - startedAt,
        files: allFiles,
        truncatedFiles: skipped,
      };
    }
    usage = addUsage(usage, scoring.usage);
    discarded.push(...scoring.discarded);

    const byId = new Map(scoring.scores.map((s) => [s.id, s]));
    scored = analysis.findings.map((finding) => {
      const score = byId.get(finding.id);
      const anchor = anchorFinding(included, {
        path: finding.filePath,
        startLine: finding.startLine,
        endLine: finding.endLine,
      });
      const snippetLines = anchor ? anchor.lines.map((l) => l.content) : [];
      return {
        ...finding,
        // A finding the scorer did not mention is unscored, and unscored is zero.
        confidenceBp: score?.confidenceBp ?? 0,
        scoreReason: score?.reason ?? "not scored by the confidence pass",
        fingerprint: fingerprint({
          ruleId: finding.ruleId,
          category: finding.category,
          filePath: anchor?.path ?? finding.filePath,
          snippetLines,
        }),
        anchor,
      };
    });
  }

  /* ---- 5. the gate ---- */
  const gated = gate({
    findings: scored,
    policy: input.policy,
    suppressions: input.suppressions,
    alreadyPosted: input.alreadyPosted,
  });

  const standing = gated.all.filter((f) => f.posted || f.dropReason === "already_posted");

  /* ---- 6. posting ---- */
  const plannedComments: InlineCommentInput[] = gated.postable.map((finding) =>
    buildInlineComment(finding, input),
  );

  const latencyMs = now() - startedAt;
  const cost = costMicroUsd(model.id, usage);

  const summaryWanted = shouldPostSummary(input.policy, standing.length);
  const summaryBody =
    summaryWanted || input.existingSummaryCommentId !== null
      ? renderSummaryComment({
          prTitle: input.pr.title,
          prNumber: input.pr.number,
          posted: standing,
          rulebookVersion: input.rulebookVersion,
          rulebookInvalid: input.rulebookInvalid,
          model: model.id,
          fakeModel: model.isFake,
          costMicroUsd: cost,
          latencyMs,
          dashboardUrl: input.dashboardUrl,
          repoFullName: prContext.repoFullName,
          truncatedFiles: skipped,
          seatNotice: input.seatNotice,
        })
      : null;

  const commentIds = new Map<string, number>();
  let summaryCommentId = input.existingSummaryCommentId;

  /**
   * Shadow mode means *nothing* reaches GitHub. Checked here as well as in the gate
   * because the summary path used to slip through: a pull request that already had a
   * summary comment from before shadow mode was switched on would still have it
   * edited, which is a write, on a setting whose whole promise is that there are
   * none.
   */
  const canWrite = input.post && !input.policy.shadowMode;

  if (canWrite && plannedComments.length > 0) {
    const reviewId = await input.gateway.createReview(input.ref, input.pr.number, {
      commitId: input.pr.headSha,
      body: reviewHeadline(gated.postable.length),
      comments: plannedComments,
    });
    const posted = await input.gateway.listReviewComments(input.ref, input.pr.number, reviewId);
    for (const comment of posted) {
      const fp = extractFingerprint(comment.body);
      if (fp) commentIds.set(fp, comment.id);
    }
  }

  if (canWrite && summaryBody !== null) {
    // One comment per pull request, edited in place. Never a new comment per push.
    if (summaryCommentId !== null) {
      await input.gateway.updateIssueComment(input.ref, summaryCommentId, summaryBody);
    } else if (summaryWanted) {
      summaryCommentId = await input.gateway.createIssueComment(
        input.ref,
        input.pr.number,
        summaryBody,
      );
    }
  }

  const status: ReviewStatus = gated.postable.length > 0 ? "posted" : "silent";
  const detail =
    status === "silent"
      ? silenceDetail(gated)
      : null;

  return {
    status,
    detail,
    model: model.id,
    usage,
    costMicroUsd: cost,
    latencyMs,
    findings: gated.all,
    counts: gated.counts,
    standing,
    summaryCommentId,
    commentIds,
    truncatedFiles: skipped,
    files: allFiles,
    plannedComments,
    summaryBody,
    discarded,
  };
}

function buildInlineComment(finding: GatedFinding, input: PipelineInput): InlineCommentInput {
  const anchor = finding.anchor;
  if (!anchor) throw new Error("gate returned a postable finding with no anchor");
  const body = renderInlineComment({
    finding,
    anchor,
    rulebookVersion: input.rulebookVersion,
    fakeModel: input.model.isFake,
    includeSuggestion:
      input.policy.suggestedPatches &&
      finding.suggestedPatch !== null &&
      suggestionIsSafe(anchor, finding.suggestedPatch),
  });
  const comment: InlineCommentInput = {
    path: anchor.path,
    line: anchor.line,
    side: anchor.side,
    body,
  };
  if (anchor.startLine !== undefined && anchor.startLine !== anchor.line) {
    comment.startLine = anchor.startLine;
    comment.startSide = anchor.startSide;
  }
  return comment;
}

function reviewHeadline(count: number): string {
  return count === 1
    ? "MergeMate raised 1 finding above its confidence threshold."
    : `MergeMate raised ${count} findings above its confidence threshold.`;
}

/** Why the bot said nothing — dashboard copy, never posted to the PR. */
function silenceDetail(result: GateResult): string {
  const parts: string[] = [];
  const c = result.counts;
  if (c.below_threshold) parts.push(`${c.below_threshold} below threshold`);
  if (c.suppressed) parts.push(`${c.suppressed} suppressed`);
  if (c.already_posted) parts.push(`${c.already_posted} already commented`);
  if (c.unanchorable) parts.push(`${c.unanchorable} could not be anchored`);
  if (c.path_excluded) parts.push(`${c.path_excluded} in excluded paths`);
  if (c.duplicate) parts.push(`${c.duplicate} duplicates`);
  if (c.shadow_mode) parts.push(`${c.shadow_mode} withheld by shadow mode`);
  if (c.category_disabled) parts.push(`${c.category_disabled} in disabled categories`);
  if (parts.length === 0) return "no candidate findings";
  return parts.join(", ");
}
