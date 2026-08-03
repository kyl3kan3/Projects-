/**
 * src/lib/deals.ts
 *
 * The deal file: opening one, reading it back, and recomputing it.
 *
 * Everything that touches the database for a deal lives here so the pages stay
 * thin and the multi-tenant guard is in one place: every read is scoped by
 * `account_id`, and a deal id that belongs to another account returns null
 * rather than 403 — a coordinator should not be able to probe for other
 * people's files at all.
 */

import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  checklistTemplates,
  criticalDates,
  dateRecomputes,
  deals,
  documents,
  parties,
  reminders,
  tasks,
  type ContractType,
  type CriticalDate,
  type Deal,
  type DealStatus,
  type DocumentRow,
  type Party,
  type Task,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { DEAL_STATUS_LABELS, DEAL_STATUS_ORDER } from "@/lib/deal-status";
import { loadHolidayMap } from "@/lib/calendar";
import { commissionLines, parseCommission, type CommissionBasis } from "@/lib/commissions";
import {
  ANCHOR_LABELS,
  computeAll,
  diffDates,
  displayStatus,
  formatShort,
  todayInZone,
  type Anchors,
  type AnchorKey,
  type ComputedDate,
  type DateDiffRow,
  type DateRule,
  type DisplayDateStatus,
} from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/plans";
import { readOffsets, remindersOutlook } from "@/lib/reminder-rules";
import { datedTasks, parseTemplateTasks, type TemplateTask } from "@/lib/templates";

// Re-exported so server callers have one import for the deal vocabulary; the
// definitions live in a pure module because client components need them too.
export { DEAL_STATUS_LABELS, DEAL_STATUS_ORDER };

/* --------------------------------------------------------------- open a deal */

export interface OpenDealInput {
  accountId: string;
  address: string;
  mlsNumber?: string | null;
  contractType: ContractType;
  templateId: string;
  priceCents?: number | null;
  contractDate?: string | null;
  acceptanceDate?: string | null;
  closingDate?: string | null;
  commission?: CommissionBasis;
  parties?: Array<{ role: Party["role"]; name: string; email?: string | null; phone?: string | null }>;
}

export interface OpenDealResult {
  dealId: string;
  taskCount: number;
  dateCount: number;
  unresolvedCount: number;
}

function anchorsOf(deal: {
  contractDate: string | null;
  acceptanceDate: string | null;
  closingDate: string | null;
}): Anchors {
  return {
    contract_date: deal.contractDate,
    acceptance_date: deal.acceptanceDate,
    closing_date: deal.closingDate,
  };
}

/**
 * Instantiate a file: the deal row, its parties, the template's tasks, and the
 * computed critical dates. The timeline exists the moment this returns — that
 * first minute is the product.
 */
export async function openDeal(
  input: OpenDealInput,
  actor: string,
  state: string,
): Promise<OpenDealResult> {
  const db = getDb();
  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, input.templateId),
        eq(checklistTemplates.accountId, input.accountId),
      ),
    );
  if (!template) throw new Error("That checklist template is not on your account");

  const templateTasks = parseTemplateTasks(template.tasks);
  if (templateTasks.length === 0) {
    throw new Error("That template has no tasks yet — add one before opening a file with it");
  }

  const holidays = await loadHolidayMap(state);
  const anchors: Anchors = {
    contract_date: input.contractDate ?? null,
    acceptance_date: input.acceptanceDate ?? null,
    closing_date: input.closingDate ?? null,
  };
  const computed = computeAll(datedTasks(templateTasks), anchors, holidays);

  const [deal] = await db
    .insert(deals)
    .values({
      accountId: input.accountId,
      address: input.address,
      mlsNumber: input.mlsNumber ?? null,
      contractType: input.contractType,
      status: "active",
      priceCents: input.priceCents ?? null,
      contractDate: input.contractDate ?? null,
      acceptanceDate: input.acceptanceDate ?? null,
      closingDate: input.closingDate ?? null,
      templateId: template.id,
      commission: input.commission ?? { rateBps: 0, split: [], referralFeeCents: 0, tcFeeCents: 0 },
    })
    .returning();

  const taskRows = await db
    .insert(tasks)
    .values(
      templateTasks.map((t, i) => ({
        dealId: deal.id,
        key: t.key,
        label: t.label,
        ownerRole: t.ownerRole,
        docRequired: t.docRequired,
        sortOrder: i,
      })),
    )
    .returning();
  const taskIdByKey = new Map(taskRows.map((t) => [t.key, t.id]));

  const dateValues = computed
    .filter((c) => c.dueOn !== null)
    .map((c) => ({
      dealId: deal.id,
      taskId: taskIdByKey.get(c.key) ?? null,
      key: c.key,
      label: c.label,
      rule: c.rule,
      dueOn: c.dueOn as string,
      computedFrom: { ...c.computedFrom, sentence: c.sentence },
    }));
  if (dateValues.length > 0) await db.insert(criticalDates).values(dateValues);

  if (input.parties && input.parties.length > 0) {
    await db.insert(parties).values(
      input.parties.map((p) => ({
        dealId: deal.id,
        role: p.role,
        name: p.name,
        email: p.email?.trim() || null,
        phone: p.phone?.trim() || null,
      })),
    );
  }

  const unresolved = computed.filter((c) => c.dueOn === null);
  await logActivity({
    dealId: deal.id,
    actor,
    action: "deal_opened",
    target: deal.address,
    metadata: {
      detail: `${dateValues.length} dates computed from ${template.name}`,
      templateId: template.id,
      unresolved: unresolved.map((u) => u.key),
    },
  });

  return {
    dealId: deal.id,
    taskCount: taskRows.length,
    dateCount: dateValues.length,
    unresolvedCount: unresolved.length,
  };
}

