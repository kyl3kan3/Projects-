"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { teams } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import {
  assignPlayer,
  assignTeamStaff,
  createTeam,
  deleteTeam,
  lockRoster,
  moveSpot,
  removePlayer,
  removeTeamStaff,
  setJerseyNumber,
  type RosterViolation,
} from "@/lib/rosters";

function actorOf(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  return { kind: "user" as const, id: ctx.user.id, name: ctx.user.name };
}

async function ownTeam(clubId: string, teamId: string) {
  const [team] = await getDb().select().from(teams).where(eq(teams.id, teamId));
  if (!team || team.clubId !== clubId) throw new Error("That team is not in your club");
  return team;
}

function violationMessage(violations: RosterViolation[]): string {
  return violations.map((v) => v.message).join(" ");
}

export async function createTeamAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const divisionId = String(form.get("divisionId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name the team" };
  const capacity = Number(form.get("capacity") ?? 14);
  try {
    await createTeam(ctx.club.id, divisionId, name, Number.isInteger(capacity) && capacity > 0 ? capacity : 14);
  } catch {
    return { error: `There is already a team called ${name} in that division` };
  }
  revalidatePath("/rosters");
  return { ok: `${name} added.` };
}

export async function deleteTeamAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  await ownTeam(ctx.club.id, teamId);
  await deleteTeam(teamId);
  revalidatePath("/rosters");
  return { ok: "Team removed." };
}

export async function assignPlayerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  await ownTeam(ctx.club.id, teamId);
  const violations = await assignPlayer(teamId, String(form.get("playerId") ?? ""), actorOf(ctx));
  revalidatePath("/rosters");
  return violations.length > 0 ? { error: violationMessage(violations) } : { ok: "Placed." };
}

export async function removePlayerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  await ownTeam(ctx.club.id, teamId);
  const violations = await removePlayer(teamId, String(form.get("playerId") ?? ""), actorOf(ctx));
  revalidatePath("/rosters");
  return violations.length > 0 ? { error: violationMessage(violations) } : { ok: "Removed." };
}

export async function setJerseyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  await ownTeam(ctx.club.id, teamId);
  const violations = await setJerseyNumber(
    teamId,
    String(form.get("playerId") ?? ""),
    String(form.get("jersey") ?? ""),
    actorOf(ctx),
  );
  revalidatePath("/rosters");
  return violations.length > 0 ? { error: violationMessage(violations) } : { ok: "Saved." };
}

/**
 * Up/down reorder. Present on every row alongside the drag handle, because a
 * gesture must never be the only way to do something (DESIGN.md motion rules).
 */
export async function moveSpotAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  await ownTeam(ctx.club.id, teamId);
  await moveSpot(
    teamId,
    String(form.get("playerId") ?? ""),
    String(form.get("direction") ?? "up") === "down" ? "down" : "up",
  );
  revalidatePath("/rosters");
  return {};
}

export async function lockRosterAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  const team = await ownTeam(ctx.club.id, teamId);
  const locking = !team.rosterLockedAt;
  if (!locking) {
    // Unlocking is an admin act: a locked roster is what a coach printed.
    await requireCapability("manage_club");
  }
  await lockRoster(teamId, locking, actorOf(ctx));
  revalidatePath("/rosters");
  return { ok: locking ? "Roster locked." : "Roster unlocked — edits are allowed again." };
}

export async function assignCoachAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  await ownTeam(ctx.club.id, teamId);
  const userId = String(form.get("userId") ?? "");
  if (!userId) return { error: "Pick a coach" };
  const role = String(form.get("role") ?? "coach") === "manager" ? "manager" : "coach";
  await assignTeamStaff(teamId, userId, role);
  revalidatePath("/rosters");
  revalidatePath("/schedule");
  return { ok: "Assigned. Coach clashes will now show on the schedule." };
}

export async function removeCoachAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_rosters");
  const teamId = String(form.get("teamId") ?? "");
  await ownTeam(ctx.club.id, teamId);
  await removeTeamStaff(teamId, String(form.get("userId") ?? ""));
  revalidatePath("/rosters");
  return { ok: "Removed from the team." };
}
