"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { firms, type SendMode } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { firmSettings } from "@/lib/settings";
import { runSweep } from "@/lib/sweep";
import { parseAmountToCents } from "@/lib/money";

export interface SettingsState {
  error?: string;
  notice?: string;
}

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/aging");
  revalidatePath("/approvals");
  revalidatePath("/sequences");
}

/**
 * The two controls that decide whether this product can embarrass a firm:
 * the send mode, and the kill switch. Both are one tap, and both are audited.
 */
export async function setSendModeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { firm, user } = await requireFirm();
  const mode = String(formData.get("sendMode") ?? "") as SendMode;
  if (mode !== "approval" && mode !== "autopilot") return { error: "Pick a mode." };

  const db = getDb();
  await db.update(firms).set({ sendMode: mode, updatedAt: new Date() }).where(eq(firms.id, firm.id));
  await audit(firm.id, user.id, "settings_updated", `send mode → ${mode}`);
  revalidate();
  return {
    notice:
      mode === "approval"
        ? "Approval mode. Every follow-up waits for your tap."
        : "Autopilot. Steps send themselves — you can stop everything from this screen at any time.",
  };
}

export async function toggleFollowUpAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { firm, user } = await requireFirm();
  const paused = formData.get("paused") === "1";
  const db = getDb();
  await db
    .update(firms)
    .set({ followUpPaused: paused, updatedAt: new Date() })
    .where(eq(firms.id, firm.id));
  await audit(firm.id, user.id, paused ? "follow_up_paused" : "follow_up_resumed", firm.name);
  revalidate();
  return {
    notice: paused
      ? "Stopped. Nothing will be sent to any client on any invoice until you switch it back on."
      : "Follow-up is running again, from each invoice's next pinned step.",
  };
}

export async function saveFirmSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { firm, user } = await requireFirm();
  const current = firmSettings(firm);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Your firm needs a name — it is the letterhead on every email." };

  const replyTo = String(formData.get("replyToEmail") ?? "").trim();
  if (replyTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo)) {
    return { error: "That reply-to address does not look like an email." };
  }

  const senderDomain = String(formData.get("senderDomain") ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (senderDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(senderDomain)) {
    return { error: "That does not look like a domain (try billing.yourfirm.com)." };
  }

  const termsRaw = Number(formData.get("defaultTermsDays") ?? current.defaultTermsDays);
  if (!Number.isFinite(termsRaw) || termsRaw < 0 || termsRaw > 365) {
    return { error: "Default terms must be between 0 and 365 days." };
  }

  const floor = parseAmountToCents(String(formData.get("partialFloor") ?? ""));
  if (floor === null || floor < 0) {
    return { error: "The part-payment floor must be an amount, like 50.00." };
  }

  const lateFeeMention = formData.get("lateFeeMention") === "on";
  const lateFeeCopy = String(formData.get("lateFeeCopy") ?? "").trim() || current.lateFeeCopy;
  const signature = String(formData.get("signature") ?? "").trim();

  const db = getDb();
  await db
    .update(firms)
    .set({
      name,
      replyToEmail: replyTo || null,
      senderDomain: senderDomain || null,
      // Verification is a DNS fact, not a checkbox: changing the domain always
      // resets it, and sends fall back to our address until it is verified.
      senderVerified: senderDomain === firm.senderDomain ? firm.senderVerified : false,
      settings: {
        ...current,
        defaultTermsDays: Math.round(termsRaw),
        partialFloorCents: floor,
        lateFeeMention,
        lateFeeCopy,
        signature,
      },
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firm.id));

  await audit(firm.id, user.id, "settings_updated", name, { lateFeeMention, senderDomain });
  revalidate();
  return { notice: "Saved." };
}

/** Run the sweep on demand, so a firm never has to wait for tomorrow's cron. */
export async function runSweepNowAction(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  const { firm } = await requireFirm();
  const result = await runSweep({ firmId: firm.id });
  const summary = result.firms[0];
  revalidate();
  if (!summary) return { error: "Nothing to sweep." };
  const parts: string[] = [];
  if (summary.queuedForApproval) parts.push(`${summary.queuedForApproval} queued for approval`);
  if (summary.sent) parts.push(`${summary.sent} sent`);
  if (summary.sendFailures) parts.push(`${summary.sendFailures} failed to send`);
  if (summary.promisesBroken) parts.push(`${summary.promisesBroken} promise(s) broken`);
  if (summary.promisesKept) parts.push(`${summary.promisesKept} promise(s) kept`);
  if (summary.writtenBack) parts.push(`${summary.writtenBack} payment(s) written back`);
  return {
    notice: parts.length
      ? `${parts.join(" · ")}.`
      : "Nothing was due. Every step is pinned to a date, so most days there is nothing to do.",
  };
}