/* ------------------------------------------------------------------ reading */

export interface DealDateView {
  id: string;
  taskId: string | null;
  key: string;
  label: string;
  dueOn: string;
  rule: DateRule;
  sentence: string;
  storedStatus: CriticalDate["status"];
  status: DisplayDateStatus;
  sentOffsets: number[];
}

export interface DealTaskView extends Task {
  date: DealDateView | null;
  documents: DocumentRow[];
  /** The rule sentence when the task has a rule the anchors cannot resolve. */
  unresolvedRule: string | null;
}

export interface DealFile {
  deal: Deal;
  today: string;
  templateName: string | null;
  parties: Party[];
  tasks: DealTaskView[];
  dates: DealDateView[];
  documents: DocumentRow[];
  commission: CommissionBasis;
  commissionLines: ReturnType<typeof commissionLines>;
  recomputes: Array<{
    id: string;
    changedAnchor: string;
    oldValue: string | null;
    newValue: string;
    appliedAt: Date;
    diff: DateDiffRow[];
  }>;
  reminderLedger: Array<{
    id: string;
    criticalDateId: string;
    dateLabel: string;
    offsetDays: number;
    sentAt: Date;
    recipients: Array<{ name: string; email: string; failed?: boolean }>;
    aboutDueOn: string | null;
    stale: boolean;
  }>;
  completeness: { required: number; satisfied: number; percent: number };
}

function ruleOf(value: unknown): DateRule {
  const r = value as Partial<DateRule> | null;
  return {
    anchor: (r?.anchor ?? "contract_date") as AnchorKey,
    offsetDays: typeof r?.offsetDays === "number" ? r.offsetDays : 0,
    businessDays: r?.businessDays === true,
    observeHolidays: r?.observeHolidays === true,
  };
}

function sentenceOf(computedFrom: unknown, fallback: string): string {
  const c = computedFrom as { sentence?: unknown } | null;
  return typeof c?.sentence === "string" && c.sentence.length > 0 ? c.sentence : fallback;
}

