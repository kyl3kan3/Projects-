/**
 * Crowdsourced edits: suggest-an-edit, the moderation queue, and what acceptance
 * actually does.
 *
 * The paid-credit loop only stays honest because nothing here publishes without a
 * moderator: `acceptContribution` calls `publishVersion`, which requires a
 * reviewer id. A contributor's proposal is data until a curator's name goes on it.
 */

import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contributions,
  jurisdictions,
  organizations,
  requirementRecords,
  users,
  type Contribution,
  type ProposedChanges,
  type RequirementRecord,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { appError } from "@/lib/errors";
import { CONTRIBUTION_CREDIT_CENTS } from "@/lib/plans";
import { publishVersion } from "@/lib/requirements";

const feeLineSchema = z.object({
  label: z.string().min(2).max(80),
  amountCents: z.number().int().min(0).max(100_000_00),
  notes: z.string().max(160).optional(),
});

const submittalSchema = z.object({
  title: z.string().min(2).max(80),
  detail: z.string().min(2).max(240),
  required: z.boolean(),
});

/**
 * What a contributor may propose. Anything outside this shape is rejected at the
 * edge: a suggestion is structured data, not free-form JSON we later trust.
 */
export const proposedChangesSchema = z
  .object({
    reviewTimeline: z.string().min(2).max(120).optional(),
    quirks: z.string().min(2).max(1_200).optional(),
    fees: z.array(feeLineSchema).min(1).max(12).optional(),
    submittalRequirements: z.array(submittalSchema).min(1).max(16).optional(),
    permitsRequired: z.array(z.string().min(2).max(80)).max(6).optional(),
    inspectionContact: z.string().min(2).max(240).optional(),
    inspectionLeadTimeDays: z.number().int().min(0).max(60).optional(),
    reinspectionFeeCents: z.number().int().min(0).max(500_00).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Describe at least one thing that should change",
  });

export type ContributionImpact = "fee_or_permit" | "process" | "wording";

/**
 * Queue ordering: a wrong fee or a missing permit costs a contractor money today;
 * a reworded quirk does not. The moderation queue sorts on this.
 */
export function contributionImpact(changes: ProposedChanges): ContributionImpact {
  if (changes.fees || changes.permitsRequired) return "fee_or_permit";
  if (changes.submittalRequirements || changes.reviewTimeline) return "process";
  return "wording";
}

const IMPACT_RANK: Record<ContributionImpact, number> = {
  fee_or_permit: 0,
  process: 1,
  wording: 2,
};

export const IMPACT_LABEL: Record<ContributionImpact, string> = {
  fee_or_permit: "Fee or permit",
  process: "Process",
  wording: "Wording",
};

export async function submitContribution(input: {
  userId: string;
  organizationId: string;
  recordId: string;
  proposedChanges: unknown;
  evidence: string;
}): Promise<Contribution> {
  const parsed = proposedChangesSchema.safeParse(input.proposedChanges);
  if (!parsed.success) {
    throw appError(parsed.error.issues[0]?.message ?? "That suggestion could not be read");
  }
  const evidence = input.evidence.trim();
  if (evidence.length < 10) {
    throw appError("Say how you know — a phone call, a rejection letter, or a link");
  }

  const db = getDb();
  const [record] = await db
    .select({ id: requirementRecords.id, supersededBy: requirementRecords.supersededBy })
    .from(requirementRecords)
    .where(eq(requirementRecords.id, input.recordId));
  if (!record) throw appError("That requirement record could not be found");
  if (record.supersededBy) {
    throw appError("That version has been superseded — open the current record and suggest there");
  }

  const [user] = await db
    .select({ reputation: users.contributorReputation })
    .from(users)
    .where(eq(users.id, input.userId));

  const [created] = await db
    .insert(contributions)
    .values({
      userId: input.userId,
      organizationId: input.organizationId,
      requirementRecordId: input.recordId,
      proposedChanges: parsed.data,
      evidence,
      reputationAtSubmit: user?.reputation ?? 0,
    })
    .returning();

  await recordAudit({
    action: "contribution.submitted",
    target: `requirement_record:${input.recordId}`,
    organizationId: input.organizationId,
    actorUserId: input.userId,
    metadata: { contributionId: created.id, impact: contributionImpact(parsed.data) },
  });

  return created;
}

