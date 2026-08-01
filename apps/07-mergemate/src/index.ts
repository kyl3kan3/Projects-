/**
 * The Probot application: which webhooks MergeMate listens to, plus the dashboard
 * and the sweep trigger mounted on the same express app.
 *
 * Probot handles App auth (JWT → installation token), signature verification and
 * event routing. Each handler is thin — persist, decide, hand off — because
 * GitHub's delivery timeout is 10 seconds and the work takes minutes.
 *
 * Events, and why each one is needed:
 *   pull_request                              the review trigger
 *   push                                      rulebook versioning on the default branch
 *   installation, installation_repositories    which orgs and repos we cover
 *   pull_request_review_comment                "mergemate ignore" dismissals
 *   pull_request_review_thread                 resolved threads, as tuning signal
 *   marketplace_purchase                       plan and seat sync
 */

import type { ApplicationFunctionOptions, Probot } from "probot";
import { onPullRequest } from "./webhooks/pull-request";
import { onPush } from "./webhooks/push";
import { onInstallation, onInstallationRepositories } from "./webhooks/installation";
import { onReviewCommentCreated, onReviewThreadResolved } from "./webhooks/feedback";
import { onMarketplacePurchase } from "./webhooks/marketplace";
import { mountDashboard, type HttpRouter } from "./dashboard/router";
import { runSweep } from "./feedback/sweep";
import { log } from "./lib/logger";

export default function app(probot: Probot, options: ApplicationFunctionOptions = {}): void {
  probot.on(["pull_request.opened", "pull_request.synchronize", "pull_request.reopened"], onPullRequest);
  probot.on("push", onPush);
  probot.on(
    [
      "installation.created",
      "installation.deleted",
      "installation.suspend",
      "installation.unsuspend",
      "installation.new_permissions_accepted",
    ],
    onInstallation,
  );
  probot.on("installation_repositories", onInstallationRepositories);
  probot.on("pull_request_review_comment.created", onReviewCommentCreated);
  probot.on("pull_request_review_thread.resolved", onReviewThreadResolved);
  probot.on("marketplace_purchase", onMarketplacePurchase);

  probot.onError(async (error) => {
    log.error({ err: error.message }, "probot error");
  });

  const getRouter = options.getRouter;
  if (!getRouter) return;
  const router = getRouter("/") as unknown as HttpRouter;

  mountDashboard(router);

  /**
   * Reaction sweep trigger.
   *
   * Refuses to run when SWEEP_SECRET is unset rather than defaulting to open: the
   * sweep spends GitHub API quota for every recent comment, which makes it the
   * most expensive endpoint in the app.
   */
  router.post("/internal/sweep", async (req, res) => {
    const secret = process.env.SWEEP_SECRET ?? "";
    const provided = String(req.headers["authorization"] ?? "");
    if (secret === "" || provided !== `Bearer ${secret}`) {
      res.statusCode = secret === "" ? 503 : 401;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          error: secret === "" ? "SWEEP_SECRET is not set; the sweep endpoint is disabled" : "unauthorized",
        }),
      );
      return;
    }
    try {
      const result = await runSweep({ authFor: (id) => probot.auth(id) });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(result));
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, "sweep endpoint failed");
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "sweep failed" }));
    }
  });
}