export async function loadDealFile(
  dealId: string,
  accountId: string,
  timezone: string,
  state: string,
  settings: unknown,
): Promise<DealFile | null> {
  const db = getDb();
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)));
  if (!deal) return null;

  const today = todayInZone(timezone);
  const [taskRows, dateRows, partyRows, docRows, recomputeRows, template] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.dealId, deal.id)).orderBy(asc(tasks.sortOrder)),
    db.select().from(criticalDates).where(eq(criticalDates.dealId, deal.id)).orderBy(asc(criticalDates.dueOn)),
    db.select().from(parties).where(eq(parties.dealId, deal.id)).orderBy(asc(parties.role)),
    db.select().from(documents).where(eq(documents.dealId, deal.id)).orderBy(desc(documents.version)),
    db
      .select()
      .from(dateRecomputes)
      .where(eq(dateRecomputes.dealId, deal.id))
      .orderBy(desc(dateRecomputes.appliedAt))
      .limit(10),
    deal.templateId
      ? db.select().from(checklistTemplates).where(eq(checklistTemplates.id, deal.templateId))
      : Promise.resolve([]),
  ]);

  const ledgerRows =
    dateRows.length > 0
      ? await db
          .select()
          .from(reminders)
          .where(inArray(reminders.criticalDateId, dateRows.map((d) => d.id)))
          .orderBy(desc(reminders.sentAt))
      : [];

  const sentByDate = new Map<string, number[]>();
  for (const r of ledgerRows) {
    const list = sentByDate.get(r.criticalDateId) ?? [];
    list.push(r.offsetDays);
    sentByDate.set(r.criticalDateId, list);
  }

  const dateViews: DealDateView[] = dateRows.map((d) => {
    const rule = ruleOf(d.rule);
    return {
      id: d.id,
      taskId: d.taskId,
      key: d.key,
      label: d.label,
      dueOn: d.dueOn,
      rule,
      sentence: sentenceOf(d.computedFrom, `${ANCHOR_LABELS[rule.anchor]} + ${rule.offsetDays} days`),
      storedStatus: d.status,
      status: displayStatus({ dueOn: d.dueOn, status: d.status }, today),
      sentOffsets: sentByDate.get(d.id) ?? [],
    };
  });
  const dateByTaskId = new Map(dateViews.filter((d) => d.taskId).map((d) => [d.taskId as string, d]));

  const templateTasks: TemplateTask[] = template[0] ? parseTemplateTasks(template[0].tasks) : [];
  const ruleByKey = new Map(templateTasks.filter((t) => t.dateRule).map((t) => [t.key, t.dateRule as DateRule]));

  const docsByTask = new Map<string, DocumentRow[]>();
  const docsByLabel = new Map<string, DocumentRow[]>();
  for (const doc of docRows) {
    if (doc.taskId) {
      const list = docsByTask.get(doc.taskId) ?? [];
      list.push(doc);
      docsByTask.set(doc.taskId, list);
    }
    const byLabel = docsByLabel.get(doc.label) ?? [];
    byLabel.push(doc);
    docsByLabel.set(doc.label, byLabel);
  }

  const holidays = await loadHolidayMap(state);
  const taskViews: DealTaskView[] = taskRows.map((t) => {
    const date = dateByTaskId.get(t.id) ?? null;
    let unresolvedRule: string | null = null;
    const rule = ruleByKey.get(t.key);
    if (!date && rule) {
      const computed = computeAll([{ key: t.key, label: t.label, rule }], anchorsOf(deal), holidays);
      unresolvedRule = computed[0]?.sentence ?? null;
    }
    return {
      ...t,
      date,
      documents: docsByTask.get(t.id) ?? docsByLabel.get(t.label) ?? [],
      unresolvedRule,
    };
  });

  const requiredTasks = taskViews.filter((t) => t.docRequired && t.status !== "na");
  const satisfied = requiredTasks.filter((t) => t.documents.length > 0).length;

  const basis = parseCommission(deal.commission);

  return {
    deal,
    today,
    templateName: template[0]?.name ?? null,
    parties: partyRows,
    tasks: taskViews,
    dates: dateViews,
    documents: docRows,
    commission: basis,
    commissionLines: commissionLines(deal.priceCents, basis),
    recomputes: recomputeRows.map((r) => ({
      id: r.id,
      changedAnchor: r.changedAnchor,
      oldValue: r.oldValue,
      newValue: r.newValue,
      appliedAt: r.appliedAt,
      diff: Array.isArray(r.diff) ? (r.diff as DateDiffRow[]) : [],
    })),
    reminderLedger: ledgerRows.map((r) => {
      const ledger = parseSentTo(r.sentTo);
      const date = dateViews.find((d) => d.id === r.criticalDateId);
      return {
        id: r.id,
        criticalDateId: r.criticalDateId,
        dateLabel: date?.label ?? "A date no longer on the file",
        offsetDays: r.offsetDays,
        sentAt: r.sentAt,
        recipients: ledger.recipients,
        aboutDueOn: ledger.aboutDueOn,
        // The date moved after this rung went out: the file says so rather than
        // implying the party was warned about the date it now shows.
        stale: Boolean(ledger.aboutDueOn && date && ledger.aboutDueOn !== date.dueOn),
      };
    }),
    completeness: {
      required: requiredTasks.length,
      satisfied,
      percent: requiredTasks.length === 0 ? 100 : Math.round((satisfied / requiredTasks.length) * 100),
    },
  };
}

