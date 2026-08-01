/**
 * Feedback events: a reply that dismisses a finding, and a resolved thread.
 *
 * A note on reactions, because the README promises them and this is the honest
 * shape of it: **GitHub does not deliver reaction webhooks to Apps.** A
 * thumbs-down on a review comment produces no event at all. The only way to see
 * one is to ask, so reactions are collected by the bounded sweep in
 * feedback/sweep.ts and the real-time path here is the reply command.
 */

import type { Context } from "probot";
import { dismissFinding, parseIgnoreCommand, recordPositiveFeedback } from "../feedback/dismiss";
import { gatewayFor } from "../review/run";

export async function onReviewCommentCreated(
  context: Context<"pull_request_review_comment.created">,
): Promise<void> {
  const comment = context.payload.comment;
  const actor = comment.user?.login ?? "unknown";

  // Our own comments must never trigger our own machinery.
  if (comment.user?.type === "Bot" && actor.startsWith("mergemate")) return;

  const parsed = parseIgnoreCommand(comment.body ?? "");
  if (!parsed.matched) return;

  // A dismissal is a reply to the finding's comment. `in_reply_to_id` is the
  // comment that started the thread, which is the one we posted.
  const target = comment.in_reply_to_id;
  if (!target) {
    context.log.info({ commentId: comment.id }, "ignore command was not a reply to a finding");
    return;
  }

  const result = await dismissFinding({
    gateway: gatewayFor(context.octokit),
    ref: { owner: context.payload.repository.owner.login, repo: context.payload.repository.name },
    commentId: target,
    actorLogin: actor,
    kind: "ignore_reply",
    reason: "reply",
    payload: { note: parsed.note, replyCommentId: comment.id },
  });

  context.log.info({ target, status: result.status, scope: result.scope }, "ignore command handled");
}

export async function onReviewThreadResolved(
  context: Context<"pull_request_review_thread.resolved">,
): Promise<void> {
  const comments = context.payload.thread.comments ?? [];
  const first = comments[0];
  if (!first) return;
  const actor = context.payload.sender?.login ?? "unknown";
  const recorded = await recordPositiveFeedback({
    commentId: first.id,
    actorLogin: actor,
    kind: "comment_resolved",
    payload: { threadNodeId: context.payload.thread.node_id },
  });
  if (recorded) context.log.info({ commentId: first.id }, "finding thread resolved");
}
