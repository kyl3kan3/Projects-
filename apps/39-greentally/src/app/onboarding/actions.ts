"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, reportingPeriods, sites } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isRedirectError, safeMessage, ValidationError } from "@/lib/errors";
import { gridRegionsFor } from "@/db/factors";
import { parseAmountToCents } from "@/lib/spend";
import { canAddSite } from "@/lib/plans";
import type { Framework } from "@/db/schema";

export interface OnboardingState {
  error?: string;
}

const FRAMEWORKS: Framework[] = ["cdp_style", "ecovadis_style", "custom"];

export async function completeOnboarding(
  _prev: OnboardingState,
  form: FormData,
): Promise<OnboardingState> {
  try {
    const { user, org } = await requireUser();
    const db = getDb();

    const industryCode = String(form.get("industryCode") ?? "").trim();
    const industryLabel = String(form.get("industryLabel") ?? "").trim();
    const fteCount = Number(String(form.get("fteCount") ?? "0").replace(/[^0-9]/g, ""));
    const revenueCents = parseAmountToCents(String(form.get("revenue") ?? "0")) ?? 0;
    const year = Number(String(form.get("year") ?? ""));

    const siteName = String(form.get("siteName") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const country = String(form.get("country") ?? "US").trim();
    const gridRegion = String(form.get("gridRegion") ?? "").trim();
    const floorAreaSqm = Number(String(form.get("floorAreaSqm") ?? "0").replace(/[^0-9]/g, ""));
    const marketMethod =
      String(form.get("marketMethod") ?? "residual_mix") === "renewable_contract"
        ? ("renewable_contract" as const)
        : ("residual_mix" as const);
    const renewableSharePct = Math.max(
      0,
      Math.min(100, Number(String(form.get("renewableSharePct") ?? "0").replace(/[^0-9]/g, ""))),
    );
    const contractNote = String(form.get("contractNote") ?? "").trim();

    const frameworks = FRAMEWORKS.filter((f) => form.get(`framework_${f}`) === "on");

    if (!siteName) throw new ValidationError("Give the site a name your team will recognise.");
    if (!Number.isFinite(year) || year < 2015 || year > new Date().getUTCFullYear()) {
      throw new ValidationError("Choose a reporting year that has finished.");
    }
    const validRegions = new Set(gridRegionsFor(country).map((r) => r.code));
    if (!validRegions.has(gridRegion)) {
      throw new ValidationError("Choose the grid region this site draws electricity from.");
    }
    if (marketMethod === "renewable_contract" && renewableSharePct === 0) {
      throw new ValidationError(
        "A renewable contract needs a covered share above 0% — or choose the grid-average method.",
      );
    }
    if (frameworks.length === 0) {
      throw new ValidationError("Choose at least one questionnaire so the answer bank knows what to fill in.");
    }

    const existingSites = await db.select({ id: sites.id }).from(sites).where(eq(sites.organizationId, org.id));
    const gate = canAddSite(org.plan, existingSites.length);
    if (existingSites.length > 0 && !gate.allowed) throw new ValidationError(gate.reason);

    await db
      .update(organizations)
      .set({
        industryCode,
        industryLabel,
        fteCount: Number.isFinite(fteCount) ? fteCount : 0,
        annualRevenueCents: revenueCents,
        settings: { ...org.settings, frameworks: frameworks as never },
        onboardedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));

    // The period row exists from signup; move it to the year they chose.
    const periods = await db
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.organizationId, org.id));
    const target = periods.find((p) => p.year === year);
    if (!target) {
      if (periods.length === 1 && !periods[0].lockedAt) {
        await db
          .update(reportingPeriods)
          .set({ year })
          .where(eq(reportingPeriods.id, periods[0].id));
      } else {
        await db.insert(reportingPeriods).values({ organizationId: org.id, year });
      }
    }

    if (existingSites.length === 0) {
      await db.insert(sites).values({
        organizationId: org.id,
        name: siteName,
        address,
        country,
        gridRegion,
        floorAreaSqm: Number.isFinite(floorAreaSqm) ? floorAreaSqm : 0,
        marketMethod,
        renewableSharePct: marketMethod === "renewable_contract" ? renewableSharePct : 0,
        contractNote: marketMethod === "renewable_contract" ? contractNote : "",
      });
      await audit({
        organizationId: org.id,
        actor: user.id,
        actorLabel: user.name,
        action: "site.created",
        target: siteName,
        metadata: { country, gridRegion, floorAreaSqm },
      });
    }

    await audit({
      organizationId: org.id,
      actor: user.id,
      actorLabel: user.name,
      action: "onboarding.completed",
      target: org.name,
      metadata: { year: String(year), frameworks, industryCode },
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not save that. Check the fields and try again.") };
  }
  redirect("/documents");
}
