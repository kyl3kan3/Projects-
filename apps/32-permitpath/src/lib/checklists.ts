/**
 * The checklist engine: a requirement record becomes a concrete, per-job list of
 * things to do, pinned to the record version it was generated from.
 *
 * The pin is the whole point. A rule change three weeks into a job must never
 * silently rewrite the checklist the crew is working from — it raises a banner
 * and lets the office decide. `isStale` and `regenerateChecklist` are that
 * decision, and regeneration keeps every stamp whose item still exists.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checklistItems,
  jobs,
  jurisdictions,
  permitChecklists,
  requirementRecords,
  type ChecklistItem,
  type ChecklistItemKind,
  type Jurisdiction,
  type PermitChecklist,
  type RequirementRecord,
  type VerificationState,
} from "@/db/schema";
import { appError } from "@/lib/errors";
import { money, totalCents } from "@/lib/format";
import { jobTypeLabel } from "@/lib/taxonomy";

export interface PlannedItem {
  slug: string;
  kind: ChecklistItemKind;
  title: string;
  detail: string;
  position: number;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * Expand a record into checklist items. Pure: same record in, same list out,
 * which is what makes regeneration safe to diff against the stamped state.
 */
export function planChecklistItems(
  record: Pick<
    RequirementRecord,
    | "permitsRequired"
    | "submittalRequirements"
    | "fees"
    | "reviewTimeline"
    | "inspectionSequence"
    | "inspectionContact"
    | "inspectionLeadTimeDays"
    | "reinspectionFeeCents"
    | "jobType"
  >,
  jurisdiction: Pick<Jurisdiction, "name" | "departmentName">,
): PlannedItem[] {
  const items: PlannedItem[] = [];
  let position = 0;

  for (const permit of record.permitsRequired) {
    items.push({
      slug: `permit:${slugify(permit)}`,
      kind: "permit",
      title: permit,
      detail: `${jurisdiction.name} ${jurisdiction.departmentName} — ${record.reviewTimeline}`,
      position: position++,
    });
  }

  for (const submittal of record.submittalRequirements) {
    items.push({
      slug: `doc:${slugify(submittal.title)}`,
      kind: "document",
      title: submittal.title,
      detail: submittal.required ? submittal.detail : `Conditional — ${submittal.detail}`,
      position: position++,
    });
  }

  if (record.fees.length > 0) {
    const total = totalCents(record.fees);
    items.push({
      slug: "fee:permit-fees",
      kind: "fee",
      title: `Permit fees — ${money(total)}`,
      detail: record.fees.map((f) => `${f.label} ${money(f.amountCents)}`).join(" · "),
      position: position++,
    });
  }

  for (const inspection of record.inspectionSequence) {
    const lead =
      record.inspectionLeadTimeDays === null || record.inspectionLeadTimeDays === undefined
        ? null
        : record.inspectionLeadTimeDays === 0
          ? "no scheduled inspection"
          : `book ${record.inspectionLeadTimeDays} day${record.inspectionLeadTimeDays === 1 ? "" : "s"} ahead`;
    const reinspection =
      record.reinspectionFeeCents && record.reinspectionFeeCents > 0
        ? `reinspection ${money(record.reinspectionFeeCents)}`
        : null;
    const detail = [record.inspectionContact, lead, reinspection].filter(Boolean).join(" · ");
    items.push({
      slug: `insp:${slugify(inspection)}`,
      kind: "inspection_note",
      title: `Book ${inspection.toLowerCase()}`,
      detail: detail || "Scheduling details not recorded for this jurisdiction",
      position: position++,
    });
  }

  items.push({
    slug: "license:contractor",
    kind: "license_check",
    title: "Contractor licence current at submittal",
    detail: `Classification is checked at intake for ${jobTypeLabel(record.jobType)} work — a lapsed licence stops the permit, not the job`,
    position: position++,
  });

  return items;
}

export interface ChecklistProgress {
  verified: number;
  /** Items that still need a decision; n/a items leave the denominator. */
  total: number;
  naCount: number;
  complete: boolean;
}

export function checklistProgress(items: Pick<ChecklistItem, "state">[]): ChecklistProgress {
  const naCount = items.filter((i) => i.state === "na").length;
  const verified = items.filter((i) => i.state === "verified").length;
  const total = items.length - naCount;
  return { verified, total, naCount, complete: total > 0 && verified === total };
}

export interface ChecklistBundle {
  checklist: PermitChecklist;
  items: ChecklistItem[];
  record: RequirementRecord;
  progress: ChecklistProgress;
  /** A newer version of the pinned record exists. */
  stale: boolean;
  currentRecordId: string | null;
}

/** Generate the checklist for a job, pinned to the record current right now. */
export async function generateChecklist(jobId: string): Promise<PermitChecklist> {
  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw appError("That job could not be found");

  const [existing] = await db
    .select()
    .from(permitChecklists)
    .where(eq(permitChecklists.jobId, jobId));
  if (existing) return existing;

  const [record] = await db
    .select()
    .from(requirementRecords)
    .where(
      and(
        eq(requirementRecords.jurisdictionId, job.jurisdictionId),
        eq(requirementRecords.jobType, job.jobType),
        isNull(requirementRecords.supersededBy),
      ),
    );
  if (!record) {
    throw appError(
      "No verified requirements for that jurisdiction and job type yet — we filed a coverage request",
    );
  }

  const [jurisdiction] = await db
    .select()
    .from(jurisdictions)
    .where(eq(jurisdictions.id, job.jurisdictionId));

  const [checklist] = await db
    .insert(permitChecklists)
    .values({ jobId, requirementRecordId: record.id })
    .returning();

  const planned = planChecklistItems(record, jurisdiction);
  if (planned.length > 0) {
    await db.insert(checklistItems).values(
      planned.map((p) => ({
        checklistId: checklist.id,
        kind: p.kind,
        title: p.title,
        detail: p.detail,
        position: p.position,
        slug: p.slug,
      })),
    );
  }
  return checklist;
}