interface LedgerRecipient {
  name: string;
  email: string;
  failed?: boolean;
}

/**
 * `reminders.sent_to` is jsonb written by the fan-out as
 * `{ aboutDueOn, recipients: [...] }`. Read defensively: a ledger row is an
 * audit record and must never be able to crash the page that displays it.
 */
function parseSentTo(value: unknown): { aboutDueOn: string | null; recipients: LedgerRecipient[] } {
  const obj = (value ?? {}) as { aboutDueOn?: unknown; recipients?: unknown };
  const aboutDueOn = typeof obj.aboutDueOn === "string" ? obj.aboutDueOn : null;
  const list = Array.isArray(obj.recipients) ? obj.recipients : Array.isArray(value) ? value : [];
  const recipients: LedgerRecipient[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as { name?: unknown; email?: unknown; failed?: unknown };
    if (typeof r.email !== "string") continue;
    recipients.push({
      name: typeof r.name === "string" ? r.name : "",
      email: r.email,
      failed: r.failed === true,
    });
  }
  return { aboutDueOn, recipients };
}

/* ------------------------------------------------------- the recompute flow */

export interface AnchorPreview {
  changed: Array<{ anchor: AnchorKey; from: string | null; to: string | null }>;
  diff: Array<DateDiffRow & { remindersNote: string }>;
  unchangedCount: number;
  nextAnchors: Anchors;
}

/**
 * The diff preview. Runs the engine against the proposed anchors and returns
 * what would move — nothing is written. This is the row the coordinator
 * approves, and applying it stores exactly this.
 */
export async function previewAnchorChange(
  dealId: string,
  accountId: string,
  proposed: Anchors,
  state: string,
  timezone: string,
  settings: unknown,
): Promise<AnchorPreview | null> {
  const db = getDb();
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)));
  if (!deal) return null;

  const template = deal.templateId
    ? (await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, deal.templateId)))[0]
    : undefined;
  const templateTasks = template ? parseTemplateTasks(template.tasks) : [];
  const holidays = await loadHolidayMap(state);
  const today = todayInZone(timezone);
  const offsets = readOffsets(settings);

  const current = anchorsOf(deal);
  const next: Anchors = {
    contract_date: proposed.contract_date ?? null,
    acceptance_date: proposed.acceptance_date ?? null,
    closing_date: proposed.closing_date ?? null,
  };

  const before = computeAll(datedTasks(templateTasks), current, holidays);
  const after = computeAll(datedTasks(templateTasks), next, holidays);
  const rows = diffDates(before, after);

  const dateRows = await db
    .select({ id: criticalDates.id, key: criticalDates.key })
    .from(criticalDates)
    .where(eq(criticalDates.dealId, deal.id));
  const idByKey = new Map(dateRows.map((d) => [d.key, d.id]));
  const ledger =
    dateRows.length > 0
      ? await db
          .select({ criticalDateId: reminders.criticalDateId, offsetDays: reminders.offsetDays })
          .from(reminders)
          .where(inArray(reminders.criticalDateId, dateRows.map((d) => d.id)))
      : [];
  const spentByDateId = new Map<string, number[]>();
  for (const r of ledger) {
    const list = spentByDateId.get(r.criticalDateId) ?? [];
    list.push(r.offsetDays);
    spentByDateId.set(r.criticalDateId, list);
  }

  const changed: AnchorPreview["changed"] = [];
  for (const anchor of ["contract_date", "acceptance_date", "closing_date"] as AnchorKey[]) {
    const from = current[anchor] ?? null;
    const to = next[anchor] ?? null;
    if (from !== to) changed.push({ anchor, from, to });
  }

  return {
    changed,
    diff: rows.map((r) => ({
      ...r,
      remindersNote: remindersOutlook(
        spentByDateId.get(idByKey.get(r.key) ?? "") ?? [],
        r.newDue,
        today,
        offsets,
      ),
    })),
    unchangedCount: after.length - rows.length,
    nextAnchors: next,
  };
}

