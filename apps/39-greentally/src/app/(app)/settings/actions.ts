"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, sites } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isRedirectError, safeMessage, ValidationError } from "@/lib/errors";
import { canAddSite } from "@/lib/plans";
import { gridRegionsFor } from "@/db/factors";
import { parseAmountToCents } from "@/lib/spend";
import { enqueueRecompute } from "@/lib/jobs";

export interface SettingsState {
  error?: string;
  notice?: string;
}

export async function saveProfile(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  try {
    const { org, period } = await requireOnboarded();
    const db = getDb();
    const revenueCents = parseAmountToCents(String(form.get("revenue") ?? "0")) ?? 0;
    const fteCount = Number(String(form.get("fteCount") ?? "0").replace(/[^0-9]/g, ""));

    await db
      .update(organizations)
      .set({
        annualRevenueCents: revenueCents,
        fteCount: Number.isFinite(fteCount) ? fteCount : 0,
        settings: {
          ...org.settings,
          contactName: String(form.get("contactName") ?? "").trim(),
          contactEmail: String(form.get("contactEmail") ?? "").trim(),
          reportWordmark: String(form.get("reportWordmark") ?? "").trim().slice(0, 80),
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));

    // Intensity metrics are derived from revenue and headcount, so a change to either
    // has to reach the snapshot.
    await enqueueRecompute(org.id, period.id);
    revalidatePath("/settings");
    revalidatePath("/footprint");
    return { notice: "Saved." };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not save that.") };
  }
}

export async function addSite(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  try {
    const { user, org, period } = await requireOnboarded();
    const db = getDb();
    const existing = await db.select({ id: sites.id }).from(sites).where(eq(sites.organizationId, org.id));
    const gate = canAddSite(org.plan, existing.length);
    if (!gate.allowed) throw new ValidationError(gate.reason);

    const name = String(form.get("name") ?? "").trim();
    const country = String(form.get("country") ?? "US");
    const gridRegion = String(form.get("gridRegion") ?? "");
    if (!name) throw new ValidationError("Give the site a name.");
    if (!gridRegionsFor(country).some((r) => r.code === gridRegion)) {
      throw new ValidationError("Choose a grid region for this site.");
    }
    const marketMethod =
      String(form.get("marketMethod") ?? "residual_mix") === "renewable_contract"
        ? ("renewable_contract" as const)
        : ("residual_mix" as const);
    const renewableSharePct = Math.max(
      0,
      Math.min(100, Number(String(form.get("renewableSharePct") ?? "0").replace(/[^0-9]/g, ""))),
    );

    await db.insert(sites).values({
      organizationId: org.id,
      name,
      address: String(form.get("address") ?? "").trim(),
      country,
      gridRegion,
      floorAreaSqm: Number(String(form.get("floorAreaSqm") ?? "0").replace(/[^0-9]/g, "")) || 0,
      marketMethod,
      renewableSharePct: marketMethod === "renewable_contract" ? renewableSharePct : 0,
      contractNote:
        marketMethod === "renewable_contract" ? String(form.get("contractNote") ?? "").trim() : "",
    });

    await audit({
      organizationId: org.id,
      actor: user.id,
      actorLabel: user.name,
      action: "site.created",
      target: name,
      metadata: { country, gridRegion },
    });

    await enqueueRecompute(org.id, period.id);
    revalidatePath("/settings");
    revalidatePath("/footprint");
    return { notice: `${name} added.` };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not add that site.") };
  }
}

export async function updateSite(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  try {
    const { user, org, period } = await requireOnboarded();
    const db = getDb();
    const siteId = String(form.get("siteId") ?? "");
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    if (!site || site.organizationId !== org.id) throw new ValidationError("Unknown site.");

    const country = String(form.get("country") ?? site.country);
    const gridRegion = String(form.get("gridRegion") ?? site.gridRegion);
    if (!gridRegionsFor(country).some((r) => r.code === gridRegion)) {
      throw new ValidationError("Choose a grid region for this site.");
    }
    const marketMethod =
      String(form.get("marketMethod") ?? "residual_mix") === "renewable_contract"
        ? ("renewable_contract" as const)
        : ("residual_mix" as const);
    const renewableSharePct = Math.max(
      0,
      Math.min(100, Number(String(form.get("renewableSharePct") ?? "0").replace(/[^0-9]/g, ""))),
    );

    await db
      .update(sites)
      .set({
        name: String(form.get("name") ?? site.name).trim() || site.name,
        address: String(form.get("address") ?? "").trim(),
        country,
        gridRegion,
        floorAreaSqm: Number(String(form.get("floorAreaSqm") ?? "0").replace(/[^0-9]/g, "")) || 0,
        marketMethod,
        renewableSharePct: marketMethod === "renewable_contract" ? renewableSharePct : 0,
        contractNote:
          marketMethod === "renewable_contract" ? String(form.get("contractNote") ?? "").trim() : "",
      })
      .where(eq(sites.id, site.id));

    await audit({
      organizationId: org.id,
      actor: user.id,
      actorLabel: user.name,
      action: "site.updated",
      target: site.name,
      metadata: { country, gridRegion, marketMethod, renewableSharePct },
    });

    // The grid region selects the factor, so changing it changes the footprint.
    await enqueueRecompute(org.id, period.id);
    revalidatePath("/settings");
    revalidatePath("/footprint");
    return { notice: `${site.name} updated — the footprint is recomputing.` };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not update that site.") };
  }
}
