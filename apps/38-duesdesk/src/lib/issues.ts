/**
 * The violations and requests log: numbered issues, photo threads, and the
 * fair-process timeline.
 *
 * Two rules that are not negotiable, and are enforced in the query layer rather
 * than in the UI:
 *
 *  - **`board_only` events never leave the board.** `timelineForMember` filters
 *    in SQL. There is no code path where a member-facing render receives a
 *    board-only event and is trusted to hide it, because that is the mistake
 *    that ends up in a deposition.
 *  - **The thread is append-only.** Status changes and notices are events too,
 *    so "when did the board tell me?" always has an answer with a timestamp.
 */

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  associations,
  households,
  issueEvents,
  issues,
  members,
  type EventVisibility,
  type Household,
  type Issue,
  type IssueEvent,
  type IssueKind,
  type IssueStatus,
} from "@/db/schema";
import { audit, SYSTEM, type Actor } from "@/lib/audit";
import { formatIso, today } from "@/lib/dates";
import { sendEmail } from "@/lib/notify";
import { mintPortalToken, portalUrl } from "@/lib/portal";
import { firstName, renderTemplate } from "@/lib/text";
import { storage } from "@/lib/storage";

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  violation: "Violation",
  maintenance: "Maintenance request",
  architectural: "Architectural request",
};

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

/* -------------------------------------------------------------- numbering --- */

/**
 * The yearly sequence, "2026-014".
 *
 * Derived inside the insert from `max(seq)` for the association and year, and
 * protected by a unique index on (association, year, seq): two board members
 * filing at once produce two numbers, never one number twice.
 */
async function nextNumber(associationId: string, year: number): Promise<{ seq: number; number: string }> {
  const [row] = await getDb()
    .select({ max: sql<number | null>`max(${issues.seq})` })
    .from(issues)
    .where(and(eq(issues.associationId, associationId), eq(issues.year, year)));
  const seq = (row?.max ?? 0) + 1;
  return { seq, number: `${year}-${String(seq).padStart(3, "0")}` };
}

/* -------------------------------------------------------------- create/append --- */

export interface CreateIssueInput {
  associationId: string;
  householdId: string | null;
  kind: IssueKind;
  title: string;
  body: string;
  photoKeys?: string[];
  /** Board-filed violations often start board-only; member requests never do. */
  visibility?: EventVisibility;
}

export async function createIssue(input: CreateIssueInput, actor: Actor): Promise<Issue> {
  if (!input.title.trim()) throw new Error("Give the issue a title the board will recognise later");
  const db = getDb();
  const year = Number(today().slice(0, 4));

  let issue: Issue | undefined;
  for (let attempt = 0; attempt < 5 && !issue; attempt++) {
    const { seq, number } = await nextNumber(input.associationId, year);
    const rows = await db
      .insert(issues)
      .values({
        associationId: input.associationId,
        householdId: input.householdId,
        number,
        year,
        seq,
        kind: input.kind,
        title: input.title.trim(),
        status: "open",
        visibilityDefault: input.visibility ?? "member_visible",
        openedByUserId: actor.kind === "user" ? actor.id : null,
        openedByMemberId: actor.kind === "member" ? actor.id : null,
      })
      .onConflictDoNothing()
      .returning();
    issue = rows[0];
  }
  if (!issue) throw new Error("Could not allocate an issue number — try again");

  await appendEvent(
    issue.id,
    {
      body: input.body.trim() || `${ISSUE_KIND_LABELS[input.kind]} opened.`,
      visibility: input.visibility ?? "member_visible",
      photoKeys: input.photoKeys ?? [],
      kind: "comment",
    },
    actor,
  );

  await audit(input.associationId, actor, "opened_issue", `${issue.number} ${issue.title}`, {
    issueId: issue.id,
    kind: input.kind,
  });
  return issue;
}

export interface AppendEventInput {
  body: string;
  visibility: EventVisibility;
  photoKeys?: string[];
  kind?: IssueEvent["kind"];
}

export async function appendEvent(
  issueId: string,
  input: AppendEventInput,
  actor: Actor,
): Promise<IssueEvent> {
  const db = getDb();
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  if (!issue) throw new Error("No such issue");
  // A member can only ever add to their own household's thread, and only in the
  // open. Board-only is a board concept.
  const visibility = actor.kind === "member" ? "member_visible" : input.visibility;

  const [event] = await db
    .insert(issueEvents)
    .values({
      issueId,
      kind: input.kind ?? "comment",
      visibility,
      authorUserId: actor.kind === "user" ? actor.id : null,
      authorMemberId: actor.kind === "member" ? actor.id : null,
      authorLabel: actor.kind === "system" ? "DuesDesk" : actor.name,
      body: input.body,
      photoKeys: input.photoKeys ?? [],
    })
    .returning();
  return event;
}

