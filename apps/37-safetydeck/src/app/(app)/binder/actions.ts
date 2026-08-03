"use server";

/**
 * The binder export. One action, one button.
 *
 * Assembling can take a few seconds for a year of huddles, which is why the
 * button is a form with a pending state rather than something optimistic: the
 * artifact either exists or it does not.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { assembleBinder, defaultRange } from "@/lib/binder";
import { addDays, isIsoDate, todayIso } from "@/lib/dates";
import type { ActionState } from "@/lib/action-state";

export async function exportBinderAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    // Deliberately requireUser, not requireWriter: a cancelled account must
    // still be able to produce its own records. That is the whole promise.
    const { company, user } = await requireUser();
    const today = todayIso(company.timezone);
    const preset = String(form.get("preset") ?? "12m");
    const fallback = defaultRange(company.timezone);

    let start = fallback.start;
    let end = fallback.end;
    if (preset === "ytd") {
      start = `${today.slice(0, 4)}-01-01`;
      end = today;
    } else if (preset === "custom") {
      const from = String(form.get("from") ?? "");
      const to = String(form.get("to") ?? "");
      if (!isIsoDate(from) || !isIsoDate(to)) {
        return { error: "Pick both dates for a custom range", message: null };
      }
      if (from > to) return { error: "The start date is after the end date", message: null };
      start = from;
      end = to;
    } else if (preset === "3m") {
      start = addDays(today, -90);
      end = today;
    }

    const result = await assembleBinder(company.id, start, end, user.email);
    revalidatePath("/binder");
    return {
      error: null,
      message: `${result.pageCount} pages: ${result.manifest.signatures} signatures, ${result.manifest.recordableIncidents} recordable cases, ${result.manifest.certs} certs. Ready to download.`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not assemble the binder",
      message: null,
    };
  }
}
