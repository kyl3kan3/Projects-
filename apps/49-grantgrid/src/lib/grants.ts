/**
 * Pipeline reads and writes.
 *
 * Two rules run through all of it:
 *
 *  - **Nothing about lateness is stored.** A grant's next deadline, whether it is
 *    overdue, and how many days are left are all derived from the org's own today
 *    at read time. A stored `status` column reconciled by a cron is how an
 *    invoice ends up displaying "Due" 212 days late.
 *  - **Every state change is logged.** The activity log is the institutional
 *    memory the README says walks out of the door when the ED leaves, so stage
 *    moves, awards, and notes all write an entry.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  deadlines,
  grants,
  reminders,
  workspaceItems,
  type Deadline,
  type DeadlineKind,
  type Grant,
  type GrantStage,
  type Organization,
} from "@/db/schema";
import { daysBetween, formatCivilLong, todayIn, type CivilDate } from "@/lib/dates";
import { checkGrantCap } from "@/lib/plans";
import { reportDeadlinesFor, type ReportScheduleKey } from "@/lib/reminders";
import { PENDING_STAGES, isOpenStage, stageLabel } from "@/lib/stages";
import { effectivePlan } from "@/lib/billing";

export interface PipelineDeadline extends Deadline {
  daysUntil: number;
  overdue: boolean;
}

export interface PipelineRow {
  grant: Grant;
  ownerName: string | null;
  deadlines: PipelineDeadline[];
  /** The soonest incomplete deadline, or null. Derived, never stored. */
  next: PipelineDeadline | null;
  openItems: number;
  totalItems: number;
}

function decorate(deadline: Deadline, today: CivilDate): PipelineDeadline {
  const daysUntil = daysBetween(today, deadline.dueOn);
  return {
    ...deadline,
    daysUntil,
    overdue: deadline.completedAt === null && daysUntil < 0,
  };
}

export async function listPipeline(
  organizationId: string,
  today: CivilDate,
): Promise<PipelineRow[]> {
  const db = getDb();
  const grantRows = await db
    .select()
    .from(grants)
    .where(eq(grants.organizationId, organizationId))
    .orderBy(desc(grants.updatedAt));
  if (!grantRows.length) return [];

  const ids = grantRows.map((g) => g.id);
  const deadlineRows = await db
    .select()
    .from(deadlines)
    .where(inArray(deadlines.grantId, ids))
    .orderBy(asc(deadlines.dueOn));

  const items = await db
    .select({
      grantId: workspaceItems.grantId,
      status: workspaceItems.status,
      count: sql<number>`count(*)::int`,
    })
    .from(workspaceItems)
    .where(inArray(workspaceItems.grantId, ids))
    .groupBy(workspaceItems.grantId, workspaceItems.status);

  const ownerNames = await ownerNameMap(grantRows);

  return grantRows.map((grant) => {
    const mine = deadlineRows
      .filter((d) => d.grantId === grant.id)
      .map((d) => decorate(d, today));
    const incomplete = mine.filter((d) => d.completedAt === null);
    const grantItems = items.filter((i) => i.grantId === grant.id);
    const totalItems = grantItems.reduce((sum, i) => sum + i.count, 0);
    const finalItems = grantItems
      .filter((i) => i.status === "final")
      .reduce((sum, i) => sum + i.count, 0);
    return {
      grant,
      ownerName: ownerNames.get(grant.ownerUserId ?? "") ?? null,
      deadlines: mine,
      next: incomplete[0] ?? null,
      openItems: totalItems - finalItems,
      totalItems,
    };
  });
}

async function ownerNameMap(grantRows: Grant[]): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(grantRows.map((g) => g.ownerUserId).filter((id): id is string => !!id)),
  );
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const db = getDb();
  const { users } = await import("@/db/schema");
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
  for (const r of rows) map.set(r.id, r.name?.trim() || r.email.split("@")[0]);
  return map;
}

export interface PipelineSummary {
  activeCount: number;
  pendingCents: number;
  awardedCents: number;
  overdueCount: number;
  next: { row: PipelineRow; deadline: PipelineDeadline } | null;
}

/** The header line: `6 ACTIVE · $83,500 PENDING`, plus the next-deadline banner. */
export function summarize(rows: PipelineRow[]): PipelineSummary {
  let pendingCents = 0;
  let awardedCents = 0;
  let activeCount = 0;
  let overdueCount = 0;
  let next: PipelineSummary["next"] = null;

  for (const row of rows) {
    if (isOpenStage(row.grant.stage)) activeCount++;
    if (PENDING_STAGES.includes(row.grant.stage)) {
      pendingCents += row.grant.askAmountCents ?? 0;
    }
    if (row.grant.stage === "awarded" || row.grant.stage === "reporting") {
      awardedCents += row.grant.awardedAmountCents ?? 0;
    }
    for (const d of row.deadlines) {
      if (d.overdue) overdueCount++;
    }
    if (row.next && (!next || row.next.dueOn < next.deadline.dueOn)) {
      next = { row, deadline: row.next };
    }
  }

  return { activeCount, pendingCents, awardedCents, overdueCount, next };
}