export async function setIssueStatus(
  issueId: string,
  status: IssueStatus,
  note: string,
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  if (!issue) throw new Error("No such issue");
  if (issue.status === status) return;
  if ((status === "resolved" || status === "closed") && !note.trim()) {
    throw new Error("Closing an issue needs a resolution note — that is the record");
  }

  await db
    .update(issues)
    .set({
      status,
      resolutionNote: status === "resolved" || status === "closed" ? note.trim() : issue.resolutionNote,
      closedAt: status === "closed" ? new Date() : null,
    })
    .where(eq(issues.id, issueId));

  await appendEvent(
    issueId,
    {
      body:
        `Status changed from ${ISSUE_STATUS_LABELS[issue.status]} to ${ISSUE_STATUS_LABELS[status]}` +
        (note.trim() ? `. ${note.trim()}` : "."),
      // Status is always visible to the household: fair process means they can
      // see where their issue stands without asking.
      visibility: "member_visible",
      kind: "status_change",
    },
    actor,
  );

  await audit(issue.associationId, actor, "changed_issue_status", `${issue.number} → ${status}`, {
    issueId,
    from: issue.status,
    to: status,
  });
}

/* --------------------------------------------------------------- notices --- */

export const NOTICE_TEMPLATES: Record<IssueKind, { subject: string; body: string }> = {
  violation: {
    subject: "{{association}}: notice regarding {{unit}} ({{number}})",
    body:
      "Dear {{name}},\n\n" +
      "The board is writing about {{title}} at {{unit}}. This notice was recorded on {{date}} as issue {{number}}.\n\n" +
      "{{detail}}\n\n" +
      "Please review your association's governing documents for the applicable rule and the process that follows. " +
      "If you believe this notice is mistaken, or you need time, reply to this email — the board would rather talk than escalate.\n\n" +
      "You can see the full timeline for this issue, including any photos, here: {{portalLink}}\n\n" +
      "This is a record of communication from your board. It is not legal advice, and it is not a demand for payment.",
  },
  maintenance: {
    subject: "{{association}}: update on your maintenance request ({{number}})",
    body:
      "Dear {{name}},\n\n" +
      "An update on {{title}} ({{number}}), filed for {{unit}}.\n\n{{detail}}\n\n" +
      "The full timeline is here: {{portalLink}}",
  },
  architectural: {
    subject: "{{association}}: architectural request {{number}}",
    body:
      "Dear {{name}},\n\n" +
      "An update on your architectural request, {{title}} ({{number}}), for {{unit}}.\n\n{{detail}}\n\n" +
      "Please review your governing documents for the approval process and any conditions that apply. " +
      "The full timeline is here: {{portalLink}}",
  },
};

/**
 * Email the household about an issue, and record a `notice_sent` event with the
 * delivery outcome. This is the "we notified you on March 3" receipt — the thing
 * that ends he-said-she-said at an annual meeting.
 *
 * Templates carry review-your-governing-documents language and nothing else.
 * Nothing here generates a legal notice or a fine schedule.
 */
export async function sendNotice(
  issueId: string,
  detail: string,
  actor: Actor,
): Promise<{ sent: number; failed: number }> {
  const db = getDb();
  const [row] = await db
    .select({ issue: issues, household: households })
    .from(issues)
    .leftJoin(households, eq(issues.householdId, households.id))
    .where(eq(issues.id, issueId));
  if (!row) throw new Error("No such issue");
  if (!row.household) throw new Error("This is a common-area issue — there is no household to notify");

  const [association] = await db
    .select({ name: associations.name })
    .from(associations)
    .where(eq(associations.id, row.issue.associationId));

  const contacts = await db
    .select()
    .from(members)
    .where(eq(members.householdId, row.household.id));
  const template = NOTICE_TEMPLATES[row.issue.kind];

  let sent = 0;
  let failed = 0;
  const lines: string[] = [];

  for (const member of contacts) {
    if (!member.email) continue;
    const link = portalUrl(await mintPortalToken(member.id));
    const vars: Record<string, string> = {
      association: association?.name ?? "Your association",
      name: firstName(member.name),
      unit: row.household.unitLabel,
      number: row.issue.number,
      title: row.issue.title,
      date: formatIso(today()),
      detail: detail.trim(),
      portalLink: link,
    };
    const render = (t: string) => renderTemplate(t, vars);
    const result = await sendEmail(
      {
        associationId: row.issue.associationId,
        memberId: member.id,
        purpose: "issue_notice",
        issueId,
      },
      { to: member.email, subject: render(template.subject), text: render(template.body) },
    );
    if (result.status === "sent" || result.status === "delivered") sent += 1;
    else failed += 1;
    lines.push(`${member.name} <${member.email}>: ${result.status}${result.error ? ` — ${result.error}` : ""}`);
  }

  if (lines.length === 0) {
    lines.push("No email address on file for this household — notice not delivered.");
    failed += 1;
  }

  await appendEvent(
    issueId,
    {
      body: `Notice sent to the household.\n\n${detail.trim()}\n\nDelivery:\n${lines.join("\n")}`,
      visibility: "member_visible",
      kind: "notice_sent",
    },
    actor,
  );

  await audit(row.issue.associationId, actor, "sent_issue_notice", row.issue.number, {
    issueId,
    sent,
    failed,
  });
  return { sent, failed };
}

