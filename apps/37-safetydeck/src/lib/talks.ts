/**
 * Toolbox-talk library, scheduling, and the weekly fan-out.
 *
 * The rotation is deliberately per-crew rather than per-company: crews start at
 * different times and a crew that joins in week 30 should begin at the top of the
 * library, not halfway through it.
 *
 * Idempotency lives in the database. `talk_instances` has a unique index on
 * (crew, week_of), so scheduling the same week twice — a cron that double-fires,
 * or an ops user pressing the button after the cron already ran — inserts nothing
 * the second time.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  crews,
  employees,
  talkInstances,
  talks,
  signOffs,
  type Crew,
  type Talk,
  type TalkInstance,
  type TalkInstanceStatus,
} from "@/db/schema";
import {
  addDays,
  dayName,
  todayIso,
  weekday,
  weekStart,
  weekdayInWeekOf,
  type IsoDate,
} from "@/lib/dates";
import { crewLinkUrl, mintCrewToken } from "@/lib/crew-token";
import { claimRung, sendEmail, sendSms } from "@/lib/notify";

export interface ScheduleResult {
  created: number;
  skipped: number;
  instanceIds: string[];
}

/** The company's talk library: the global seed set plus its own custom talks. */
export async function libraryFor(companyId: string): Promise<Talk[]> {
  const db = getDb();
  return db
    .select()
    .from(talks)
    .where(or(isNull(talks.companyId), eq(talks.companyId, companyId)))
    .orderBy(talks.rotationOrder, talks.title);
}

/**
 * The next talk in a crew's rotation: one past whatever it was given last, or
 * the top of the library for a crew that has never had one.
 */
export async function nextTalkForCrew(companyId: string, crewId: string): Promise<Talk | null> {
  const library = await libraryFor(companyId);
  const rotation = library.filter((t) => t.rotationOrder !== null);
  const pool = rotation.length > 0 ? rotation : library;
  if (pool.length === 0) return null;

  const db = getDb();
  const [last] = await db
    .select({ talkId: talkInstances.talkId })
    .from(talkInstances)
    .where(eq(talkInstances.crewId, crewId))
    .orderBy(desc(talkInstances.weekOf))
    .limit(1);

  if (!last) return pool[0];
  const idx = pool.findIndex((t) => t.id === last.talkId);
  return pool[(idx + 1) % pool.length];
}

/**
 * Create this week's instance for every active crew. Idempotent per
 * (crew, week) — the unique index does the work, so a second call is a no-op
 * rather than a duplicate huddle.
 */
export async function scheduleWeek(
  companyId: string,
  weekOf: IsoDate,
  opts: { crewIds?: string[]; talkId?: string } = {},
): Promise<ScheduleResult> {
  const db = getDb();
  const monday = weekStart(weekOf);
  const activeCrews = await db
    .select()
    .from(crews)
    .where(and(eq(crews.companyId, companyId), eq(crews.active, true)));

  const wanted = opts.crewIds
    ? activeCrews.filter((c) => opts.crewIds!.includes(c.id))
    : activeCrews;

  const result: ScheduleResult = { created: 0, skipped: 0, instanceIds: [] };

  for (const crew of wanted) {
    const talk = opts.talkId
      ? ((await db.select().from(talks).where(eq(talks.id, opts.talkId)))[0] ?? null)
      : await nextTalkForCrew(companyId, crew.id);
    if (!talk) continue;

    const scheduledFor = weekdayInWeekOf(monday, crew.talkDay);
    // The token names the instance it opens, so the id is generated here rather
    // than by the database default — one insert, no tokenless window.
    const id = randomUUID();
    const { tokenHash } = await mintCrewToken(id, crew.id);

    const [row] = await db
      .insert(talkInstances)
      .values({
        id,
        companyId,
        crewId: crew.id,
        talkId: talk.id,
        weekOf: monday,
        scheduledFor,
        tokenHash,
        status: "scheduled",
      })
      .onConflictDoNothing({ target: [talkInstances.crewId, talkInstances.weekOf] })
      .returning({ id: talkInstances.id });

    if (!row) {
      result.skipped += 1;
      continue;
    }
    result.created += 1;
    result.instanceIds.push(row.id);
  }
  return result;
}

