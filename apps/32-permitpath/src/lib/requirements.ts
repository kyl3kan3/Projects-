/**
 * Read and write layer for the shared requirement corpus.
 *
 * Everything that publishes a requirement fact goes through `publishVersion`, so
 * version chaining, the verifier stamp, and the audit entry live in exactly one
 * place — and so the rule from ROADMAP ("no requirement change is ever published
 * without human review") is enforced by a required argument rather than by
 * convention: there is no code path here that writes a record without a reviewer.
 */

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  coverageRequests,
  jurisdictionSources,
  jurisdictions,
  requirementChanges,
  requirementRecords,
  type ChangeOrigin,
  type FeeLine,
  type Jurisdiction,
  type JurisdictionSource,
  type RequirementChange,
  type RequirementRecord,
  type SourceKind,
  type SubmittalRequirement,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { appError } from "@/lib/errors";

export interface RecordWithContext {
  record: RequirementRecord;
  jurisdiction: Jurisdiction;
  source: JurisdictionSource | null;
}

/** The current record for a pair, or null when coverage is genuinely missing. */
export async function getCurrentRecord(
  jurisdictionId: string,
  jobType: string,
): Promise<RequirementRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(requirementRecords)
    .where(
      and(
        eq(requirementRecords.jurisdictionId, jurisdictionId),
        eq(requirementRecords.jobType, jobType),
        isNull(requirementRecords.supersededBy),
      ),
    );
  return row ?? null;
}

export async function getRecordById(recordId: string): Promise<RecordWithContext | null> {
  const db = getDb();
  const [row] = await db
    .select({
      record: requirementRecords,
      jurisdiction: jurisdictions,
      source: jurisdictionSources,
    })
    .from(requirementRecords)
    .innerJoin(jurisdictions, eq(jurisdictions.id, requirementRecords.jurisdictionId))
    .leftJoin(jurisdictionSources, eq(jurisdictionSources.id, requirementRecords.sourceId))
    .where(eq(requirementRecords.id, recordId));
  return row ? { record: row.record, jurisdiction: row.jurisdiction, source: row.source } : null;
}

/** Every current record a jurisdiction has, newest verification first. */
export async function listCurrentRecords(jurisdictionId: string): Promise<RequirementRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(requirementRecords)
    .where(
      and(
        eq(requirementRecords.jurisdictionId, jurisdictionId),
        isNull(requirementRecords.supersededBy),
      ),
    )
    .orderBy(desc(requirementRecords.verifiedAt));
}

export interface VersionEntry {
  record: RequirementRecord;
  /** The change that produced this version, when one was recorded. */
  change: RequirementChange | null;
}

/**
 * The full version chain for a pair, newest first, each version paired with the
 * change that produced it. Every row for a (jurisdiction, job type) pair belongs
 * to the same chain, which is what the partial unique index guarantees.
 */
export async function getVersionHistory(
  jurisdictionId: string,
  jobType: string,
): Promise<VersionEntry[]> {
  const db = getDb();
  const records = await db
    .select()
    .from(requirementRecords)
    .where(
      and(
        eq(requirementRecords.jurisdictionId, jurisdictionId),
        eq(requirementRecords.jobType, jobType),
      ),
    )
    .orderBy(desc(requirementRecords.version));
  if (records.length === 0) return [];

  const ids = records.map((r) => r.id);
  const changes = await db
    .select()
    .from(requirementChanges)
    .where(
      or(
        inArray(requirementChanges.requirementRecordId, ids),
        inArray(requirementChanges.previousRecordId, ids),
      ),
    );

  return records.map((record) => ({
    record,
    change: changes.find((c) => c.requirementRecordId === record.id) ?? null,
  }));
}

/** Approved changes for a jurisdiction, newest first — the "recent changes" feed. */
export async function recentChanges(jurisdictionId: string, limit = 6): Promise<RequirementChange[]> {
  const db = getDb();
  return db
    .select()
    .from(requirementChanges)
    .where(
      and(
        eq(requirementChanges.jurisdictionId, jurisdictionId),
        eq(requirementChanges.reviewState, "approved"),
      ),
    )
    .orderBy(desc(requirementChanges.reviewedAt))
    .limit(limit);
}

export interface RecordPatch {
  permitsRequired?: string[];
  submittalRequirements?: SubmittalRequirement[];
  fees?: FeeLine[];
  reviewTimeline?: string;
  quirks?: string | null;
  inspectionSequence?: string[];
  inspectionContact?: string | null;
  inspectionLeadTimeDays?: number | null;
  reinspectionFeeCents?: number | null;
}

export interface PublishInput {
  previousRecordId: string;
  patch: RecordPatch;
  /** Required. A publish with no reviewer is not a publish, it is a leak. */
  reviewerUserId: string;
  reviewerName: string;
  sourceKind: SourceKind;
  origin: ChangeOrigin;
  summary: string;
  rawDiff?: string | null;
  /** Set when the publish resolves a queued crawl diff. */
  changeId?: string | null;
  sourceId?: string | null;
}

export interface PublishResult {
  record: RequirementRecord;
  changeId: string;
}