export interface QueuedContribution {
  contribution: Contribution;
  record: RequirementRecord;
  jurisdictionName: string;
  jurisdictionSlug: string;
  contributorEmail: string;
  contributorName: string | null;
  organizationName: string;
  impact: ContributionImpact;
}

export async function listModerationQueue(limit = 40): Promise<QueuedContribution[]> {
  const db = getDb();
  const rows = await db
    .select({
      contribution: contributions,
      record: requirementRecords,
      jurisdiction: jurisdictions,
      user: users,
      organization: organizations,
    })
    .from(contributions)
    .innerJoin(requirementRecords, eq(requirementRecords.id, contributions.requirementRecordId))
    .innerJoin(jurisdictions, eq(jurisdictions.id, requirementRecords.jurisdictionId))
    .innerJoin(users, eq(users.id, contributions.userId))
    .innerJoin(organizations, eq(organizations.id, contributions.organizationId))
    .where(eq(contributions.reviewState, "pending"))
    .orderBy(contributions.createdAt)
    .limit(limit);

  return rows
    .map((row) => ({
      contribution: row.contribution,
      record: row.record,
      jurisdictionName: row.jurisdiction.name,
      jurisdictionSlug: row.jurisdiction.slug,
      contributorEmail: row.user.email,
      contributorName: row.user.name,
      organizationName: row.organization.name,
      impact: contributionImpact(row.contribution.proposedChanges),
    }))
    .sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]);
}

/** A contributor's own suggestions, for the record page and their credit line. */
export async function listOrgContributions(organizationId: string, limit = 20): Promise<
  { contribution: Contribution; jurisdictionName: string; jobType: string }[]
> {
  const db = getDb();
  const rows = await db
    .select({ contribution: contributions, jurisdiction: jurisdictions, record: requirementRecords })
    .from(contributions)
    .innerJoin(requirementRecords, eq(requirementRecords.id, contributions.requirementRecordId))
    .innerJoin(jurisdictions, eq(jurisdictions.id, requirementRecords.jurisdictionId))
    .where(eq(contributions.organizationId, organizationId))
    .orderBy(desc(contributions.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    contribution: r.contribution,
    jurisdictionName: r.jurisdiction.name,
    jobType: r.record.jobType,
  }));
}

export interface AcceptResult {
  contribution: Contribution;
  newRecordId: string;
  changeId: string;
  creditCents: number;
}

/**
 * Accept a suggestion: publish a new version citing the contribution as its
 * source, credit the contributor's org, and raise their reputation.
 *
 * The credit lands on the organization's balance in integer cents. How much of it
 * a given invoice may absorb is a billing question (50% cap, see lib/plans), and
 * it is answered there rather than by shrinking the award here.
 */
