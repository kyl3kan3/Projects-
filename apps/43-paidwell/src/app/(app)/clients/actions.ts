"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";

export interface ClientState {
  error?: string;
  notice?: string;
}

/**
 * Per-client escalation overrides: VIP exclusion, term override, and the contact
 * addresses follow-up actually goes to.
 */
export async function saveClientAction(
  _prev: ClientState,
  formData: FormData,
): Promise<ClientState> {
  const { firm, user } = await requireFirm();
  const clientId = String(formData.get("clientId") ?? "");
  const vip = formData.get("vip") === "on";
  const termsRaw = String(formData.get("termsDaysOverride") ?? "").trim();
  const emailsRaw = String(formData.get("emails") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  let termsDaysOverride: number | null = null;
  if (termsRaw) {
    const parsed = Number(termsRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365) {
      return { error: "Terms must be a whole number of days between 0 and 365." };
    }
    termsDaysOverride = Math.round(parsed);
  }

  const emails = emailsRaw
    .split(/[,\n;]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const bad = emails.find((value) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
  if (bad) return { error: `"${bad}" does not look like an email address.` };

  const db = getDb();
  const [updated] = await db
    .update(clients)
    .set({ vip, termsDaysOverride, emails, notes: notes || null })
    .where(and(eq(clients.firmId, firm.id), eq(clients.id, clientId)))
    .returning();
  if (!updated) return { error: "That client no longer exists." };

  await audit(firm.id, user.id, "settings_updated", `client ${updated.name}`, {
    vip,
    termsDaysOverride,
    recipients: emails.length,
  });
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/aging");
  return {
    notice: vip
      ? "Saved. This client is excluded from automatic follow-up — their invoices surface for a person instead."
      : "Saved.",
  };
}