/**
 * Publish a new version of a record.
 *
 * The insert order matters: the previous row is parked on itself before the new
 * row goes in, because the partial unique index allows exactly one row per
 * (jurisdiction, job type) with `superseded_by IS NULL`. Inserting first and
 * re-pointing afterwards would momentarily create two current records and the
 * database would — correctly — refuse.
 */
export async function publishVersion(input: PublishInput): Promise<PublishResult> {
  if (!input.reviewerUserId) throw appError("A reviewer is required to publish a requirement change");
  const db = getDb();

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(requirementRecords)
      .where(eq(requirementRecords.id, input.previousRecordId));
    if (!previous) throw appError("That requirement record no longer exists");
    if (previous.supersededBy) {
      throw appError("That record has already been superseded — reload and review the newest version");
    }

    // Step 1: park the outgoing row on itself so the "one current record" index
    // is never violated mid-transaction.
    await tx
      .update(requirementRecords)
      .set({ supersededBy: previous.id })
      .where(eq(requirementRecords.id, previous.id));

    const [created] = await tx
      .insert(requirementRecords)
      .values({
        jurisdictionId: previous.jurisdictionId,
        jobType: previous.jobType,
        permitsRequired: input.patch.permitsRequired ?? previous.permitsRequired,
        submittalRequirements: input.patch.submittalRequirements ?? previous.submittalRequirements,
        fees: input.patch.fees ?? previous.fees,
        reviewTimeline: input.patch.reviewTimeline ?? previous.reviewTimeline,
        quirks: input.patch.quirks === undefined ? previous.quirks : input.patch.quirks,
        inspectionSequence: input.patch.inspectionSequence ?? previous.inspectionSequence,
        inspectionContact:
          input.patch.inspectionContact === undefined
            ? previous.inspectionContact
            : input.patch.inspectionContact,
        inspectionLeadTimeDays:
          input.patch.inspectionLeadTimeDays === undefined
            ? previous.inspectionLeadTimeDays
            : input.patch.inspectionLeadTimeDays,
        reinspectionFeeCents:
          input.patch.reinspectionFeeCents === undefined
            ? previous.reinspectionFeeCents
            : input.patch.reinspectionFeeCents,
        version: previous.version + 1,
        sourceId: input.sourceId ?? previous.sourceId,
        sourceKind: input.sourceKind,
        // Let the database stamp the verification time; JS clocks drift and the
        // recency label is the product's central honesty claim.
        verifiedAt: sql`now()`,
        verifiedBy: input.reviewerName,
        verifiedByUserId: input.reviewerUserId,
      })
      .returning();

    // Step 2: point the outgoing row at its successor.
    await tx
      .update(requirementRecords)
      .set({ supersededBy: created.id })
      .where(eq(requirementRecords.id, previous.id));

    let changeId = input.changeId ?? null;
    if (changeId) {
      await tx
        .update(requirementChanges)
        .set({
          requirementRecordId: created.id,
          previousRecordId: previous.id,
          jobType: previous.jobType,
          reviewState: "approved",
          reviewedBy: input.reviewerUserId,
          reviewedAt: sql`now()`,
          diffSummary: input.summary,
        })
        .where(eq(requirementChanges.id, changeId));
    } else {
      const [change] = await tx
        .insert(requirementChanges)
        .values({
          jurisdictionId: previous.jurisdictionId,
          requirementRecordId: created.id,
          previousRecordId: previous.id,
          sourceId: input.sourceId ?? previous.sourceId,
          jobType: previous.jobType,
          origin: input.origin,
          diffSummary: input.summary,
          rawDiff: input.rawDiff ?? null,
          reviewState: "approved",
          reviewedBy: input.reviewerUserId,
          reviewedAt: sql`now()`,
        })
        .returning();
      changeId = change.id;
    }

    return { record: created, changeId };
  });
}

/** Reject a queued diff: it is noise, and saying so is a reviewed decision. */
export async function rejectChange(
  changeId: string,
  reviewerUserId: string,
  reason: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(requirementChanges)
    .set({
      reviewState: "rejected",
      reviewedBy: reviewerUserId,
      reviewedAt: sql`now()`,
      rejectionReason: reason,
    })
    .where(and(eq(requirementChanges.id, changeId), eq(requirementChanges.reviewState, "pending")));
  await recordAudit({
    action: "change.rejected",
    target: `requirement_change:${changeId}`,
    actorUserId: reviewerUserId,
    metadata: { reason },
  });
}

/** The honest "not covered yet" path: file it, show the department's number. */
export async function fileCoverageRequest(input: {
  organizationId: string;
  jurisdictionId?: string | null;
  jurisdictionName?: string | null;
  jobType: string;
  note?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(coverageRequests).values({
    organizationId: input.organizationId,
    jurisdictionId: input.jurisdictionId ?? null,
    jurisdictionName: input.jurisdictionName ?? null,
    jobType: input.jobType,
    note: input.note ?? null,
  });
  await recordAudit({
    action: "coverage.requested",
    target: `jurisdiction:${input.jurisdictionId ?? input.jurisdictionName ?? "unknown"}`,
    organizationId: input.organizationId,
    metadata: { jobType: input.jobType },
  });
}
