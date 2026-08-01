/**
 * Dismissal: how a thumbs-down or an "ignore" reply becomes permanent silence.
 *
 * One function for both entry points (the reply webhook and the reaction sweep), so
 * the rule is stated once: record the raw signal, suppress the fingerprint at the
 * scope the plan allows, and edit the comment so the person who dismissed it can
 * see that it took. Nothing here re-reads the model or re-scores anything — a
 * dismissal is an instruction, not evidence to weigh.
 */

import type { GitHubGateway, RepoRef } from "../github/client";
import { renderDismissalAcknowledgement } from "../github/comments";
import {
  addSuppression,
  findFindingByCommentId,
  installationPlanAndSettings,
  recordFeedback,
} from "../db/store";
import { suppressionScopeFor } from "../lib/plans";
import type { FeedbackKind, SuppressionReason } from "../db/schema";
import { log as rootLog } from "../lib/logger";

/**
 * Recognise the dismissal command in a reply body.
 *
 * Accepts an optional bot mention, "mergemate ignore", and any trailing reason
 * text (kept in the feedback payload, never acted on). Deliberately strict about
 * the start of the body: a comment that merely mentions the phrase in prose — "I
 * don't think mergemate ignore is the right call here" — is not a command.
 */
export function parseIgnoreCommand(body: string): { matched: boolean; note: string } {
  const firstLine = body.replace(/\r/g, "").trim().split("\n")[0] ?? "";
  const m = /^(?:@[\w-]+\s+)?mergemate\s+ignore\b[:,\s]*(.*)$/i.exec(firstLine);
  if (!m) return { matched: false, note: "" };
  return { matched: true, note: (m[1] ?? "").trim().slice(0, 200) };
}

export interface DismissInput {
  gateway: GitHubGateway;
  ref: RepoRef;
  /** The inline review comment being dismissed. */
  commentId: number;
  actorLogin: string;
  kind: Extract<FeedbackKind, "thumbs_down" | "ignore_reply">;
  reason: SuppressionReason;
  payload?: Record<string, unknown>;
}

export interface DismissResult {
  status: "suppressed" | "already_recorded" | "unknown_comment";
  fingerprint?: string;
  scope?: "repository" | "installation";
}

export async function dismissFinding(input: DismissInput): Promise<DismissResult> {
  const log = rootLog.child({ commentId: input.commentId, actor: input.actorLogin });

  const found = await findFindingByCommentId(input.commentId);
  if (!found) {
    // Not one of our comments, or a comment from before this database. Never guess
    // which finding a reply meant.
    return { status: "unknown_comment" };
  }

  const firstTime = await recordFeedback({
    findingId: found.finding.id,
    actorLogin: input.actorLogin,
    kind: input.kind,
    payload: input.payload ?? {},
  });

  const account = await installationPlanAndSettings(found.installationId);
  const scope = suppressionScopeFor(account?.plan ?? "free", account?.settings.orgWideSuppressions);

  await addSuppression({
    scope,
    installationId: found.installationId,
    repositoryId: found.repositoryId,
    fingerprint: found.finding.fingerprint,
    reason: input.reason,
    createdByLogin: input.actorLogin,
  });

  if (firstTime) await acknowledge(input, log);

  log.info({ fingerprint: found.finding.fingerprint, scope, firstTime }, "finding dismissed");
  return {
    status: firstTime ? "suppressed" : "already_recorded",
    fingerprint: found.finding.fingerprint,
    scope,
  };
}

/** Append the acknowledgement to the live comment body, once. */
async function acknowledge(input: DismissInput, log: ReturnType<typeof rootLog.child>): Promise<void> {
  try {
    const comment = await input.gateway.getReviewComment(input.ref, input.commentId);
    if (!comment) return;
    const next = renderDismissalAcknowledgement(comment.body);
    if (next === comment.body) return;
    await input.gateway.updateReviewComment(input.ref, input.commentId, next);
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "could not acknowledge the dismissal on the comment",
    );
  }
}

/** Positive feedback: recorded as tuning signal, changes nothing about posting. */
export async function recordPositiveFeedback(input: {
  commentId: number;
  actorLogin: string;
  kind: Extract<FeedbackKind, "thumbs_up" | "patch_applied" | "comment_resolved">;
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  const found = await findFindingByCommentId(input.commentId);
  if (!found) return false;
  return recordFeedback({
    findingId: found.finding.id,
    actorLogin: input.actorLogin,
    kind: input.kind,
    payload: input.payload ?? {},
  });
}