export interface ApplyResult {
  moved: number;
  created: number;
  removed: number;
  recomputeId: string;
}

/**
 * Apply the recompute the coordinator approved.
 *
 * The reminder ledger is deliberately untouched: a row there records an email a
 * party actually received, and rewriting it would make the file lie. Rungs that
 * have not been used stay available, and the preview said in words which ones
 * those are.
 */
export async function applyAnchorChange(
  dealId: string,
  accountId: string,
  proposed: Anchors,
  userId: string,
  actor: string,
  state: string,
  timezone: string,
  settings: unknown,
): Promise<ApplyResult | null> {
  const db = getDb();
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)));
  if (!deal) return null;

  const preview = await previewAnchorChange(dealId, accountId, proposed, state, timezone, settings);
  if (!preview) return null;

  const template = deal.templateId
    ? (await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, deal.templateId)))[0]
    : undefined;
  const templateTasks = template ? parseTemplateTasks(template.tasks) : [];
  const holidays = await loadHolidayMap(state);
  const next = preview.nextAnchors;
  const after = computeAll(datedTasks(templateTasks), next, holidays);

  const existing = await db.select().from(criticalDates).where(eq(criticalDates.dealId, deal.id));
  const existingByKey = new Map(existing.map((d) => [d.key, d]));
  const taskRows = await db
    .select({ id: tasks.id, key: tasks.key })
    .from(tasks)
    .where(eq(tasks.dealId, deal.id));
  const taskIdByKey = new Map(taskRows.map((t) => [t.key, t.id]));

  let moved = 0;
  let created = 0;
  let removed = 0;

  await db
    .update(deals)
    .set({
      contractDate: next.contract_date ?? null,
      acceptanceDate: next.acceptance_date ?? null,
      closingDate: next.closing_date ?? null,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, deal.id));

  for (const computed of after) {
    const row = existingByKey.get(computed.key);
    if (computed.dueOn === null) {
      // The rule stopped resolving. Drop the row rather than leave a stale date
      // on the timeline; the checklist still shows the task with its rule
      // sentence and "needs a date".
      if (row) {
        await db.delete(reminders).where(eq(reminders.criticalDateId, row.id));
        await db.delete(criticalDates).where(eq(criticalDates.id, row.id));
        removed += 1;
      }
      continue;
    }
    if (!row) {
      await db.insert(criticalDates).values({
        dealId: deal.id,
        taskId: taskIdByKey.get(computed.key) ?? null,
        key: computed.key,
        label: computed.label,
        rule: computed.rule,
        dueOn: computed.dueOn,
        computedFrom: { ...computed.computedFrom, sentence: computed.sentence },
      });
      created += 1;
      continue;
    }
    if (row.dueOn !== computed.dueOn || sentenceOf(row.computedFrom, "") !== computed.sentence) {
      if (row.dueOn !== computed.dueOn) moved += 1;
      await db
        .update(criticalDates)
        .set({
          dueOn: computed.dueOn,
          label: computed.label,
          rule: computed.rule,
          computedFrom: { ...computed.computedFrom, sentence: computed.sentence },
          updatedAt: new Date(),
        })
        .where(eq(criticalDates.id, row.id));
    }
  }

  const primary = preview.changed[0];
  const [recompute] = await db
    .insert(dateRecomputes)
    .values({
      dealId: deal.id,
      changedAnchor: primary ? primary.anchor : "contract_date",
      oldValue: primary?.from ?? null,
      newValue: primary?.to ?? next.contract_date ?? next.closing_date ?? "1970-01-01",
      diff: preview.diff,
      appliedBy: userId,
    })
    .returning();

  const anchorSummary = preview.changed
    .map(
      (c) =>
        `${ANCHOR_LABELS[c.anchor]} ${c.from ? formatShort(c.from) : "not set"} → ${
          c.to ? formatShort(c.to) : "not set"
        }`,
    )
    .join("; ");
  await logActivity({
    dealId: deal.id,
    actor,
    action: "anchors_applied",
    target: anchorSummary || "no anchor change",
    metadata: {
      detail: `${anchorSummary || "No anchor change"} — ${moved} dates moved${
        created ? `, ${created} added` : ""
      }${removed ? `, ${removed} now need a date` : ""}`,
      recomputeId: recompute.id,
    },
  });

  return { moved, created, removed, recomputeId: recompute.id };
}

