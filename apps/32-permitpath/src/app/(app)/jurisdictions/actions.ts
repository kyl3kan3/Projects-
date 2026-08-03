"use server";

/**
 * Jurisdiction actions: watching (metered by plan) and suggesting an edit.
 *
 * Both are called from screens in this folder, and both re-resolve the session:
 * a jurisdiction id in a form field says nothing about who is asking.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { submitContribution } from "@/lib/contributions";
import { safeMessage } from "@/lib/errors";
import { isWatched, unwatchJurisdiction, watchJurisdiction } from "@/lib/jurisdictions";

export interface WatchState {
  error: string | null;
}

export async function toggleWatchAction(_prev: WatchState, formData: FormData): Promise<WatchState> {
  const { user, org } = await requireUser();
  const jurisdictionId = String(formData.get("jurisdictionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  try {
    if (await isWatched(org.id, jurisdictionId)) {
      await unwatchJurisdiction({ organizationId: org.id, jurisdictionId });
    } else {
      await watchJurisdiction({
        organizationId: org.id,
        jurisdictionId,
        plan: org.plan,
        actorUserId: user.id,
      });
    }
  } catch (err) {
    return { error: safeMessage(err, "That jurisdiction could not be updated.") };
  }
  revalidatePath("/jurisdictions");
  if (slug) revalidatePath(`/jurisdictions/${slug}`);
  revalidatePath("/alerts");
  return { error: null };
}

export interface SuggestState {
  error: string | null;
  ok: string | null;
}

/**
 * Suggest an edit. The payload is assembled into the structured shape
 * `proposedChangesSchema` accepts — free text alone is a complaint, not a
 * correction, so evidence is required and the fee arrives as integer cents.
 */
export async function suggestEditAction(
  _prev: SuggestState,
  formData: FormData,
): Promise<SuggestState> {
  const { user, org } = await requireUser();
  const recordId = String(formData.get("recordId") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const changes: Record<string, unknown> = {};
  const feeLabel = String(formData.get("feeLabel") ?? "").trim();
  const feeDollars = String(formData.get("feeDollars") ?? "").trim();
  if (feeLabel && feeDollars) {
    const parsed = Number(feeDollars);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "Enter the fee as dollars, e.g. 96.50", ok: null };
    }
    // One rounding, at the edge: dollars in, integer cents stored.
    changes.fees = [{ label: feeLabel, amountCents: Math.round(parsed * 100) }];
  }

  const timeline = String(formData.get("reviewTimeline") ?? "").trim();
  if (timeline) changes.reviewTimeline = timeline;

  const quirks = String(formData.get("quirks") ?? "").trim();
  if (quirks) changes.quirks = quirks;

  const inspectionContact = String(formData.get("inspectionContact") ?? "").trim();
  if (inspectionContact) changes.inspectionContact = inspectionContact;

  const leadTime = String(formData.get("inspectionLeadTimeDays") ?? "").trim();
  if (leadTime) {
    const parsed = Number(leadTime);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Lead time is a whole number of days", ok: null };
    }
    changes.inspectionLeadTimeDays = parsed;
  }

  try {
    await submitContribution({
      userId: user.id,
      organizationId: org.id,
      recordId,
      proposedChanges: changes,
      evidence: String(formData.get("evidence") ?? ""),
    });
  } catch (err) {
    return { error: safeMessage(err, "That suggestion could not be sent."), ok: null };
  }

  if (slug) revalidatePath(`/jurisdictions/${slug}`);
  return {
    error: null,
    ok: "Sent to moderation. Accepted edits earn $10 of account credit and a fresh verification stamp.",
  };
}
