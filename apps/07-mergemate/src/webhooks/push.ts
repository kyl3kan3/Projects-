/**
 * `push` — the rulebook's only write path.
 *
 * A rulebook change is only honoured on the default branch: `.mergemate.yml` is
 * reviewed and merged like any other code, so a branch cannot quietly loosen the
 * standards its own pull request is judged against.
 *
 * The event is filtered hard before any API call, because a busy monorepo delivers
 * far more pushes than rulebook edits.
 */

import type { Context } from "probot";
import { applyRulebookChange } from "../review/run";
import { gatewayFor } from "../review/run";
import { findRepositoryByGithubId, upsertInstallation, upsertRepository } from "../db/store";
import type { AccountType } from "../db/schema";

export const RULEBOOK_PATH = ".mergemate.yml";

/** True when this push touched the rulebook on the default branch. */
export function pushTouchesRulebook(payload: {
  ref: string;
  repository: { default_branch: string };
  commits?: { added?: string[]; modified?: string[]; removed?: string[] }[];
}): boolean {
  if (payload.ref !== `refs/heads/${payload.repository.default_branch}`) return false;
  for (const commit of payload.commits ?? []) {
    const touched = [...(commit.added ?? []), ...(commit.modified ?? []), ...(commit.removed ?? [])];
    if (touched.includes(RULEBOOK_PATH)) return true;
  }
  return false;
}

export async function onPush(context: Context<"push">): Promise<void> {
  const payload = context.payload;
  if (!pushTouchesRulebook(payload)) return;

  const installationId = payload.installation?.id;
  if (!installationId) return;

  const repoPayload = payload.repository;
  let repository = await findRepositoryByGithubId(repoPayload.id);
  if (!repository) {
    const installation = await upsertInstallation({
      githubInstallationId: installationId,
      accountLogin: repoPayload.owner.login ?? repoPayload.owner.name ?? "unknown",
      accountType: (repoPayload.owner.type as AccountType) ?? "Organization",
    });
    repository = await upsertRepository({
      installationId: installation.id,
      githubRepoId: repoPayload.id,
      fullName: repoPayload.full_name,
      isPrivate: repoPayload.private,
      defaultBranch: repoPayload.default_branch,
    });
  }

  const result = await applyRulebookChange({
    gateway: gatewayFor(context.octokit),
    repository: {
      id: repository.id,
      fullName: repoPayload.full_name,
      defaultBranch: repoPayload.default_branch,
    },
    commitSha: payload.after,
  });

  context.log.info(
    { repo: repoPayload.full_name, version: result.version, valid: result.valid },
    result.valid ? "rulebook version activated" : "rulebook rejected, previous version stands",
  );
}
