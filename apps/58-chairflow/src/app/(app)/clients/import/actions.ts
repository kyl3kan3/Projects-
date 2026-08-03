"use server";

import { revalidatePath } from "next/cache";
import { requireStylist } from "@/lib/auth";
import { field, intInRange } from "@/lib/forms";
import { featureAllowed, type Billable } from "@/lib/plans";
import type { ImportSummary } from "@/lib/csv";
import { importClients } from "@/server/clients";

export interface ImportState {
  error: string | null;
  summary: ImportSummary | null;
  values: { csv: string; seedServiceId: string; assumedInterval: string };
}

/**
 * Import a client list.
 *
 * The pasted CSV comes back on failure like any other field — a rejected interval must not
 * cost somebody the 300 lines they pasted.
 */
export async function importAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { user, stylist } = await requireStylist();
  const values = {
    csv: String(formData.get("csv") ?? ""),
    seedServiceId: field(formData, "seedServiceId"),
    assumedInterval: field(formData, "assumedInterval"),
  };

  const gate = featureAllowed(stylist as Billable, "csv_import");
  if (!gate.ok) return { error: gate.reason, summary: null, values };

  if (!values.csv.trim()) {
    return { error: "Paste the rows from your export, including the header line.", summary: null, values };
  }
  const interval = intInRange(values.assumedInterval, 1, 365);
  if (interval === null) {
    return {
      error: "The assumed gap between visits has to be a number of days between 1 and 365.",
      summary: null,
      values,
    };
  }

  const summary = await importClients({
    stylistId: stylist.id,
    userId: user.id,
    csv: values.csv,
    seedServiceId: values.seedServiceId || null,
    assumedIntervalDays: interval,
  });

  revalidatePath("/clients");
  return { error: null, summary, values: { ...values, csv: "" } };
}