/** Load a checklist with its items, pinned record, progress, and staleness. */
export async function loadChecklist(jobId: string): Promise<ChecklistBundle | null> {
  const db = getDb();
  const [checklist] = await db
    .select()
    .from(permitChecklists)
    .where(eq(permitChecklists.jobId, jobId));
  if (!checklist) return null;

  const [record] = await db
    .select()
    .from(requirementRecords)
    .where(eq(requirementRecords.id, checklist.requirementRecordId));

  const items = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, checklist.id))
    .orderBy(asc(checklistItems.position));

  const [current] = await db
    .select({ id: requirementRecords.id })
    .from(requirementRecords)
    .where(
      and(
        eq(requirementRecords.jurisdictionId, record.jurisdictionId),
        eq(requirementRecords.jobType, record.jobType),
        isNull(requirementRecords.supersededBy),
      ),
    );

  return {
    checklist,
    items,
    record,
    progress: checklistProgress(items),
    stale: Boolean(current && current.id !== record.id),
    currentRecordId: current?.id ?? null,
  };
}

/**
 * Set an item's state. Verification stamps who and when — those two fields are
 * what the row's recency label and the stamp animation read.
 */
export async function setItemState(
  itemId: string,
  state: VerificationState,
  userId: string,
  naReason?: string | null,
): Promise<ChecklistItem> {
  const db = getDb();
  const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
  if (!item) throw appError("That checklist item could not be found");

  const [updated] = await db
    .update(checklistItems)
    .set({
      state,
      naReason: state === "na" ? (naReason ?? "Not applicable to this scope") : null,
      // The database stamps the time so the recency label cannot inherit a
      // wrong clock from whichever machine served the request.
      verifiedAt: state === "open" ? null : sql`now()`,
      verifiedByUserId: state === "open" ? null : userId,
    })
    .where(eq(checklistItems.id, itemId))
    .returning();

  await refreshFullyStamped(item.checklistId);
  return updated;
}

/** Recompute the "ready to submit" moment after any item changes state. */
async function refreshFullyStamped(checklistId: string): Promise<void> {
  const db = getDb();
  const items = await db
    .select({ state: checklistItems.state })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, checklistId));
  const { complete } = checklistProgress(items);
  const [checklist] = await db
    .select()
    .from(permitChecklists)
    .where(eq(permitChecklists.id, checklistId));
  if (!checklist) return;

  if (complete && !checklist.fullyStampedAt) {
    await db
      .update(permitChecklists)
      .set({ fullyStampedAt: sql`now()` })
      .where(eq(permitChecklists.id, checklistId));
  } else if (!complete && checklist.fullyStampedAt) {
    await db
      .update(permitChecklists)
      .set({ fullyStampedAt: null })
      .where(eq(permitChecklists.id, checklistId));
  }
}

export interface RegenerationSummary {
  added: number;
  removed: number;
  keptStamps: number;
}

/**
 * Re-pin a checklist to the current record version, keeping the stamps on items
 * that still exist. Items are matched by slug, which is why the slug is derived
 * from the requirement itself rather than from a row id.
 */
export async function regenerateChecklist(jobId: string): Promise<RegenerationSummary> {
  const db = getDb();
  const bundle = await loadChecklist(jobId);
  if (!bundle) throw appError("That job has no checklist to regenerate");
  if (!bundle.currentRecordId) throw appError("That jurisdiction no longer has a current record");

  const [current] = await db
    .select()
    .from(requirementRecords)
    .where(eq(requirementRecords.id, bundle.currentRecordId));
  const [jurisdiction] = await db
    .select()
    .from(jurisdictions)
    .where(eq(jurisdictions.id, current.jurisdictionId));

  const planned = planChecklistItems(current, jurisdiction);
  const plannedBySlug = new Map(planned.map((p) => [p.slug, p]));
  const existingBySlug = new Map(bundle.items.map((i) => [i.slug, i]));

  const removedIds = bundle.items.filter((i) => !plannedBySlug.has(i.slug)).map((i) => i.id);
  let keptStamps = 0;
  let added = 0;

  await db.transaction(async (tx) => {
    if (removedIds.length > 0) {
      await tx.delete(checklistItems).where(inArray(checklistItems.id, removedIds));
    }

    for (const item of planned) {
      const existing = existingBySlug.get(item.slug);
      if (existing) {
        if (existing.state !== "open") keptStamps += 1;
        await tx
          .update(checklistItems)
          .set({ title: item.title, detail: item.detail, position: item.position, kind: item.kind })
          .where(eq(checklistItems.id, existing.id));
      } else {
        await tx.insert(checklistItems).values({
          checklistId: bundle.checklist.id,
          kind: item.kind,
          title: item.title,
          detail: item.detail,
          position: item.position,
          slug: item.slug,
        });
        added += 1;
      }
    }

    await tx
      .update(permitChecklists)
      .set({ requirementRecordId: current.id, generatedAt: sql`now()` })
      .where(eq(permitChecklists.id, bundle.checklist.id));
  });

  await refreshFullyStamped(bundle.checklist.id);
  return { added, removed: removedIds.length, keptStamps };
}