/* ---------------------------------------------------------------- queries --- */

export interface IssueSummary {
  issue: Issue;
  household: Household | null;
  eventCount: number;
  lastEventAt: Date | null;
  photoCount: number;
}

export async function listIssues(
  associationId: string,
  filter?: IssueStatus | "all",
): Promise<IssueSummary[]> {
  const db = getDb();
  const rows = await db
    .select({ issue: issues, household: households })
    .from(issues)
    .leftJoin(households, eq(issues.householdId, households.id))
    .where(
      filter && filter !== "all"
        ? and(eq(issues.associationId, associationId), eq(issues.status, filter))
        : eq(issues.associationId, associationId),
    )
    .orderBy(desc(issues.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.issue.id);
  const events = await db
    .select({
      issueId: issueEvents.issueId,
      n: count(),
      last: sql<Date>`max(${issueEvents.createdAt})`,
      photos: sql<number>`coalesce(sum(coalesce(array_length(${issueEvents.photoKeys}, 1), 0)), 0)::int`,
    })
    .from(issueEvents)
    .where(inArray(issueEvents.issueId, ids))
    .groupBy(issueEvents.issueId);
  const byIssue = new Map(events.map((e) => [e.issueId, e]));

  return rows.map(({ issue, household }) => {
    const stats = byIssue.get(issue.id);
    return {
      issue,
      household,
      eventCount: Number(stats?.n ?? 0),
      lastEventAt: stats?.last ? new Date(stats.last) : null,
      photoCount: stats?.photos ?? 0,
    };
  });
}

export interface IssueThread {
  issue: Issue;
  household: Household | null;
  events: IssueEvent[];
}

/** The board's view: everything, board-only events included and labelled. */
export async function threadForBoard(
  associationId: string,
  issueId: string,
): Promise<IssueThread | null> {
  const db = getDb();
  const [row] = await db
    .select({ issue: issues, household: households })
    .from(issues)
    .leftJoin(households, eq(issues.householdId, households.id))
    .where(and(eq(issues.id, issueId), eq(issues.associationId, associationId)));
  if (!row) return null;
  const events = await db
    .select()
    .from(issueEvents)
    .where(eq(issueEvents.issueId, issueId))
    .orderBy(asc(issueEvents.createdAt));
  return { issue: row.issue, household: row.household, events };
}

/**
 * The member's view. The visibility filter is in the WHERE clause: a board-only
 * event is never loaded on this path, so it cannot be leaked by a rendering
 * mistake downstream.
 */
export async function threadForMember(
  householdId: string,
  issueId: string,
): Promise<IssueThread | null> {
  const db = getDb();
  const [row] = await db
    .select({ issue: issues, household: households })
    .from(issues)
    .innerJoin(households, eq(issues.householdId, households.id))
    .where(and(eq(issues.id, issueId), eq(issues.householdId, householdId)));
  if (!row) return null;
  const events = await db
    .select()
    .from(issueEvents)
    .where(
      and(eq(issueEvents.issueId, issueId), eq(issueEvents.visibility, "member_visible")),
    )
    .orderBy(asc(issueEvents.createdAt));
  return { issue: row.issue, household: row.household, events };
}

export async function memberIssues(householdId: string): Promise<Issue[]> {
  return getDb()
    .select()
    .from(issues)
    .where(eq(issues.householdId, householdId))
    .orderBy(desc(issues.createdAt));
}

export async function openIssueCount(associationId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(issues)
    .where(
      and(
        eq(issues.associationId, associationId),
        inArray(issues.status, ["open", "in_progress"]),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Signed URLs for a thread's photos, valid long enough to render the page. */
export async function signPhotos(keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const adapter = storage();
  for (const key of keys) {
    try {
      out.set(key, await adapter.signedUrl(key, 900));
    } catch (err) {
      console.error(`[issues] could not sign ${key}`, err);
    }
  }
  return out;
}

export { SYSTEM };
