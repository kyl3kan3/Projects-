"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orgs } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { normaliseOffsets } from "@/lib/ladder";
import { runTickForOrg } from "@/lib/tick";

export interface SettingsState {
  error: string | null;
  ok: string | null;
}

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { user, org } = await requireUser();
  try {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("Your company needs a name — vendors' certificates have to name it.");
    const holderName = String(formData.get("holderName") ?? "").trim() || name;
    const timezone = String(formData.get("timezone") ?? "").trim() || org.timezone;
    const tone = String(formData.get("tone") ?? "plain") === "firm" ? "firm" : "plain";
    const offsets = normaliseOffsets(
      String(formData.get("chaseOffsets") ?? "")
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n)),
    );

    // A bad time zone would silently shift what "today" means for every verdict.
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    } catch {
      throw new Error(`"${timezone}" is not a time zone CertShield recognises.`);
    }

    const db = getDb();
    await db
      .update(orgs)
      .set({
        name,
        timezone,
        settings: { ...org.settings, holderName, tone, chaseOffsets: offsets },
        updatedAt: new Date(),
      })
      .where(eq(orgs.id, org.id));

    await appendAudit({
      orgId: org.id,
      actor: `${user.name} <${user.email}>`,
      action: "template.updated",
      target: "organisation settings",
      metadata: { name, holderName, timezone, tone, chaseOffsets: offsets },
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { error: null, ok: "Saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save settings.", ok: null };
  }
}

/** Rotate the work-order hook key. Admin-only: it is a bearer credential. */
export async function rotateHookKeyAction(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  void _formData;
  try {
    const { user, org } = await requireAdmin();
    const hookKey = `hk_${randomBytes(16).toString("hex")}`;
    const db = getDb();
    await db
      .update(orgs)
      .set({ settings: { ...org.settings, hookKey }, updatedAt: new Date() })
      .where(eq(orgs.id, org.id));
    await appendAudit({
      orgId: org.id,
      actor: `${user.name} <${user.email}>`,
      action: "hook.key_rotated",
      target: "compliance hook",
      metadata: {},
    });
    revalidatePath("/settings");
    return { error: null, ok: "New key issued. The previous one stopped working immediately." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rotate the key.", ok: null };
  }
}

/**
 * Run the nightly pass now. Exposed because a coordinator who has just fixed a
 * template wants to see the chase go out rather than wait for a cron — and because
 * a schedule you cannot trigger by hand is a schedule you cannot debug.
 */
export async function runTickNowAction(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  void _formData;
  try {
    const { org } = await requireAdmin();
    const result = await runTickForOrg(org);
    revalidatePath("/dashboard");
    revalidatePath("/review");
    return {
      error: null,
      ok: `Ran now: ${result.parsed} parsed, ${result.verdictsWritten} verdict change${
        result.verdictsWritten === 1 ? "" : "s"
      } recorded, ${result.chasesSent} chase${result.chasesSent === 1 ? "" : "s"} sent${
        result.chasesFailed ? `, ${result.chasesFailed} failed` : ""
      }.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not run the pass.", ok: null };
  }
}
