/**
 * `pull_request` — opened, synchronize, reopened.
 *
 * The handler does the cheap, must-not-fail work (persist the installation, the
 * repository and the pull request) and then hands off. It returns before any
 * model call, because GitHub's delivery timeout is 10 seconds and a review takes
 * up to two minutes.
 *
 * With Redis configured the hand-off is a queued job. Without it the review runs
 * inline, detached from the response, which is the right shape for a single-tenant
 * self-host and the only way to exercise the pipeline locally without a broker.
 */

import type { Context } from "probot";
import { enqueueReview, PRIORITY_BUSINESS, PRIORITY_STANDARD, queueEnabled } from "../review/queue";
import { executeReviewJob, gatewayFor, type ReviewJobData } from "../review/run";
import { selectModel } from "../review/model";
import { findInstallation, upsertInstallation, upsertPullRequest, upsertRepository } from "../db/store";
import type { AccountType, ReviewTrigger } from "../db/schema";
import { log as rootLog } from "../lib/logger";

type PullRequestContextName = "pull_request.opened" | "pull_request.synchronize" | "pull_request.reopened";

const TRIGGERS: Record<string, ReviewTrigger> = {
  opened: "opened",
  synchronize: "synchronize",
  reopened: "reopened",
};

export async function onPullRequest(context: Context<PullRequestContextName>): Promise<void> {
  const payload = context.payload;
  const action = payload.action;
  const trigger = TRIGGERS[action];
  if (!trigger) return;

  const installationId = payload.installation?.id;
  if (!installationId) {
    // Every event from a GitHub App carries an installation; without one there is
    // no token to act with, so there is nothing to do but say so.
    rootLog.warn({ action }, "pull_request event with no installation");
    return;
  }

  const repo = payload.repository;
  const account = repo.owner;

  const installation = await upsertInstallation({
    githubInstallationId: installationId,
    accountLogin: account.login,
    accountType: (account.type as AccountType) ?? "Organization",
  });

  const repository = await upsertRepository({
    installationId: installation.id,
    githubRepoId: repo.id,
    fullName: repo.full_name,
    isPrivate: repo.private,
    defaultBranch: repo.default_branch,
  });

  const pr = payload.pull_request;
  await upsertPullRequest({
    repositoryId: repository.id,
    githubPrNumber: pr.number,
    title: pr.title ?? "",
    authorLogin: pr.user?.login ?? "unknown",
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    state: pr.state,
    isForkPr: pr.head.repo?.full_name !== repo.full_name,
  });

  if (pr.draft) {
    rootLog.info({ pr: pr.number, repo: repo.full_name }, "draft pull request, not reviewing");
    return;
  }

  const job: ReviewJobData = {
    githubInstallationId: installationId,
    githubRepoId: repo.id,
    owner: account.login,
    repo: repo.name,
    prNumber: pr.number,
    headSha: pr.head.sha,
    trigger,
  };

  if (queueEnabled()) {
    const priority = installation.plan === "business" ? PRIORITY_BUSINESS : PRIORITY_STANDARD;
    const id = await enqueueReview(job, { priority });
    context.log.info({ jobId: id, pr: pr.number }, "review enqueued");
    return;
  }

  await runInline(context, job);
}

/**
 * Inline execution for the no-Redis deployment.
 *
 * Not awaited by the webhook response — GitHub gets its 200 immediately — but
 * errors are caught here, because an unhandled rejection in a detached promise
 * takes the whole process down in Node 22.
 */
export function runInline(context: Context<PullRequestContextName>, job: ReviewJobData): Promise<void> {
  const model = selectModel();
  return executeReviewJob(job, { gateway: gatewayFor(context.octokit), model })
    .then((outcome) => {
      context.log.info({ status: outcome.status, detail: outcome.detail }, "inline review finished");
    })
    .catch((err: unknown) => {
      context.log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "inline review failed",
      );
    });
}

/** Exposed for the dashboard's "review this PR again" action. */
export async function requeue(job: ReviewJobData): Promise<boolean> {
  const installation = await findInstallation(job.githubInstallationId);
  if (!installation) return false;
  if (!queueEnabled()) return false;
  await enqueueReview({ ...job, trigger: "manual" });
  return true;
}
