"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { games, seasons, teams } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import { sendAnnouncement } from "@/lib/comms";
import {
  cancelGame,
  commitCsvImport,
  createGame,
  createVenue,
  deleteVenue,
  overrideConflict,
  previewCsvImport,
  publishSchedule,
  updateGame,
} from "@/lib/schedule";
import { createStandardSlots } from "@/lib/volunteers";
import { formatWhen } from "@/lib/time";

function actorOf(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  return { kind: "user" as const, id: ctx.user.id, name: ctx.user.name };
}

async function ownSeason(clubId: string, seasonId: string) {
  const [season] = await getDb().select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season || season.clubId !== clubId) throw new Error("That season is not in your club");
  return season;
}

async function ownGame(clubId: string, gameId: string) {
  const [game] = await getDb().select().from(games).where(eq(games.id, gameId));
  if (!game || game.clubId !== clubId) throw new Error("That game is not in your club");
  return game;
}

export async function createVenueAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name the venue" };
  const fields = String(form.get("fields") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  await createVenue(ctx.club.id, name, fields, String(form.get("address") ?? "") || null);
  revalidatePath("/schedule");
  return { ok: `${name} added with ${fields.length || 1} field${fields.length === 1 ? "" : "s"}.` };
}

export async function deleteVenueAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  try {
    await deleteVenue(ctx.club.id, String(form.get("venueId") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the venue" };
  }
  revalidatePath("/schedule");
  return { ok: "Venue removed." };
}

export async function createGameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const seasonId = String(form.get("seasonId") ?? "");
  await ownSeason(ctx.club.id, seasonId);

  const homeTeamId = String(form.get("homeTeamId") ?? "");
  if (!homeTeamId) return { error: "Pick the home team" };
  const [home] = await getDb().select().from(teams).where(eq(teams.id, homeTeamId));
  if (!home || home.clubId !== ctx.club.id) return { error: "That team is not in your club" };

  const awayRaw = String(form.get("awayTeamId") ?? "");
  const kind = String(form.get("kind") ?? "game") as "game" | "practice" | "event";
  const duration = Number(form.get("durationMinutes") ?? 90);

  try {
    const game = await createGame(
      ctx.club.id,
      {
        seasonId,
        divisionId: home.divisionId,
        homeTeamId,
        awayTeamId: kind === "game" && awayRaw ? awayRaw : null,
        venueId: String(form.get("venueId") ?? ""),
        field: String(form.get("field") ?? "").trim() || "Field 1",
        kind,
        localDate: String(form.get("localDate") ?? ""),
        localTime: String(form.get("localTime") ?? ""),
        durationMinutes: Number.isFinite(duration) ? duration : 90,
        note: String(form.get("note") ?? "") || null,
      },
      actorOf(ctx),
    );
    if (form.get("addVolunteerSlots") === "on") {
      await createStandardSlots(ctx.club.id, seasonId, game.id, game.startsAt);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that game" };
  }
  revalidatePath("/schedule");
  revalidatePath("/volunteers");
  revalidatePath("/season");
  return { ok: "Added. The checker has re-run." };
}

export async function updateGameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const gameId = String(form.get("gameId") ?? "");
  await ownGame(ctx.club.id, gameId);
  const duration = Number(form.get("durationMinutes") ?? 90);
  try {
    const result = await updateGame(
      gameId,
      {
        venueId: String(form.get("venueId") ?? "") || undefined,
        field: String(form.get("field") ?? "") || undefined,
        localDate: String(form.get("localDate") ?? "") || undefined,
        localTime: String(form.get("localTime") ?? "") || undefined,
        durationMinutes: Number.isFinite(duration) ? duration : undefined,
      },
      actorOf(ctx),
    );
    revalidatePath("/schedule");
    revalidatePath("/season");
    return {
      ok: result.wasPublished
        ? "Moved. Reminders for the old time are cancelled and fresh ones queued — tell the affected teams from Comms."
        : "Moved. The checker has re-run.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not move that game" };
  }
}

export async function cancelGameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const gameId = String(form.get("gameId") ?? "");
  await ownGame(ctx.club.id, gameId);
  await cancelGame(gameId, actorOf(ctx));
  revalidatePath("/schedule");
  return { ok: "Cancelled. Queued reminders for it are cancelled too." };
}

