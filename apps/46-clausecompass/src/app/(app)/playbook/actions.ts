"use server";

/**
 * Playbook actions. Both are Studio-only, enforced here rather than by hiding the buttons —
 * a `"use server"` export is a public endpoint, and plan gating that lives in the UI is not
 * plan gating.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { forkPlaybookForAccount, updateRule } from "@/lib/playbook-store";
import { canEditPlaybook } from "@/lib/plans";
import type { Severity } from "@/db/schema";

export async function createHouseRulesAction(): Promise<{ error: string | null }> {
  const { user, account } = await requireUser();
  if (!canEditPlaybook(account.plan)) {
    return { error: "Custom playbooks are part of Studio. The default playbook still applies." };
  }
  await forkPlaybookForAccount(account.id, `${user.name} <${user.email}>`);
  revalidatePath("/playbook");
  return { error: null };
}

export async function updateRuleAction(
  ruleId: string,
  edit: { threshold?: number | null; enabled?: boolean; severityOnFail?: Severity },
): Promise<{ error: string | null }> {
  const { user, account } = await requireUser();
  if (!canEditPlaybook(account.plan)) {
    return { error: "Custom playbooks are part of Studio." };
  }
  try {
    await updateRule(account.id, ruleId, edit, `${user.name} <${user.email}>`);
  } catch (err) {
    console.error("[playbook] rule edit rejected", err);
    return { error: "That rule could not be changed." };
  }
  revalidatePath("/playbook");
  return { error: null };
}
