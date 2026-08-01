"use server";

/**
 * Actions on the reorder screen: re-sync, and snooze a SKU.
 *
 * Two exports, both wired to a control on screen. Every exported `"use server"`
 * function is a public endpoint, so an unused one is attack surface rather than
 * dead code.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { variants } from "@/db/schema";
import { requireShop } from "@/lib/auth";
import { resolveAlert } from "@/lib/forecast-run";
import { safeMessage } from "@/lib/errors";
import { recomputeShop } from "@/lib/forecast-run";
import { runBackfill } from "@/lib/backfill";
import { applyDemoSupplierAssignments } from "@/lib/install";

export interface ActionState {
  error: string | null;
  note: string | null;
}

/**
 * Pull-to-refresh and the header control both land here: catch up on any unfinished
 * import, then recompute today's forecast.
 *
 * `runDate` is left to the shop's own timezone, which means a merchant hitting this
 * at 09:00 replaces today's run rather than creating a second one — the forecast row
 * is keyed on (variant, run date), so a re-sync is an update, not a duplicate.
 */
export async function resyncAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const { shop } = await requireShop();
  try {
    if (!shop.backfillCompletedAt) {
      const progress = await runBackfill(shop, { deadline: Date.now() + 60_000 });
      if (progress.done && shop.isDemo) await applyDemoSupplierAssignments(shop);
      if (!progress.done) {
        revalidatePath("/reorder");
        return {
          error: null,
          note: `Imported ${progress.ordersImported.toLocaleString("en-US")} orders so far.`,
        };
      }
    }
    const result = await recomputeShop(shop, { deadline: Date.now() + 60_000 });
    revalidatePath("/reorder");
    revalidatePath("/dead-stock");
    return {
      error: null,
      note: `${result.variantsForecast} SKUs recomputed · ${result.byStatus.order_now} to order now`,
    };
  } catch (err) {
    return { error: safeMessage(err, "The re-sync did not complete."), note: null };
  }
}

/**
 * Snooze a SKU for a number of days.
 *
 * Snoozing resolves its open alerts as well as hiding it from PO suggestions: a
 * snoozed SKU that kept an alert open would re-notify the moment the snooze lapsed
 * even though nothing had changed.
 */
export async function snoozeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shop } = await requireShop();
  const variantId = String(formData.get("variantId") ?? "");
  const days = Math.max(1, Math.min(180, Number(formData.get("days") ?? 14)));

  try {
    const db = getDb();
    const until = new Date(Date.now() + days * 86_400_000);
    const updated = await db
      .update(variants)
      .set({ snoozedUntil: until })
      .where(and(eq(variants.id, variantId), eq(variants.shopId, shop.id)))
      .returning({ id: variants.id });
    if (!updated.length) return { error: "That SKU is not in this store.", note: null };

    await resolveAlert(variantId, "stockout_risk");
    await resolveAlert(variantId, "dead_stock");

    revalidatePath("/reorder");
    revalidatePath(`/reorder/${variantId}`);
    revalidatePath("/dead-stock");
    return { error: null, note: `Snoozed for ${days} days.` };
  } catch (err) {
    return { error: safeMessage(err, "That SKU could not be snoozed."), note: null };
  }
}