/* ------------------------------------------------------------------ writes --- */

export async function grantCount(organizationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(grants)
    .where(eq(grants.organizationId, organizationId));
  return row?.count ?? 0;
}

export interface CreateGrantInput {
  organizationId: string;
  title: string;
  funderName: string;
  funderId?: string | null;
  askAmountCents?: number | null;
  stage?: GrantStage;
  ownerUserId?: string | null;
  notes?: string | null;
  source?: "discovery" | "manual";
  fitScoreAtAdd?: number | null;
  actor: string;
}

/**
 * Add a grant, subject to the plan's tracked-grant cap. Over the cap the add is
 * refused with an explanation — nothing existing is touched, which is the whole
 * point of a cap in a product a nonprofit trusts with its deadlines.
 */
export async function createGrant(
  org: Organization,
  input: CreateGrantInput,
  now: Date = new Date(),
): Promise<{ grant: Grant } | { error: string }> {
  const count = await grantCount(org.id);
  const cap = checkGrantCap(effectivePlan(org, now), count);
  if (!cap.allowed) return { error: cap.message! };

  const db = getDb();
  const [grant] = await db
    .insert(grants)
    .values({
      organizationId: org.id,
      title: input.title.trim(),
      funderName: input.funderName.trim(),
      funderId: input.funderId ?? null,
      askAmountCents: input.askAmountCents ?? null,
      stage: input.stage ?? "researching",
      ownerUserId: input.ownerUserId ?? null,
      notes: input.notes?.trim() || null,
      source: input.source ?? "manual",
      fitScoreAtAdd: input.fitScoreAtAdd ?? null,
    })
    .returning();

  await db.insert(activityLog).values({
    organizationId: org.id,
    grantId: grant.id,
    actor: input.actor,
    event: "created",
    summary: `Added ${grant.funderName} to the pipeline at Researching`,
    metadata: { source: grant.source, fitScoreAtAdd: grant.fitScoreAtAdd },
  });

  return { grant };
}

export async function getGrant(
  organizationId: string,
  grantId: string,
): Promise<Grant | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(grants)
    .where(and(eq(grants.id, grantId), eq(grants.organizationId, organizationId)));
  return row ?? null;
}

export async function moveStage(
  organizationId: string,
  grantId: string,
  stage: GrantStage,
  actor: string,
): Promise<void> {
  const db = getDb();
  const grant = await getGrant(organizationId, grantId);
  if (!grant) throw new Error("Not found");
  if (grant.stage === stage) return;
  await db
    .update(grants)
    .set({ stage, updatedAt: new Date() })
    .where(eq(grants.id, grantId));
  await db.insert(activityLog).values({
    organizationId,
    grantId,
    actor,
    event: "stage_change",
    summary: `Moved from ${stageLabel(grant.stage)} to ${stageLabel(stage)}`,
    metadata: { from: grant.stage, to: stage },
  });
}

export async function updateGrantFields(
  organizationId: string,
  grantId: string,
  fields: {
    title?: string;
    funderName?: string;
    askAmountCents?: number | null;
    ownerUserId?: string | null;
    notes?: string | null;
  },
  actor: string,
): Promise<void> {
  const db = getDb();
  const grant = await getGrant(organizationId, grantId);
  if (!grant) throw new Error("Not found");
  await db
    .update(grants)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(grants.id, grantId));
  if (fields.notes !== undefined && fields.notes !== grant.notes) {
    await db.insert(activityLog).values({
      organizationId,
      grantId,
      actor,
      event: "note",
      summary: "Notes updated",
    });
  }
}

export async function deleteGrant(
  organizationId: string,
  grantId: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  const grant = await getGrant(organizationId, grantId);
  if (!grant) throw new Error("Not found");
  await db.delete(grants).where(eq(grants.id, grantId));
  await db.insert(activityLog).values({
    organizationId,
    grantId: null,
    actor,
    event: "deleted",
    summary: `Removed ${grant.funderName} from the pipeline`,
    metadata: { title: grant.title },
  });
}

/* --------------------------------------------------------------- deadlines --- */

export async function addDeadline(
  organizationId: string,
  grantId: string,
  input: { kind: DeadlineKind; dueOn: CivilDate; label?: string },
  actor: string,
): Promise<Deadline> {
  const db = getDb();
  const grant = await getGrant(organizationId, grantId);
  if (!grant) throw new Error("Not found");
  const label = input.label?.trim() || defaultDeadlineLabel(input.kind, grant.funderName);
  const [row] = await db
    .insert(deadlines)
    .values({ organizationId, grantId, kind: input.kind, dueOn: input.dueOn, label })
    .returning();
  await db.insert(activityLog).values({
    organizationId,
    grantId,
    actor,
    event: "deadline_added",
    summary: `${label} due ${formatCivilLong(input.dueOn)}`,
    metadata: { kind: input.kind, dueOn: input.dueOn },
  });
  return row;
}

