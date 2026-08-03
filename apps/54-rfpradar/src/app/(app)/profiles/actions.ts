"use server";

/**
 * Keyword-profile actions. A profile edit rescores the profile immediately —
 * a firm that changes its NAICS codes and sees the same radar has learned that
 * the product does not react, and it will not come back tomorrow.
 */

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { keywordProfiles } from "@/db/schema";
import { audit, requireWrite } from "@/lib/auth";
import { checkProfile } from "@/lib/plans";
import { runRescoreProfile } from "@/lib/jobs";

export interface ProfileFormState {
  error: string | null;
  notice: string | null;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Comma- or newline-separated input -> a clean, de-duplicated array. */
function list(formData: FormData, name: string, upper = false): string[] {
  const raw = text(formData, name);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const value = upper ? part.trim().toUpperCase() : part.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value.slice(0, 120));
  }
  return out.slice(0, 60);
}

/** Dollars in the form, integer cents in the column. */
function cents(formData: FormData, name: string): number | null {
  const raw = text(formData, name).replace(/[$,\s]/g, "");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export async function saveProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const { firm, user, access } = await requireWrite();
  const db = getDb();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) return { error: "Give the profile a name — “Managed IT — VA/MD” is the idea.", notice: null };

  const minCents = cents(formData, "minValue");
  const maxCents = cents(formData, "maxValue");
  if (minCents !== null && maxCents !== null && minCents > maxCents) {
    return { error: "The minimum contract value is above the maximum.", notice: null };
  }
  const valueBand =
    minCents === null && maxCents === null
      ? null
      : {
          ...(minCents !== null ? { minCents } : {}),
          ...(maxCents !== null ? { maxCents } : {}),
        };

  const values = {
    name: name.slice(0, 160),
    naicsCodes: list(formData, "naicsCodes", true),
    pscCodes: list(formData, "pscCodes", true),
    keywords: list(formData, "keywords"),
    negativeKeywords: list(formData, "negativeKeywords"),
    states: list(formData, "states", true),
    agencies: list(formData, "agencies"),
    valueBand,
    status: (text(formData, "status") === "paused" ? "paused" : "active") as "active" | "paused",
  };

  if (
    values.keywords.length === 0 &&
    values.naicsCodes.length === 0 &&
    values.pscCodes.length === 0 &&
    values.agencies.length === 0
  ) {
    return {
      error:
        "A profile needs at least one keyword, NAICS code, PSC code, or agency — otherwise there is nothing to match on.",
      notice: null,
    };
  }

  let profileId = id;
  if (id) {
    const [existing] = await db
      .select()
      .from(keywordProfiles)
      .where(and(eq(keywordProfiles.id, id), eq(keywordProfiles.firmId, firm.id)));
    if (!existing) return { error: "That profile does not belong to this firm.", notice: null };
    await db
      .update(keywordProfiles)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(keywordProfiles.id, id));
  } else {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(keywordProfiles)
      .where(eq(keywordProfiles.firmId, firm.id));
    const gate = checkProfile(access.planId, count);
    if (!gate.allowed) return { error: gate.message, notice: null };

    const [created] = await db
      .insert(keywordProfiles)
      .values({ firmId: firm.id, ...values })
      .returning();
    profileId = created.id;
  }

  await audit({
    firmId: firm.id,
    actor: user.id,
    action: id ? "profile.updated" : "profile.created",
    target: profileId,
    metadata: { name: values.name, keywords: values.keywords.length },
  });

  // Rescore now, so the radar reflects the edit on the next paint rather than
  // tomorrow morning.
  const summary = await runRescoreProfile(profileId);
  revalidatePath("/profiles");
  revalidatePath("/radar");

  return {
    error: null,
    notice:
      summary.scored === 0
        ? "Saved. Nothing in the register matches it yet — the next poll may change that."
        : `Saved and rescored: ${summary.surfaced} match${summary.surfaced === 1 ? "" : "es"} above your threshold, ${summary.suppressed} suppressed, from ${summary.scored} candidate notice${summary.scored === 1 ? "" : "s"}.`,
  };
}

export async function toggleProfileAction(formData: FormData): Promise<void> {
  const { firm, user } = await requireWrite();
  const db = getDb();
  const id = String(formData.get("id") ?? "");
  const [existing] = await db
    .select()
    .from(keywordProfiles)
    .where(and(eq(keywordProfiles.id, id), eq(keywordProfiles.firmId, firm.id)));
  if (!existing) throw new Error("That profile does not belong to this firm.");

  const status = existing.status === "active" ? "paused" : "active";
  await db
    .update(keywordProfiles)
    .set({ status, updatedAt: new Date() })
    .where(eq(keywordProfiles.id, id));
  await audit({
    firmId: firm.id,
    actor: user.id,
    action: `profile.${status}`,
    target: id,
    metadata: {},
  });
  if (status === "active") await runRescoreProfile(id);
  revalidatePath("/profiles");
  revalidatePath("/radar");
}