/* ------------------------------------------------------------ small updates */

export async function setDealStatus(
  dealId: string,
  accountId: string,
  status: DealStatus,
  actor: string,
): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(deals)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)))
    .returning({ id: deals.id, address: deals.address });
  if (updated.length === 0) return false;
  await logActivity({
    dealId,
    actor,
    action: "deal_status",
    target: DEAL_STATUS_LABELS[status],
    metadata: { detail: `Status set to ${DEAL_STATUS_LABELS[status]}` },
  });
  return true;
}

export async function setTaskStatus(
  dealId: string,
  accountId: string,
  taskId: string,
  status: Task["status"],
  userId: string,
  actor: string,
): Promise<boolean> {
  const db = getDb();
  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)));
  if (!deal) return false;

  const updated = await db
    .update(tasks)
    .set({
      status,
      completedAt: status === "done" ? new Date() : null,
      completedBy: status === "done" ? userId : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.dealId, dealId)))
    .returning({ id: tasks.id, label: tasks.label });
  if (updated.length === 0) return false;

  // A task marked done marks its date met, and vice versa — one action, both
  // views. Anything else and the timeline disagrees with the checklist.
  if (status === "done") {
    await db
      .update(criticalDates)
      .set({ status: "met", metAt: new Date(), updatedAt: new Date() })
      .where(and(eq(criticalDates.taskId, taskId), eq(criticalDates.dealId, dealId)));
  } else if (status === "na") {
    await db
      .update(criticalDates)
      .set({ status: "waived", updatedAt: new Date() })
      .where(and(eq(criticalDates.taskId, taskId), eq(criticalDates.dealId, dealId)));
  } else {
    await db
      .update(criticalDates)
      .set({ status: "upcoming", metAt: null, updatedAt: new Date() })
      .where(and(eq(criticalDates.taskId, taskId), eq(criticalDates.dealId, dealId)));
  }

  const labels: Record<Task["status"], string> = {
    todo: "back to to-do",
    waiting: "waiting on someone",
    done: "done",
    na: "not applicable",
  };
  await logActivity({
    dealId,
    actor,
    action: "task_status",
    target: updated[0].label,
    metadata: { detail: `${updated[0].label} — ${labels[status]}` },
  });
  return true;
}

export async function setDateStatus(
  dealId: string,
  accountId: string,
  dateId: string,
  status: CriticalDate["status"],
  actor: string,
): Promise<boolean> {
  const db = getDb();
  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)));
  if (!deal) return false;
  const updated = await db
    .update(criticalDates)
    .set({
      status,
      metAt: status === "met" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(criticalDates.id, dateId), eq(criticalDates.dealId, dealId)))
    .returning({ label: criticalDates.label });
  if (updated.length === 0) return false;
  await logActivity({
    dealId,
    actor,
    action: "date_status",
    target: updated[0].label,
    metadata: { detail: `${updated[0].label} marked ${status}` },
  });
  return true;
}

export async function updateCommission(
  dealId: string,
  accountId: string,
  priceCents: number | null,
  basis: CommissionBasis,
  actor: string,
): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(deals)
    .set({ priceCents, commission: basis, updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)))
    .returning({ id: deals.id });
  if (updated.length === 0) return false;
  await logActivity({
    dealId,
    actor,
    action: "commission_updated",
    target: "Commission basis",
    metadata: { detail: `Rate ${(basis.rateBps / 100).toFixed(2)}%, ${basis.split.length} splits` },
  });
  return true;
}

export async function addNote(
  dealId: string,
  accountId: string,
  body: string,
  actor: string,
): Promise<boolean> {
  const trimmed = body.trim();
  if (!trimmed) return false;
  const db = getDb();
  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)));
  if (!deal) return false;
  await logActivity({
    dealId,
    actor,
    action: "note",
    target: trimmed.slice(0, 120),
    metadata: { body: trimmed },
  });
  return true;
}

/* ------------------------------------------------------------- the pipeline */

export interface PipelineDate {
  id: string;
  key: string;
  label: string;
  dueOn: string;
  status: DisplayDateStatus;
  sentence: string;
}

