"use server";

/**
 * The connect endpoints: add an account, verify the assume-role round trip,
 * point us at a CUR bucket, remove an account. Four, all reachable from the
 * connect screen, all re-resolving the org from the session.
 */

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import {
  createAccount,
  getAccount,
  removeAccount,
  updateCurConfig,
  updateRoleArn,
  verifyAndBackfill,
} from "@/lib/accounts";

/**
 * React 19 resets an uncontrolled form once its action completes, so a rejected
 * submit is echoed back with the values that were typed — otherwise the person
 * retypes a 12-digit account id to find out the label was the problem.
 */
export interface ConnectState {
  error?: string;
  notice?: string;
  values?: { accountId?: string; label?: string; curBucket?: string; curPrefix?: string };
}

export async function addAccountAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { org } = await requireOrg();
  const accountId = String(formData.get("accountId") ?? "");
  const label = String(formData.get("label") ?? "");
  try {
    await createAccount(org, {
      accountId,
      label,
      roleArn: String(formData.get("roleArn") ?? "") || undefined,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not add that account",
      values: { accountId, label },
    };
  }
  revalidatePath("/connect");
  return { notice: "Account added. Create the stack, then confirm below." };
}

export async function verifyAccountAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { org } = await requireOrg();
  const id = String(formData.get("accountId") ?? "");
  const account = await getAccount(org.id, id);
  if (!account) return { error: "That account is no longer here" };

  // The stack's output ARN can be pasted here if it differs from the default
  // (a customer who renamed the role, or re-created the stack).
  const roleArn = String(formData.get("roleArn") ?? "").trim();
  if (roleArn && roleArn !== account.roleArn) {
    try {
      await updateRoleArn(account, roleArn);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "That role ARN was rejected" };
    }
  }

  const fresh = (await getAccount(org.id, id)) ?? account;
  const outcome = await verifyAndBackfill(fresh);
  revalidatePath("/connect");
  revalidatePath("/watch");
  if (!outcome.ok) return { error: outcome.error ?? "AWS refused the role" };
  return {
    notice:
      outcome.provider === "demo"
        ? `Connected with demo data — ${outcome.factsIngested} synthetic cost rows backfilled. No AWS credential is configured on this deployment.`
        : `Connected. ${outcome.factsIngested} cost rows backfilled from the last three months.`,
  };
}

export async function saveCurAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { org } = await requireOrg();
  const id = String(formData.get("accountId") ?? "");
  const account = await getAccount(org.id, id);
  if (!account) return { error: "That account is no longer here" };
  const curBucket = String(formData.get("curBucket") ?? "");
  const curPrefix = String(formData.get("curPrefix") ?? "");
  try {
    await updateCurConfig(account, { curBucket, curPrefix });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save the report location",
      values: { curBucket, curPrefix },
    };
  }
  revalidatePath("/connect");
  return { notice: "Report location saved. The next ingestion cycle will use it." };
}

export async function removeAccountAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { org } = await requireOrg();
  const id = String(formData.get("accountId") ?? "");
  await removeAccount(org.id, id);
  revalidatePath("/connect");
  revalidatePath("/watch");
  return { notice: "Account disconnected and its cost history removed." };
}
