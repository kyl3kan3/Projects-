/**
 * The database-facing half of a review: load state, run the pipeline, persist.
 *
 * Split from pipeline.ts so that the decision-making code has no I/O and the I/O
 * code has no decisions. This module is the only thing the queue worker calls.
 */

import type { GitHubGateway } from "../github/client";
import { octokitGateway, type OctokitLike } from "../github/client";
import { renderRulebookCheck } from "../github/comments";
import type { ReviewModel } from "./model";
import { runReviewPipeline, type PipelineResult } from "./pipeline";
import { DEFAULT_RULEBOOK, parseRulebook, resolvePolicy, type RulebookConfig } from "../rules/rulebook";
import {
  activeRulebookVersion,
  activeSuppressions,
  appendRulebookVersion,
  claimReviewRun,
  completeReviewRun,
  countSeat,
  failReviewRun,
  findInstallation,
  findRepositoryByGithubId,
  findSubscription,
  latestRulebookVersion,
  postedFingerprints,
  saveFindings,
  setSummaryCommentId,
  upsertPullRequest,
  upsertRepository,
} from "../db/store";
import { billingPeriodStart, reviewAllowed, seatNotice, thresholdOverrideFor } from "../lib/plans";
import { env } from "../lib/env";
import { log as rootLog } from "../lib/logger";
import type { ReviewTrigger } from "../db/schema";

export interface ReviewJobData {
  githubInstallationId: number;
  githubRepoId: number;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  trigger: ReviewTrigger;
}

export interface ReviewJobOutcome {
  status: "done" | "duplicate" | "skipped";
  detail: string;
  runId?: string;
  result?: PipelineResult;
}

export interface ExecuteOptions {
  gateway: GitHubGateway;
  model: ReviewModel;
}