export interface PipelineRow {
  deal: Deal;
  dates: PipelineDate[];
  nextDate: PipelineDate | null;
  atRisk: PipelineDate[];
  missed: PipelineDate[];
}

export async function loadPipeline(
  accountId: string,
  timezone: string,
  options: { statuses?: readonly DealStatus[] } = {},
): Promise<{ today: string; rows: PipelineRow[] }> {
  const db = getDb();
  const today = todayInZone(timezone);
  const statuses = options.statuses ?? DEAL_STATUS_ORDER;
  const dealRows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.accountId, accountId), inArray(deals.status, [...statuses])))
    .orderBy(asc(deals.closingDate), asc(deals.address));
  if (dealRows.length === 0) return { today, rows: [] };

  const dateRows = await db
    .select()
    .from(criticalDates)
    .where(inArray(criticalDates.dealId, dealRows.map((d) => d.id)))
    .orderBy(asc(criticalDates.dueOn));

  const byDeal = new Map<string, PipelineDate[]>();
  for (const d of dateRows) {
    const list = byDeal.get(d.dealId) ?? [];
    const rule = ruleOf(d.rule);
    list.push({
      id: d.id,
      key: d.key,
      label: d.label,
      dueOn: d.dueOn,
      status: displayStatus({ dueOn: d.dueOn, status: d.status }, today),
      sentence: sentenceOf(d.computedFrom, `${ANCHOR_LABELS[rule.anchor]} + ${rule.offsetDays} days`),
    });
    byDeal.set(d.dealId, list);
  }

  const rows: PipelineRow[] = dealRows.map((deal) => {
    const dates = byDeal.get(deal.id) ?? [];
    const open = dates.filter((d) => d.status === "upcoming" || d.status === "at_risk");
    return {
      deal,
      dates,
      nextDate: open[0] ?? null,
      atRisk: dates.filter((d) => d.status === "at_risk"),
      missed: dates.filter((d) => d.status === "missed"),
    };
  });

  // Sort by the soonest open date; files with nothing left fall to the bottom.
  rows.sort((a, b) => {
    const ad = a.nextDate?.dueOn ?? "9999-12-31";
    const bd = b.nextDate?.dueOn ?? "9999-12-31";
    return ad.localeCompare(bd) || a.deal.address.localeCompare(b.deal.address);
  });

  return { today, rows };
}

export async function countOpenDeals(accountId: string): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(deals)
    .where(and(eq(deals.accountId, accountId), inArray(deals.status, [...OPEN_STATUSES])));
  return Number(row?.value ?? 0);
}

export async function accountTemplates(accountId: string) {
  return getDb()
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.accountId, accountId))
    .orderBy(asc(checklistTemplates.contractType), asc(checklistTemplates.name));
}

/** Deals for the commission pipeline, cheapest possible read. */
export async function commissionDeals(accountId: string) {
  return getDb()
    .select({
      id: deals.id,
      address: deals.address,
      status: deals.status,
      closingDate: deals.closingDate,
      priceCents: deals.priceCents,
      commission: deals.commission,
    })
    .from(deals)
    .where(eq(deals.accountId, accountId))
    .orderBy(asc(deals.closingDate));
}

/**
 * The at-risk rail: every date inside the at-risk window or already missed,
 * across the whole desk. Ordered soonest first — a coordinator reads this list
 * top-down and stops when it runs out.
 */
export async function atRiskRail(accountId: string, timezone: string) {
  const { today, rows } = await loadPipeline(accountId, timezone, { statuses: OPEN_STATUSES });
  const items = rows.flatMap((row) =>
    [...row.missed, ...row.atRisk].map((date) => ({
      dealId: row.deal.id,
      address: row.deal.address,
      date,
    })),
  );
  items.sort((a, b) => a.date.dueOn.localeCompare(b.date.dueOn));
  return { today, items };
}

/** Guard for anything that writes: the deal must be on this account. */
export async function dealBelongsToAccount(dealId: string, accountId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, accountId)));
  return Boolean(row);
}

export { anchorsOf };
export type { Anchors };

/** Used by the packet export: the deal's activity, oldest first. */
export async function dealActivityAsc(dealId: string) {
  return getDb()
    .select()
    .from(activityLog)
    .where(eq(activityLog.dealId, dealId))
    .orderBy(asc(activityLog.occurredAt));
}
