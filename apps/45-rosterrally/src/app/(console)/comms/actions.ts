"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { announcements } from "@/db/schema";
import type { AudienceSpec, DeliveryChannel } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import { resendToUnreached, sendAnnouncement } from "@/lib/comms";
import { getCurrentSeason } from "@/lib/registration";
import { myTeamIds } from "@/lib/rosters";

function actorOf(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  return { kind: "user" as const, id: ctx.user.id, name: ctx.user.name };
}

function parseAudience(form: FormData): AudienceSpec {
  const kind = String(form.get("audienceKind") ?? "club");
  if (kind === "division") {
    return { kind: "division", divisionIds: form.getAll("divisionIds").map(String) };
  }
  if (kind === "team") {
    return { kind: "team", teamIds: form.getAll("teamIds").map(String) };
  }
  return { kind: "club" };
}

export async function sendAnnouncementAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("send_comms");
  const season = await getCurrentSeason(ctx.club.id);
  if (!season) return { error: "Open a season first — an audience is drawn from its registrations" };

  const audience = parseAudience(form);

  // A coach may only message their own teams. Enforced here, not in the picker.
  if (ctx.user.role === "coach" || ctx.user.role === "manager") {
    const mine = await myTeamIds(ctx.user.id);
    if (audience.kind !== "team" || audience.teamIds.some((id) => !mine.includes(id))) {
      return { error: "Coaches can only message their own teams" };
    }
  }

  const channels: DeliveryChannel[] = [];
  if (form.get("email") === "on") channels.push("email");
  if (form.get("sms") === "on") channels.push("sms");

  try {
    const summary = await sendAnnouncement({
      clubId: ctx.club.id,
      seasonId: season.id,
      audience,
      subject: String(form.get("subject") ?? ""),
      body: String(form.get("body") ?? ""),
      channels,
      actor: actorOf(ctx),
      smsBudget: ctx.settings.smsMonthlyBudget,
    });
    revalidatePath("/comms");
    revalidatePath("/season");
    const parts = [
      `${summary.emailsSent} email${summary.emailsSent === 1 ? "" : "s"}`,
      summary.smsSent > 0 ? `${summary.smsSent} text${summary.smsSent === 1 ? "" : "s"}` : null,
      summary.skipped > 0 ? `${summary.skipped} skipped (no consent or budget)` : null,
      summary.failed > 0 ? `${summary.failed} failed` : null,
    ].filter(Boolean);
    return {
      ok: `Sent: ${parts.join(" · ")}${summary.simulated ? ". DRY_RUN is on, so nothing actually left the building — the receipts are still real rows." : "."}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that" };
  }
}

export async function resendUnreachedAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("send_comms");
  const announcementId = String(form.get("announcementId") ?? "");
  const [row] = await getDb()
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId));
  if (!row || row.clubId !== ctx.club.id) return { error: "That message is not in your club" };

  try {
    const summary = await resendToUnreached(
      announcementId,
      actorOf(ctx),
      ctx.settings.smsMonthlyBudget,
    );
    revalidatePath(`/comms/${announcementId}`);
    return {
      ok: `Re-sent to the unreached only: ${summary.emailsSent} email${summary.emailsSent === 1 ? "" : "s"}${
        summary.smsSent > 0 ? `, ${summary.smsSent} text${summary.smsSent === 1 ? "" : "s"}` : ""
      }.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not re-send" };
  }
}