export function defaultDeadlineLabel(kind: DeadlineKind, funderName: string): string {
  switch (kind) {
    case "loi":
      return `LOI to ${funderName}`;
    case "application":
      return `Application to ${funderName}`;
    case "report":
      return `Report to ${funderName}`;
    case "renewal":
      return `Renewal window opens — ${funderName}`;
    default:
      return `Task for ${funderName}`;
  }
}

/**
 * Marking a deadline done stops its ladder. It does not delete the reminders
 * already sent — the ledger is a record of what was sent, and rewriting history
 * to look tidier would make it useless.
 */
export async function completeDeadline(
  organizationId: string,
  deadlineId: string,
  done: boolean,
  actor: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.id, deadlineId), eq(deadlines.organizationId, organizationId)));
  if (!row) throw new Error("Not found");
  await db
    .update(deadlines)
    .set({ completedAt: done ? new Date() : null })
    .where(eq(deadlines.id, deadlineId));
  await db.insert(activityLog).values({
    organizationId,
    grantId: row.grantId,
    actor,
    event: done ? "deadline_done" : "deadline_reopened",
    summary: done ? `Marked done: ${row.label}` : `Reopened: ${row.label}`,
  });
}

export async function deleteDeadline(
  organizationId: string,
  deadlineId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(deadlines)
    .where(and(eq(deadlines.id, deadlineId), eq(deadlines.organizationId, organizationId)));
}

/** Every incomplete deadline in the org, for the calendar and the ICS feed. */
export async function listOpenDeadlines(organizationId: string) {
  const db = getDb();
  return db
    .select({
      deadline: deadlines,
      grantTitle: grants.title,
      funderName: grants.funderName,
      askAmountCents: grants.askAmountCents,
      stage: grants.stage,
    })
    .from(deadlines)
    .innerJoin(grants, eq(grants.id, deadlines.grantId))
    .where(and(eq(deadlines.organizationId, organizationId), isNull(deadlines.completedAt)))
    .orderBy(asc(deadlines.dueOn));
}

/** Everything, complete or not — the calendar shows done items struck through. */
export async function listAllDeadlines(organizationId: string) {
  const db = getDb();
  return db
    .select({
      deadline: deadlines,
      grantTitle: grants.title,
      funderName: grants.funderName,
      askAmountCents: grants.askAmountCents,
      stage: grants.stage,
    })
    .from(deadlines)
    .innerJoin(grants, eq(grants.id, deadlines.grantId))
    .where(eq(deadlines.organizationId, organizationId))
    .orderBy(asc(deadlines.dueOn));
}

/* ------------------------------------------------------------------ awards --- */

export interface AwardInput {
  awardedAmountCents: number;
  restrictions: string | null;
  awardedOn: CivilDate;
  schedule: ReportScheduleKey;
}

/**
 * Entering an award. This is the renewal-saver: the report dates are created here,
 * at the one moment the org is certain to be paying attention, because nobody
 * volunteers to schedule paperwork six months later.
 */
export async function enterAward(
  organizationId: string,
  grantId: string,
  input: AwardInput,
  actor: string,
): Promise<{ reportDeadlines: Deadline[] }> {
  const db = getDb();
  const grant = await getGrant(organizationId, grantId);
  if (!grant) throw new Error("Not found");

  const planned = reportDeadlinesFor(input.awardedOn, input.schedule, grant.funderName);
  const nextStage: GrantStage = planned.length ? "reporting" : "awarded";

  await db
    .update(grants)
    .set({
      awardedAmountCents: input.awardedAmountCents,
      awardRestrictions: input.restrictions,
      stage: nextStage,
      updatedAt: new Date(),
    })
    .where(eq(grants.id, grantId));

  const created = planned.length
    ? await db
        .insert(deadlines)
        .values(
          planned.map((p) => ({
            organizationId,
            grantId,
            kind: p.kind,
            dueOn: p.dueOn,
            label: p.label,
          })),
        )
        .returning()
    : [];

  await db.insert(activityLog).values({
    organizationId,
    grantId,
    actor,
    event: "award",
    summary: planned.length
      ? `Awarded — ${created.length} report ${created.length === 1 ? "date" : "dates"} added to the calendar`
      : "Awarded — no report required",
    metadata: {
      awardedAmountCents: input.awardedAmountCents,
      restrictions: input.restrictions,
      schedule: input.schedule,
      reportDates: created.map((d) => d.dueOn),
    },
  });

  return { reportDeadlines: created };
}

/* -------------------------------------------------------------- activity --- */

export async function grantActivity(organizationId: string, grantId: string) {
  const db = getDb();
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.organizationId, organizationId), eq(activityLog.grantId, grantId)))
    .orderBy(desc(activityLog.createdAt))
    .limit(50);
}

export async function reminderLedger(deadlineIds: string[]) {
  if (!deadlineIds.length) return [];
  const db = getDb();
  return db.select().from(reminders).where(inArray(reminders.deadlineId, deadlineIds));
}

/** Today, in the organization's own timezone. The only place the app asks. */
export function orgToday(org: Organization, now: Date = new Date()): CivilDate {
  return todayIn(org.timezone, now);
}