export async function overrideConflictAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const conflictId = String(form.get("conflictId") ?? "");
  try {
    await overrideConflict(conflictId, actorOf(ctx), ctx.club.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not accept that conflict" };
  }
  revalidatePath("/schedule");
  return { ok: "Accepted — recorded against your name in the audit log." };
}

/**
 * Publish, then fan out. In that order: the announcement is only allowed to exist
 * once the gate has passed and the games are actually published.
 */
export async function publishScheduleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const seasonId = String(form.get("seasonId") ?? "");
  const season = await ownSeason(ctx.club.id, seasonId);

  const result = await publishSchedule(seasonId, actorOf(ctx), ctx.club.id);
  if (result.blocked) {
    const hard = result.blocked.hard.length;
    const soft = result.blocked.needsOverride.length;
    return {
      error:
        hard > 0
          ? `Publish blocked: ${hard} hard conflict${hard === 1 ? "" : "s"}. Two teams cannot share a field — move one of the games.`
          : `Publish held: ${soft} soft conflict${soft === 1 ? "" : "s"} need your explicit acceptance first.`,
    };
  }
  if (result.published === 0) {
    return { ok: "Everything was already published. Nothing new went out." };
  }

  revalidatePath("/schedule");
  revalidatePath("/season");

  if (form.get("announce") === "on" && result.teamIds.length > 0) {
    try {
      const summary = await sendAnnouncement({
        clubId: ctx.club.id,
        seasonId,
        audience: { kind: "team", teamIds: result.teamIds },
        subject: `${season.name} schedule is up`,
        body: [
          `The ${season.name} schedule is published.`,
          "Open your family page for your children's games, the venue and field, and a calendar link you can subscribe to once.",
          "Game-day reminders go out 24 hours before by email, and 3 hours before by text if you have opted in.",
        ].join("\n\n"),
        channels: ["email"],
        purpose: "schedule",
        actor: actorOf(ctx),
        smsBudget: ctx.settings.smsMonthlyBudget,
      });
      revalidatePath("/comms");
      return {
        ok: `Published ${result.published} game${result.published === 1 ? "" : "s"} and emailed ${summary.emailsSent} famil${summary.emailsSent === 1 ? "y" : "ies"}${summary.simulated ? " (simulated — DRY_RUN is on)" : ""}.`,
      };
    } catch (err) {
      return {
        ok: `Published ${result.published} game${result.published === 1 ? "" : "s"}. The announcement did not go out: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      };
    }
  }

  return { ok: `Published ${result.published} game${result.published === 1 ? "" : "s"}. All clear.` };
}

export async function importCsvAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const seasonId = String(form.get("seasonId") ?? "");
  await ownSeason(ctx.club.id, seasonId);
  const csv = String(form.get("csv") ?? "");
  if (!csv.trim()) return { error: "Paste the CSV, header row included" };

  const preview = await previewCsvImport(ctx.club.id, seasonId, csv);
  if (form.get("commit") !== "on") {
    const errors = preview.errors.map((e) => `line ${e.line}: ${e.message}`).join(" · ");
    return {
      ok: `${preview.ok.length} row${preview.ok.length === 1 ? "" : "s"} look right${
        preview.errors.length > 0 ? `; ${preview.errors.length} would be skipped — ${errors}` : ""
      }. Tick "commit" to add them.`,
      error: preview.errors.length > 0 && preview.ok.length === 0 ? errors : undefined,
    };
  }
  if (preview.ok.length === 0) {
    return { error: "Nothing importable in that file — fix the rows above first" };
  }
  const created = await commitCsvImport(ctx.club.id, seasonId, preview.ok, actorOf(ctx));
  revalidatePath("/schedule");
  return {
    ok: `Imported ${created} game${created === 1 ? "" : "s"} as drafts. The checker has run — look at the gate before publishing.`,
  };
}

/** Attach the standard volunteer roles to an existing game. */
export async function addSlotsToGameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_schedule");
  const gameId = String(form.get("gameId") ?? "");
  const game = await ownGame(ctx.club.id, gameId);
  const n = await createStandardSlots(ctx.club.id, game.seasonId, gameId, game.startsAt);
  revalidatePath("/volunteers");
  return {
    ok: `Added ${n} volunteer slots for ${formatWhen(game.startsAt, ctx.club.timezone)}.`,
  };
}
