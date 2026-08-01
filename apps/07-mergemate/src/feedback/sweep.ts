/**
 * The reaction sweep: `npm run sweep`.
 *
 * GitHub sends no webhook when someone reacts to a review comment, so the
 * thumbs-up/thumbs-down half of the feedback loop has to be polled. This is the
 * portfolio's cron-shaped background job, adapted to a webhook-driven service:
 *
 *  - it is invoked, does a bounded amount of work, and exits — safe on a cron, a
 *    scheduler, or a `while sleep` loop on a small host;
 *  - the work is bounded twice, by a wall-clock budget and by a comment ceiling,
 *    so it always finishes well inside a function timeout;
 *  - the window is a fixed distance from each comment's creation (7 days), not an
 *    open-ended "unreacted" state. A state that stays true forever is how a sweep
 *    ends up doing the same work every day for eternity;
 *  - every write is idempotent — `feedback_events` is unique on
 *    (finding, actor, kind) — so re-sweeping the same window changes nothing.
 *
 * Requires SWEEP_SECRET when exposed over HTTP (see server.ts), and refuses to run
 * over HTTP when the secret is unset.
 */

import "../lib/load-env";
import { Probot } from "probot";
import { commentsForReactionSweep, recordFeedback } from "../db/store";
import { dismissFinding } from "./dismiss";
import { gatewayFor } from "../review/run";
import { suppressionScopeFor } from "../lib/plans";
import { closeDb } from "../db";
import { log as rootLog } from "../lib/logger";

/** Reactions older than this are never re-examined. */
export const SWEEP_WINDOW_DAYS = 7;
const DEFAULT_BUDGET_MS = 25_000;
const DEFAULT_MAX_COMMENTS = 200;

export interface SweepResult {
  examined: number;
  thumbsUp: number;
  thumbsDown: number;
  suppressed: number;
  skippedBudget: boolean;
}

export interface SweepOptions {
  /** Authenticates as the installation that owns each comment. */
  authFor: (githubInstallationId: number) => Promise<unknown>;
  now?: Date;
  budgetMs?: number;
  maxComments?: number;
}

export async function runSweep(options: SweepOptions): Promise<SweepResult> {
  const startedAt = Date.now();
  const budget = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - SWEEP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const comments = await commentsForReactionSweep({
    since,
    limit: options.maxComments ?? DEFAULT_MAX_COMMENTS,
  });

  const result: SweepResult = {
    examined: 0,
    thumbsUp: 0,
    thumbsDown: 0,
    suppressed: 0,
    skippedBudget: false,
  };

  for (const comment of comments) {
    if (Date.now() - startedAt > budget) {
      result.skippedBudget = true;
      break;
    }

    const [owner, repo] = comment.repoFullName.split("/");
    if (!owner || !repo) continue;
    const ref = { owner, repo };

    let gateway;
    try {
      gateway = gatewayFor(await options.authFor(comment.githubInstallationId));
    } catch (err) {
      rootLog.warn(
        { installation: comment.githubInstallationId, err: err instanceof Error ? err.message : String(err) },
        "could not authenticate installation for sweep",
      );
      continue;
    }

    let reactions;
    try {
      reactions = await gateway.listReviewCommentReactions(ref, comment.commentId);
    } catch (err) {
      rootLog.warn(
        { commentId: comment.commentId, err: err instanceof Error ? err.message : String(err) },
        "could not read reactions",
      );
      continue;
    }
    result.examined += 1;

    for (const reaction of reactions) {
      if (reaction.content === "+1" || reaction.content === "heart" || reaction.content === "rocket") {
        const stored = await recordFeedback({
          findingId: comment.findingId,
          actorLogin: reaction.userLogin,
          kind: "thumbs_up",
        });
        if (stored) result.thumbsUp += 1;
        continue;
      }
      if (reaction.content !== "-1") continue;

      const dismissal = await dismissFinding({
        gateway,
        ref,
        commentId: comment.commentId,
        actorLogin: reaction.userLogin,
        kind: "thumbs_down",
        reason: "reaction",
        payload: { via: "reaction sweep" },
      });
      result.thumbsDown += 1;
      if (dismissal.status === "suppressed") {
        result.suppressed += 1;
        rootLog.info(
          {
            repo: comment.repoFullName,
            fingerprint: comment.fingerprint,
            scope: suppressionScopeFor(comment.plan, comment.settings.orgWideSuppressions),
          },
          "reaction suppressed a fingerprint",
        );
      }
    }
  }

  return result;
}

async function main() {
  const probot = new Probot({
    appId: process.env.APP_ID,
    privateKey: process.env.PRIVATE_KEY,
    secret: process.env.WEBHOOK_SECRET,
  });

  const result = await runSweep({ authFor: (id) => probot.auth(id) });
  rootLog.info({ ...result }, "reaction sweep finished");
  await closeDb();
}

/** Only run as a script when invoked directly, not when imported by the server. */
if (require.main === module) {
  main().catch((err: unknown) => {
    rootLog.error({ err: err instanceof Error ? err.message : String(err) }, "sweep failed");
    process.exit(1);
  });
}
