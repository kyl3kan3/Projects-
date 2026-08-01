"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { divisions, seasons, type ScholarshipCode, type SeasonSettings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import {
  createSeason,
  deleteDivision,
  promoteFromWaitlist,
  setSeasonStatus,
  upsertDivision,
} from "@/lib/registration";
import { addDays, todayIso } from "@/lib/time";

function actorOf(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  return { kind: "user" as const, id: ctx.user.id, name: ctx.user.name };
}

async function ownSeason(clubId: string, seasonId: string) {
  const [season] = await getDb().select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season || season.clubId !== clubId) throw new Error("That season is not in your club");
  return season;
}

export async function createSeasonAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_season");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name the season, e.g. Fall 2026" };
  const opens = String(form.get("registrationOpensOn") ?? "") || todayIso();
  const closes = String(form.get("registrationClosesOn") ?? "") || addDays(opens, 30);
  const starts = String(form.get("startsOn") ?? "") || addDays(closes, 14);
  const ends = String(form.get("endsOn") ?? "") || addDays(starts, 70);
  if (closes < opens) return { error: "Registration cannot close before it opens" };
  if (ends < starts) return { error: "The season cannot end before it starts" };

  try {
    const season = await createSeason(ctx.club.id, {
      name,
      registrationOpensOn: opens,
      registrationClosesOn: closes,
      startsOn: starts,
      endsOn: ends,
    });
    await audit(ctx.club.id, actorOf(ctx), "season_created", `season:${season.id}`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the season" };
  }
  revalidatePath("/season");
  return { ok: "Season created. Add divisions, then open registration." };
}

export async function setSeasonStatusAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_season");
  const seasonId = String(form.get("seasonId") ?? "");
  const status = String(form.get("status") ?? "") as "draft" | "open" | "closed" | "archived";
  const season = await ownSeason(ctx.club.id, seasonId);

  if (status === "open") {
    const rows = await getDb()
      .select({ id: divisions.id })
      .from(divisions)
      .where(eq(divisions.seasonId, seasonId));
    if (rows.length === 0) {
      return { error: "Add at least one division before opening registration" };
    }
  }
  await setSeasonStatus(seasonId, status);
  await audit(ctx.club.id, actorOf(ctx), `season_${status}`, `season:${season.id}`);
  revalidatePath("/season");
  revalidatePath("/season/setup");
  return { ok: status === "open" ? "Registration is open. The link is live." : `Season ${status}.` };
}

export async function upsertDivisionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_season");
  const seasonId = String(form.get("seasonId") ?? "");
  await ownSeason(ctx.club.id, seasonId);

  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name the division, e.g. U10 Boys" };
  const capacity = Number(form.get("capacity") ?? 0);
  if (!Number.isInteger(capacity) || capacity < 1) return { error: "Capacity must be a whole number of places" };
  const fee = parseMoney(String(form.get("fee") ?? ""));
  if (fee === null) return { error: "Enter the fee as a plain amount, e.g. 185 or 185.00" };

  const earlyBirdEnds = String(form.get("earlyBirdEnds") ?? "").trim();
  const earlyBirdAmount = parseMoney(String(form.get("earlyBirdAmount") ?? "0")) ?? 0;
  const birthFrom = Number(form.get("birthYearFrom") ?? 0) || null;
  const birthTo = Number(form.get("birthYearTo") ?? 0) || null;

  try {
    await upsertDivision(seasonId, {
      id: String(form.get("divisionId") ?? "") || undefined,
      name,
      capacity,
      feeCents: fee,
      birthYearFrom: birthFrom,
      birthYearTo: birthTo,
      earlyBird:
        earlyBirdAmount > 0
          ? { endsOn: earlyBirdEnds || null, percentBps: 0, flatCents: earlyBirdAmount }
          : null,
      waitlistEnabled: form.get("waitlistEnabled") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the division" };
  }
  revalidatePath("/season/setup");
  revalidatePath("/season");
  return { ok: `${name} saved.` };
}

export async function deleteDivisionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_season");
  const seasonId = String(form.get("seasonId") ?? "");
  await ownSeason(ctx.club.id, seasonId);
  try {
    await deleteDivision(seasonId, String(form.get("divisionId") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the division" };
  }
  revalidatePath("/season/setup");
  return { ok: "Division removed." };
}

export async function saveSeasonSettingsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireCapability("manage_season");
  const seasonId = String(form.get("seasonId") ?? "");
  const season = await ownSeason(ctx.club.id, seasonId);

  const siblingPercent = Number(form.get("siblingPercent") ?? 0);
  if (!Number.isFinite(siblingPercent) || siblingPercent < 0 || siblingPercent > 100) {
    return { error: "The sibling discount is a percentage between 0 and 100" };
  }
  const deposit = parseMoney(String(form.get("depositCents") ?? "0")) ?? 0;
  const installmentCount = Number(form.get("installmentCount") ?? 3);
  const waiverText = String(form.get("waiverText") ?? "").trim();
  if (!waiverText) return { error: "The waiver text cannot be empty — parents acknowledge it" };

  // Codes come in as "CODE|Label|percent" lines, which is what a volunteer can
  // actually maintain without a code-builder UI.
  const codes: ScholarshipCode[] = String(form.get("codes") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, label, percent] = line.split("|").map((p) => p.trim());
      const pct = Number(percent ?? "100");
      return {
        code: (code ?? "").toUpperCase(),
        label: label || `Scholarship ${code}`,
        percentBps: Math.round(Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 100)) * 100),
        flatCents: 0,
        maxUses: 0,
        uses: (season.settings.scholarshipCodes ?? []).find(
          (c) => c.code.toUpperCase() === (code ?? "").toUpperCase(),
        )?.uses ?? 0,
      };
    })
    .filter((c) => c.code.length > 0);

  const settings: SeasonSettings = {
    ...season.settings,
    siblingDiscountBps: Math.round(siblingPercent * 100),
    siblingDiscountFlatCents: 0,
    scholarshipCodes: codes,
    waiverText,
    absorbPlatformFee: form.get("absorbPlatformFee") === "on",
    installmentsEnabled: form.get("installmentsEnabled") === "on",
    depositCents: deposit,
    installmentCount: Number.isInteger(installmentCount) && installmentCount > 0 ? installmentCount : 3,
  };

  await getDb().update(seasons).set({ settings }).where(eq(seasons.id, seasonId));
  await audit(ctx.club.id, actorOf(ctx), "season_settings_saved", `season:${seasonId}`);
  revalidatePath("/season/setup");
  return { ok: "Saved." };
}

export async function promoteWaitlistAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_season");
  const divisionId = String(form.get("divisionId") ?? "");
  const result = await promoteFromWaitlist(divisionId, actorOf(ctx));
  revalidatePath("/season");
  revalidatePath("/registrations");
  if (result.promoted.length === 0) {
    return { error: "No free places in that division yet, so nobody was promoted" };
  }
  return {
    ok: `Promoted ${result.promoted.map((p) => p.playerName).join(", ")}. Send them the payment link from Registrations.`,
  };
}