/** Swap the topic on a scheduled instance. Ops override for the week. */
export async function setInstanceTalk(instanceId: string, talkId: string): Promise<void> {
  const db = getDb();
  await db.update(talkInstances).set({ talkId }).where(eq(talkInstances.id, instanceId));
}

export interface FanOutResult {
  instanceId: string;
  channel: "sms" | "email" | "none";
  dryRun: boolean;
  link: string;
  error?: string;
}

/**
 * Send the foreman the link and mark the instance delivered. A fresh token is
 * minted on every send, which is what makes "resend" also mean "revoke the link
 * that went to the wrong number".
 */
export async function fanOut(instanceId: string): Promise<FanOutResult> {
  const db = getDb();
  const [row] = await db
    .select({
      instance: talkInstances,
      crew: crews,
      talk: talks,
    })
    .from(talkInstances)
    .innerJoin(crews, eq(crews.id, talkInstances.crewId))
    .innerJoin(talks, eq(talks.id, talkInstances.talkId))
    .where(eq(talkInstances.id, instanceId));
  if (!row) throw new Error("That talk is no longer scheduled");

  const { token, tokenHash } = await mintCrewToken(instanceId, row.crew.id);
  const link = crewLinkUrl(token);

  const body = `SafetyDeck: this week's toolbox talk for ${row.crew.name} is "${row.talk.title}". Open on your phone, read it to the crew, and pass it around for signatures: ${link}`;

  let out: FanOutResult = { instanceId, channel: "none", dryRun: true, link };
  if (row.crew.foremanPhone) {
    const res = await sendSms({ to: row.crew.foremanPhone, body });
    out = { ...out, channel: "sms", dryRun: res.dryRun, error: res.error };
  } else if (row.crew.foremanEmail) {
    const res = await sendEmail({
      to: row.crew.foremanEmail,
      subject: `Toolbox talk for ${row.crew.name}: ${row.talk.title}`,
      text: `${body}\n\nThe link works without a login. Signatures are captured on the phone and sync when you get coverage.`,
    });
    out = { ...out, channel: "email", dryRun: res.dryRun, error: res.error };
  } else {
    out = { ...out, channel: "none", error: "This crew has no foreman phone or email on file." };
  }

  await db
    .update(talkInstances)
    .set({
      tokenHash,
      status: "delivered",
      deliveredAt: new Date(),
    })
    .where(eq(talkInstances.id, instanceId));

  return out;
}

/**
 * Display status, derived as of now rather than read from the column.
 *
 * The stored status is the lifecycle: what the last thing that happened was.
 * Whether a crew *missed* their talk is a fact about the calendar, and deriving
 * it means a row can never sit there reading "delivered" three weeks later.
 */
export function displayStatus(
  instance: Pick<TalkInstance, "status" | "scheduledFor">,
  today: IsoDate,
  graceHours = 12,
): TalkInstanceStatus {
  if (instance.status === "completed" || instance.status === "missed") return instance.status;
  const graceDays = Math.ceil(graceHours / 24);
  const deadline = addDays(instance.scheduledFor, graceDays);
  if (today > deadline) return "missed";
  return instance.status;
}

export const STATUS_LABELS: Record<TalkInstanceStatus, string> = {
  scheduled: "SCHEDULED",
  delivered: "SENT",
  in_progress: "SIGNING",
  completed: "CREW SIGNED",
  missed: "MISSED",
};

/**
 * Mark overdue instances missed and nudge ops once per instance.
 *
 * The reminder is pinned to the instance, not to "is it still overdue" — which
 * is what stops this becoming a daily email about the same Tuesday in March.
 */