export async function executeReviewJob(
  job: ReviewJobData,
  options: ExecuteOptions,
): Promise<ReviewJobOutcome> {
  const log = rootLog.child({
    installation: job.githubInstallationId,
    repo: `${job.owner}/${job.repo}`,
    pr: job.prNumber,
    sha: job.headSha.slice(0, 8),
  });

  const installation = await findInstallation(job.githubInstallationId);
  if (!installation || installation.deletedAt !== null) {
    return { status: "skipped", detail: "installation is not active" };
  }

  const ref = { owner: job.owner, repo: job.repo };
  let repository = await findRepositoryByGithubId(job.githubRepoId);
  if (!repository) {
    const info = await options.gateway.getRepo(ref);
    repository = await upsertRepository({
      installationId: installation.id,
      githubRepoId: info.id,
      fullName: info.fullName,
      isPrivate: info.isPrivate,
      defaultBranch: info.defaultBranch,
    });
  }

  const pr = await options.gateway.getPullRequest(ref, job.prNumber);
  const prRow = await upsertPullRequest({
    repositoryId: repository.id,
    githubPrNumber: pr.number,
    title: pr.title,
    authorLogin: pr.authorLogin,
    headSha: pr.headSha,
    baseRef: pr.baseRef,
    state: pr.state,
    isForkPr: pr.isForkPr,
  });

  /* ---- plan gate, before a single token is spent ---- */
  const gateDecision = reviewAllowed({
    planId: installation.plan,
    repoIsPrivate: repository.isPrivate,
    repoEnabled: repository.enabled,
    installationSuspended: installation.suspendedAt !== null,
  });

  const claim = await claimReviewRun({
    pullRequestId: prRow.id,
    headSha: pr.headSha,
    trigger: job.trigger,
    rulebookVersionId: null,
  });
  if (!claim) {
    log.info({}, "review already run for this head sha and trigger");
    return { status: "duplicate", detail: "a run for this head sha and trigger already exists" };
  }

  if (!gateDecision.allowed) {
    const detail = describeGate(gateDecision.reason);
    await completeReviewRun({
      runId: claim.id,
      status: "skipped",
      detail,
      model: "",
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      latencyMs: 0,
      findingsTotal: 0,
      findingsPosted: 0,
    });
    if (gateDecision.reason === "plan_required") {
      // A check run, not a comment: an upsell in the review thread is noise.
      await safely(log, () =>
        options.gateway.createCheckRun(ref, {
          name: "MergeMate",
          headSha: pr.headSha,
          conclusion: "neutral",
          title: "Private repository needs a paid plan",
          summary:
            "MergeMate reviews public repositories for free. Reviewing a private repository needs the Team or Business plan; nothing was analysed and no tokens were spent.",
        }),
      );
    }
    log.info({ reason: gateDecision.reason }, "review skipped by plan gate");
    return { status: "skipped", detail, runId: claim.id };
  }

  try {
    /* ---- rulebook ---- */
    const rulebook = await loadRulebook(options.gateway, repository, log);

    const policy = resolvePolicy({
      config: rulebook.config,
      installationThreshold: thresholdOverrideFor(
        installation.plan,
        installation.settings.confidenceThreshold,
      ),
      shadowMode: installation.settings.shadowMode === true,
      defaultThreshold: env.confidenceThreshold,
      defaultMaxComments: env.maxCommentsPerPr,
    });

    /* ---- suppression + history ---- */
    const suppressions = await activeSuppressions({
      installationId: installation.id,
      repositoryId: repository.id,
    });
    const alreadyPosted = await postedFingerprints(prRow.id);

    /* ---- seats ---- */
    const subscription = await findSubscription(installation.id);
    const seatsUsed = await countSeat({
      installationId: installation.id,
      login: pr.authorLogin,
      period: billingPeriodStart(new Date()),
    });
    const notice = seatNotice({
      planId: installation.plan,
      seatsUsed,
      seatLimit: subscription?.seatLimit ?? 0,
    });

    const result = await runReviewPipeline({
      gateway: options.gateway,
      model: options.model,
      ref,
      pr,
      policy,
      rulebookVersion: rulebook.version,
      rulebookInvalid: rulebook.invalid,
      suppressions,
      alreadyPosted,
      existingSummaryCommentId: prRow.summaryCommentId,
      maxDiffLines: env.maxDiffLines,
      dashboardUrl: env.dashboardUrl,
      seatNotice: notice,
      post: true,
    });

    await saveFindings(claim.id, result.findings, result.commentIds);
    await completeReviewRun({
      runId: claim.id,
      status: result.status,
      detail: result.detail,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costMicroUsd: result.costMicroUsd,
      latencyMs: result.latencyMs,
      findingsTotal: result.findings.length,
      findingsPosted: result.counts.posted,
      rulebookVersionId: rulebook.versionId,
    });

    if (result.summaryCommentId !== null && result.summaryCommentId !== prRow.summaryCommentId) {
      await setSummaryCommentId(prRow.id, result.summaryCommentId);
    }

    log.info(
      {
        status: result.status,
        findings: result.findings.length,
        posted: result.counts.posted,
        gated: result.findings.length - result.counts.posted,
        costMicroUsd: result.costMicroUsd,
        latencyMs: result.latencyMs,
        model: result.model,
      },
      "review complete",
    );

    return { status: "done", detail: result.detail ?? result.status, runId: claim.id, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failReviewRun(claim.id, message);
    log.error({ err: message }, "review failed");
    throw err;
  }
}

function describeGate(reason: "plan_required" | "suspended" | "repo_disabled"): string {
  switch (reason) {
    case "plan_required":
      return "private repository on the free plan";
    case "suspended":
      return "installation is suspended";
    case "repo_disabled":
      return "repository is disabled in MergeMate";
  }
}

export interface LoadedRulebook {
  config: RulebookConfig;
  version: number | null;
  versionId: string | null;
  /** True when the newest committed rulebook does not validate. */
  invalid: boolean;
}

/**
 * Resolve the rulebook a run should use.
 *
 * The active version is the newest one that validated. If the repository has no
 * versions at all — the common case on the first review after install — the file
 * is fetched from the default branch and versioned now, so a team does not have to
 * push a no-op commit to get their rulebook picked up.
 */
export async function loadRulebook(
  gateway: GitHubGateway,
  repository: { id: string; fullName: string; defaultBranch: string },
  log = rootLog,
): Promise<LoadedRulebook> {
  const [owner, repo] = repository.fullName.split("/");
  const active = await activeRulebookVersion(repository as never);
  const latest = await latestRulebookVersion(repository.id);

  if (!active && !latest && owner && repo) {
    const raw = await gateway.getFileContent({ owner, repo }, ".mergemate.yml", repository.defaultBranch);
    if (raw === null) {
      return { config: DEFAULT_RULEBOOK, version: null, versionId: null, invalid: false };
    }
    const parsed = parseRulebook(raw);
    const row = await appendRulebookVersion({
      repositoryId: repository.id,
      commitSha: repository.defaultBranch,
      rawYaml: raw,
      parsed: parsed.valid ? parsed.config : null,
      isValid: parsed.valid,
      validationErrors: parsed.errors,
    });
    log.info({ repo: repository.fullName, valid: parsed.valid }, "rulebook bootstrapped");
    return parsed.valid
      ? { config: parsed.config, version: row.version, versionId: row.id, invalid: false }
      : { config: DEFAULT_RULEBOOK, version: null, versionId: null, invalid: true };
  }

  if (!active) {
    return { config: DEFAULT_RULEBOOK, version: null, versionId: null, invalid: latest !== null && !latest.isValid };
  }

  const parsed = parseRulebook(active.rawYaml);
  return {
    config: parsed.valid ? parsed.config : DEFAULT_RULEBOOK,
    version: active.version,
    versionId: active.id,
    invalid: latest !== null && latest.id !== active.id && !latest.isValid,
  };
}

/**
 * A rulebook change on the default branch: validate, version, and report.
 * Called from the push webhook (ARCHITECTURE.md flow 3).
 */
export async function applyRulebookChange(input: {
  gateway: GitHubGateway;
  repository: { id: string; fullName: string; defaultBranch: string };
  commitSha: string;
}): Promise<{ version: number; valid: boolean; errors: string[] }> {
  const [owner, repo] = input.repository.fullName.split("/");
  if (!owner || !repo) throw new Error(`malformed repository name: ${input.repository.fullName}`);
  const ref = { owner, repo };

  const raw = await input.gateway.getFileContent(ref, ".mergemate.yml", input.commitSha);
  if (raw === null) {
    // Deleted: record the removal as an invalid version so the active one stands
    // and the dashboard shows why standards enforcement stopped changing.
    const row = await appendRulebookVersion({
      repositoryId: input.repository.id,
      commitSha: input.commitSha,
      rawYaml: "",
      parsed: null,
      isValid: false,
      validationErrors: [".mergemate.yml was deleted from the default branch"],
    });
    await input.gateway.createCheckRun(ref, {
      name: "MergeMate rulebook",
      headSha: input.commitSha,
      ...renderRulebookCheck({
        version: row.version,
        valid: false,
        errors: [".mergemate.yml was deleted; reviews continue on the last version that validated"],
        ruleCount: 0,
      }),
    });
    return { version: row.version, valid: false, errors: ["rulebook deleted"] };
  }

  const parsed = parseRulebook(raw);
  const row = await appendRulebookVersion({
    repositoryId: input.repository.id,
    commitSha: input.commitSha,
    rawYaml: raw,
    parsed: parsed.valid ? parsed.config : null,
    isValid: parsed.valid,
    validationErrors: parsed.errors,
  });

  await input.gateway.createCheckRun(ref, {
    name: "MergeMate rulebook",
    headSha: input.commitSha,
    ...renderRulebookCheck({
      version: row.version,
      valid: parsed.valid,
      errors: parsed.errors,
      ruleCount: parsed.config.rules.length,
    }),
  });

  return { version: row.version, valid: parsed.valid, errors: parsed.errors };
}

/**
 * Build a gateway from any Octokit-shaped client.
 *
 * The cast is the one place it happens: Probot's bundled Octokit and a
 * token-authenticated Octokit have incompatible *generated* types but identical
 * `request(route, params)` behaviour, which is all `OctokitLike` needs.
 */
export function gatewayFor(client: unknown): GitHubGateway {
  return octokitGateway(client as OctokitLike);
}

async function safely(log: typeof rootLog, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "non-fatal GitHub call failed");
  }
}
