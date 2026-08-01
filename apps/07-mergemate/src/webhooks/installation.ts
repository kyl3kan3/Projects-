/**
 * Installation lifecycle: the app being installed, suspended, or removed, and
 * repositories being added to or removed from an existing installation.
 *
 * This is the "org and repo selection" half of the install flow — GitHub owns the
 * selection UI, and these events are how the selection reaches us. Removal is a
 * soft delete: findings, suppressions and noise history survive a reinstall,
 * because a team that reinstalls has not changed its mind about the nits it
 * dismissed.
 */

import type { Context } from "probot";
import {
  markInstallationDeleted,
  removeRepositories,
  setInstallationSuspended,
  upsertInstallation,
  upsertRepository,
} from "../db/store";
import type { AccountType } from "../db/schema";

type InstallationEvent =
  | "installation.created"
  | "installation.deleted"
  | "installation.suspend"
  | "installation.unsuspend"
  | "installation.new_permissions_accepted";

export async function onInstallation(context: Context<InstallationEvent>): Promise<void> {
  const payload = context.payload;
  const installationId = payload.installation.id;
  const account = payload.installation.account;
  const login = accountLogin(account);

  switch (payload.action) {
    case "deleted":
      await markInstallationDeleted(installationId);
      context.log.info({ installationId }, "installation removed");
      return;
    case "suspend":
      await setInstallationSuspended(installationId, true);
      return;
    case "unsuspend":
      await setInstallationSuspended(installationId, false);
      return;
    default:
      break;
  }

  const installation = await upsertInstallation({
    githubInstallationId: installationId,
    accountLogin: login,
    accountType: accountType(account),
    suspended: false,
  });

  const repositories = payload.repositories ?? [];
  for (const repo of repositories) {
    await upsertRepository({
      installationId: installation.id,
      githubRepoId: repo.id,
      fullName: repo.full_name,
      isPrivate: repo.private,
      // The install event carries no default branch; the first review corrects it.
      defaultBranch: "main",
    });
  }
  context.log.info(
    { installationId, account: login, repos: repositories.length },
    "installation registered",
  );
}

export async function onInstallationRepositories(
  context: Context<"installation_repositories">,
): Promise<void> {
  const payload = context.payload;
  const installation = await upsertInstallation({
    githubInstallationId: payload.installation.id,
    accountLogin: accountLogin(payload.installation.account),
    accountType: accountType(payload.installation.account),
  });

  for (const repo of payload.repositories_added ?? []) {
    await upsertRepository({
      installationId: installation.id,
      githubRepoId: repo.id,
      fullName: repo.full_name,
      isPrivate: repo.private,
      defaultBranch: "main",
    });
  }

  const removed = (payload.repositories_removed ?? []).map((r) => r.id);
  await removeRepositories(removed);

  context.log.info(
    {
      installationId: payload.installation.id,
      added: payload.repositories_added?.length ?? 0,
      removed: removed.length,
    },
    "installation repositories changed",
  );
}

/** An installation account is a user or an organisation; both carry a login. */
function accountLogin(account: unknown): string {
  const a = account as { login?: string; slug?: string } | null;
  return a?.login ?? a?.slug ?? "unknown";
}

function accountType(account: unknown): AccountType {
  const a = account as { type?: string } | null;
  return a?.type === "User" ? "User" : "Organization";
}