export async function missedSweep(
  companyId: string,
  today: IsoDate,
  opts: { graceHours?: number; opsEmail?: string | null } = {},
): Promise<{ marked: number; notified: number }> {
  const db = getDb();
  const graceDays = Math.ceil((opts.graceHours ?? 12) / 24);
  const cutoff = addDays(today, -graceDays);

  const overdue = await db
    .select({ instance: talkInstances, crew: crews, talk: talks })
    .from(talkInstances)
    .innerJoin(crews, eq(crews.id, talkInstances.crewId))
    .innerJoin(talks, eq(talks.id, talkInstances.talkId))
    .where(
      and(
        eq(talkInstances.companyId, companyId),
        lt(talkInstances.scheduledFor, cutoff),
        inArray(talkInstances.status, ["scheduled", "delivered", "in_progress"]),
      ),
    );

  let marked = 0;
  let notified = 0;
  for (const row of overdue) {
    await db
      .update(talkInstances)
      .set({ status: "missed" })
      .where(eq(talkInstances.id, row.instance.id));
    marked += 1;

    if (!opts.opsEmail) continue;
    const claim = await claimRung({
      companyId,
      targetKind: "talk_missed",
      targetId: row.instance.id,
      rung: "overdue",
      channel: "email",
      detail: { crew: row.crew.name, talk: row.talk.title, scheduledFor: row.instance.scheduledFor },
    });
    if (!claim) continue;
    await sendEmail({
      to: opts.opsEmail,
      subject: `Missed toolbox talk: ${row.crew.name}`,
      text: `${row.crew.name} did not sign off "${row.talk.title}", scheduled for ${dayName(
        weekday(row.instance.scheduledFor),
      )} ${row.instance.scheduledFor}.\n\nForeman: ${row.crew.foremanName}${
        row.crew.foremanPhone ? ` (${row.crew.foremanPhone})` : ""
      }\n\nA missed week is a gap in the attendance record an inspector will find. Resend the link from the SafetyDeck dashboard and the crew can still sign it — the record will honestly show when it was signed.`,
    });
    notified += 1;
  }
  return { marked, notified };
}

/** Custom talk upload. Company talks sit beside the seed library. */
export async function createCustomTalk(
  companyId: string,
  input: { title: string; bodyMd: string; hazardTags: string[]; estMinutes?: number },
): Promise<Talk> {
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error("Give the talk a title");
  if (input.bodyMd.trim().length < 40) {
    throw new Error("A talk needs a body — a couple of paragraphs at least");
  }
  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(talks)
    .values({
      companyId,
      slug,
      title,
      bodyMd: input.bodyMd.trim(),
      hazardTags: input.hazardTags.map((t) => t.trim().toLowerCase()).filter(Boolean),
      estMinutes: input.estMinutes ?? 5,
      source: "custom",
    })
    .returning();
  return row;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "talk"
  );
}

/** This week's board: one row per active crew, with its instance if it has one. */
export interface CrewWeekRow {
  crew: Crew;
  instance: TalkInstance | null;
  talk: Talk | null;
  rosterCount: number;
  signedCount: number;
  status: TalkInstanceStatus | "unscheduled";
}

export async function crewWeek(
  companyId: string,
  weekOf: IsoDate,
  timezone: string,
  graceHours = 12,
): Promise<CrewWeekRow[]> {
  const db = getDb();
  const monday = weekStart(weekOf);
  const today = todayIso(timezone);

  const crewRows = await db
    .select()
    .from(crews)
    .where(and(eq(crews.companyId, companyId), eq(crews.active, true)))
    .orderBy(crews.name);

  const instanceRows = await db
    .select({ instance: talkInstances, talk: talks })
    .from(talkInstances)
    .innerJoin(talks, eq(talks.id, talkInstances.talkId))
    .where(and(eq(talkInstances.companyId, companyId), eq(talkInstances.weekOf, monday)));

  // Roster and signature counts, per crew, in two grouped queries rather than
  // one per crew.
  const rosterCounts = await db
    .select({ crewId: employees.crewId, n: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.active, true)))
    .groupBy(employees.crewId);

  const instanceIds = instanceRows.map((r) => r.instance.id);
  const signedCounts = instanceIds.length
    ? await db
        .select({ instanceId: signOffs.talkInstanceId, n: sql<number>`count(*)::int` })
        .from(signOffs)
        .where(inArray(signOffs.talkInstanceId, instanceIds))
        .groupBy(signOffs.talkInstanceId)
    : [];

  return crewRows.map((crew) => {
    const found = instanceRows.find((r) => r.instance.crewId === crew.id);
    const roster = rosterCounts.find((r) => r.crewId === crew.id)?.n ?? 0;
    const signed = found
      ? (signedCounts.find((s) => s.instanceId === found.instance.id)?.n ?? 0)
      : 0;
    return {
      crew,
      instance: found?.instance ?? null,
      talk: found?.talk ?? null,
      rosterCount: roster,
      signedCount: signed,
      status: found ? displayStatus(found.instance, today, graceHours) : "unscheduled",
    };
  });
}
