"use server";

/**
 * Settings and billing actions.
 *
 * Four exports: save the forecast settings, send a digest now (so a merchant can see
 * what arrives before committing to it), change plan, and sign out.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shops, type DigestKind } from "@/db/schema";
import { clearSession, requireShop } from "@/lib/auth";
import { createSubscription } from "@/lib/billing";
import { sendDigest } from "@/lib/digests";
import { safeMessage } from "@/lib/errors";
import { resolveSettings } from "@/lib/settings";
import type { Plan } from "@/db/schema";

/**
 * Only async functions may be exported from a `"use server"` module, so the initial
 * value for `useActionState` lives with the form rather than here.
 */
export interface SettingsState {
  error: string | null;
  note: string | null;
}

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { shop } = await requireShop();
  try {
    // Everything is clamped by resolveSettings, so a hand-posted value cannot
    // reclassify a whole catalogue as dead stock.
    const settings = resolveSettings({
      safetyDays: Number(formData.get("safetyDays")),
      defaultLeadTimeDays: Number(formData.get("defaultLeadTimeDays")),
      coverTargetDays: Number(formData.get("coverTargetDays")),
      overstockCoverDays: Number(formData.get("overstockCoverDays")),
      deadCoverDays: Number(formData.get("deadCoverDays")),
      orderSoonDays: Number(formData.get("orderSoonDays")),
      riskHorizonDays: Number(formData.get("riskHorizonDays")),
      digestWeekday: Number(formData.get("digestWeekday")),
      weeklyDigestEnabled: formData.get("weeklyDigestEnabled") === "on",
      monthlyDeadStockEnabled: formData.get("monthlyDeadStockEnabled") === "on",
    });

    await getDb()
      .update(shops)
      .set({ settings, updatedAt: new Date() })
      .where(eq(shops.id, shop.id));

    revalidatePath("/settings");
    revalidatePath("/reorder");
    return {
      error: null,
      note: "Saved. The next run uses these — hit RE-SYNC on the reorder screen to apply them now.",
    };
  } catch (err) {
    return { error: safeMessage(err, "Those settings could not be saved."), note: null };
  }
}

/**
 * Send a digest immediately.
 *
 * `force` skips the "is it due today" gate but *not* the once-per-period claim, so
 * pressing it twice does not send twice — which is the whole point of the period key.
 */
export async function sendDigestNowAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { shop } = await requireShop();
  const kind = String(formData.get("kind") ?? "") as DigestKind;
  if (kind !== "weekly_reorder" && kind !== "monthly_dead_stock") {
    return { error: "Unknown digest.", note: null };
  }
  try {
    const outcome = await sendDigest(shop, kind, { force: true });
    revalidatePath("/settings");
    if (outcome.sent) {
      return {
        error: null,
        note: outcome.suppressed
          ? `Prepared for ${outcome.recipient} — outbound email is off on this deployment, so it was recorded rather than sent (period ${outcome.periodKey}).`
          : `Sent to ${outcome.recipient} (period ${outcome.periodKey}).`,
      };
    }
    return { error: null, note: `Not sent: ${outcome.skippedReason}.` };
  } catch (err) {
    return { error: safeMessage(err, "That digest could not be sent."), note: null };
  }
}

/** Start a plan change through Shopify Billing. */
export async function changePlanAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { shop } = await requireShop();
  const plan = String(formData.get("plan") ?? "") as Plan;
  if (!["counter", "backroom", "warehouse"].includes(plan)) {
    return { error: "Unknown plan.", note: null };
  }

  let confirmationUrl: string | null = null;
  try {
    const result = await createSubscription(shop, plan);
    confirmationUrl = result.confirmationUrl;
  } catch (err) {
    return { error: safeMessage(err, "Shopify Billing could not be reached."), note: null };
  }

  if (!confirmationUrl) {
    return {
      error:
        "Shopify Billing returned no approval URL. The charge has not been created — try again from the Shopify admin.",
      note: null,
    };
  }
  redirect(confirmationUrl);
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