export async function acceptContribution(input: {
  contributionId: string;
  reviewerUserId: string;
  reviewerName: string;
}): Promise<AcceptResult> {
  const db = getDb();
  const [contribution] = await db
    .select()
    .from(contributions)
    .where(eq(contributions.id, input.contributionId));
  if (!contribution) throw appError("That contribution could not be found");
  if (contribution.reviewState !== "pending") throw appError("That contribution has already been moderated");

  const changes = contribution.proposedChanges;
  const published = await publishVersion({
    previousRecordId: contribution.requirementRecordId,
    patch: {
      fees: changes.fees,
      submittalRequirements: changes.submittalRequirements,
      permitsRequired: changes.permitsRequired,
      reviewTimeline: changes.reviewTimeline,
      quirks: changes.quirks,
      inspectionContact: changes.inspectionContact,
      inspectionLeadTimeDays: changes.inspectionLeadTimeDays,
      reinspectionFeeCents: changes.reinspectionFeeCents,
    },
    reviewerUserId: input.reviewerUserId,
    reviewerName: input.reviewerName,
    sourceKind: "contribution",
    origin: "contribution",
    summary: contributionSummary(changes),
    rawDiff: `Contributor evidence:\n${contribution.evidence}`,
  });

  const [updated] = await db
    .update(contributions)
    .set({
      reviewState: "accepted",
      reviewedBy: input.reviewerUserId,
      reviewedAt: sql`now()`,
      creditCentsAwarded: CONTRIBUTION_CREDIT_CENTS,
      resultingRecordId: published.record.id,
    })
    .where(eq(contributions.id, contribution.id))
    .returning();

  await db
    .update(organizations)
    .set({
      contributionCreditCents: sql`${organizations.contributionCreditCents} + ${CONTRIBUTION_CREDIT_CENTS}`,
      updatedAt: sql`now()`,
    })
    .where(eq(organizations.id, contribution.organizationId));

  await db
    .update(users)
    .set({ contributorReputation: sql`${users.contributorReputation} + 1` })
    .where(eq(users.id, contribution.userId));

  await recordAudit({
    action: "contribution.accepted",
    target: `requirement_record:${published.record.id}`,
    organizationId: contribution.organizationId,
    actorUserId: input.reviewerUserId,
    metadata: {
      contributionId: contribution.id,
      creditCents: CONTRIBUTION_CREDIT_CENTS,
      changeId: published.changeId,
    },
  });

  return {
    contribution: updated,
    newRecordId: published.record.id,
    changeId: published.changeId,
    creditCents: CONTRIBUTION_CREDIT_CENTS,
  };
}

/**
 * Reject a suggestion. Reputation only decays on bad faith — a contractor who
 * misremembered a fee is still worth having in the network, and punishing honest
 * misses is how a field network stops reporting.
 */
export async function rejectContribution(input: {
  contributionId: string;
  reviewerUserId: string;
  reason: string;
  badFaith?: boolean;
}): Promise<Contribution> {
  const reason = input.reason.trim();
  if (reason.length < 4) throw appError("Give the contributor a reason");

  const db = getDb();
  const [updated] = await db
    .update(contributions)
    .set({
      reviewState: "rejected",
      reviewedBy: input.reviewerUserId,
      reviewedAt: sql`now()`,
      rejectionReason: reason,
    })
    .where(and(eq(contributions.id, input.contributionId), eq(contributions.reviewState, "pending")))
    .returning();
  if (!updated) throw appError("That contribution has already been moderated");

  if (input.badFaith) {
    await db
      .update(users)
      .set({ contributorReputation: sql`${users.contributorReputation} - 1` })
      .where(eq(users.id, updated.userId));
  }

  await recordAudit({
    action: "contribution.rejected",
    target: `contribution:${updated.id}`,
    organizationId: updated.organizationId,
    actorUserId: input.reviewerUserId,
    metadata: { reason, badFaith: Boolean(input.badFaith) },
  });

  return updated;
}

/** One line describing what a contribution changes, for the version history. */
export function contributionSummary(changes: ProposedChanges): string {
  const parts: string[] = [];
  if (changes.fees) parts.push("fee schedule corrected");
  if (changes.permitsRequired) parts.push("required permits corrected");
  if (changes.reviewTimeline) parts.push("review timeline updated");
  if (changes.submittalRequirements) parts.push("submittal package updated");
  if (changes.inspectionContact || changes.inspectionLeadTimeDays !== undefined) {
    parts.push("inspection scheduling notes updated");
  }
  if (changes.reinspectionFeeCents !== undefined) parts.push("reinspection fee updated");
  if (changes.quirks) parts.push("local quirk added");
  return parts.length
    ? `Contributor correction: ${parts.join(", ")}`
    : "Contributor correction accepted";
}
