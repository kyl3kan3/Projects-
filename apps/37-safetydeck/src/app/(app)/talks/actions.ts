"use server";

/**
 * Talk scheduling and delivery actions. Every one of these is reached from a
 * button on a screen; there are no unused exports here, because an exported
 * `"use server"` function is a public endpoint whether or not anything calls it.
 */

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { todayIso, weekStart } from "@/lib/dates";
import { createCustomTalk, fanOut, scheduleWeek, setInstanceTalk } from "@/lib/talks";
import { voidSignOff } from "@/lib/signoff";
import { getDb } from "@/db";
import { and, eq } from "drizzle-orm";
import { talkInstances } from "@/db/schema";

import type { ActionState } from "@/lib/action-state";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Schedule this week for every active crew that does not have a talk yet, then
 * send the link to each of them. This is the same code the daily cron runs, so
 * the button and the schedule cannot disagree about what happens.
 */
export async function sendThisWeekAction(): Promise<ActionState> {
  try {
    const { company, user } = await requireWriter();
    const today = todayIso(company.timezone);
    const scheduled = await scheduleWeek(company.id, weekStart(today));

    const db = getDb();
    const pending = await db
      .select({ id: talkInstances.id })
      .from(talkInstances)
      .where(
        and(
          eq(talkInstances.companyId, company.id),
          eq(talkInstances.weekOf, weekStart(today)),
          eq(talkInstances.status, "scheduled"),
        ),
      );

    let sent = 0;
    let noContact = 0;
    for (const instance of pending) {
      const result = await fanOut(instance.id);
      if (result.channel === "none") noContact += 1;
      else sent += 1;
    }
    void user;
    revalidatePath("/talks");

    if (sent === 0 && noContact === 0) {
      return {
        error: null,
        message:
          scheduled.created > 0
            ? "This week is scheduled. Every crew already had its link sent."
            : "Every crew already has this week's link.",
      };
    }
    const parts = [`Sent ${sent} crew link${sent === 1 ? "" : "s"}`];
    if (noContact > 0) {
      parts.push(
        `${noContact} crew${noContact === 1 ? "" : "s"} has no foreman phone or email — add one in Settings`,
      );
    }
    return { error: null, message: `${parts.join(". ")}.` };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

/** Resend one crew's link. This mints a new token, so the old link stops working. */
export async function resendLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const instanceId = field(form, "instanceId");
    const db = getDb();
    const [owned] = await db
      .select({ id: talkInstances.id })
      .from(talkInstances)
      .where(and(eq(talkInstances.id, instanceId), eq(talkInstances.companyId, company.id)));
    if (!owned) return { error: "That talk is not on this company's schedule.", message: null };

    const result = await fanOut(instanceId);
    revalidatePath(`/talks/${instanceId}`);
    revalidatePath("/talks");
    if (result.channel === "none") {
      return { error: result.error ?? "This crew has no foreman contact on file.", message: null };
    }
    // The link is included on purpose. A foreman who deleted the text, or one
    // whose number is wrong, needs someone in the office to be able to paste it
    // into WhatsApp — and it has just been sent to a phone anyway.
    return {
      error: null,
      message: `${
        result.dryRun
          ? "Link rebuilt and logged (DRY_RUN is on, so nothing was sent)"
          : `Link sent by ${result.channel}`
      }. The previous link no longer works. Copy: ${result.link}`,
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

/** Override the week's topic for one crew. */
export async function setTopicAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const instanceId = field(form, "instanceId");
    const talkId = field(form, "talkId");
    const db = getDb();
    const [owned] = await db
      .select({ id: talkInstances.id, status: talkInstances.status })
      .from(talkInstances)
      .where(and(eq(talkInstances.id, instanceId), eq(talkInstances.companyId, company.id)));
    if (!owned) return { error: "That talk is not on this company's schedule.", message: null };
    if (owned.status === "completed") {
      return {
        error: "This crew has already signed off. Changing the topic now would falsify the record.",
        message: null,
      };
    }
    await setInstanceTalk(instanceId, talkId);
    revalidatePath(`/talks/${instanceId}`);
    revalidatePath("/talks");
    return { error: null, message: "Topic changed. Resend the link so the crew sees it." };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

/** Upload a company talk. It sits beside the seeded library, never replacing it. */
export async function createTalkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const talk = await createCustomTalk(company.id, {
      title: field(form, "title"),
      bodyMd: field(form, "bodyMd"),
      hazardTags: field(form, "hazardTags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    revalidatePath("/talks/library");
    return { error: null, message: `"${talk.title}" is in your library.` };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

/**
 * Void a signature. Nothing is deleted: this appends a correction and the
 * original signature stays on the record with the correction beside it.
 */
export async function voidSignOffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company, user } = await requireWriter();
    await voidSignOff(company.id, field(form, "signOffId"), user.email, field(form, "reason"));
    revalidatePath(`/talks/${field(form, "instanceId")}`);
    return {
      error: null,
      message: "Correction recorded. The signature stays on the record with your note beside it.",
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}
