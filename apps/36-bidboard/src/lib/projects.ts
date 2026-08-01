/**
 * Projects, trade packages and the bid form.
 *
 * The bid form is the normalisation strategy (README differentiator 2): because
 * the portal presents the GC's own lines, most bids arrive already comparable and
 * the leveling grid has rows before a single bid lands. So creating a package
 * seeds a sensible form for the division rather than leaving an empty table —
 * an estimator who has to type eleven line items before inviting anyone will go
 * back to email.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  awards,
  bidFormLines,
  bidLines,
  bids,
  invitations,
  projects,
  questions,
  tradePackages,
  type BidFormLine,
  type PackageStatus,
  type Project,
  type ProjectStatus,
  type TradePackage,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { canCreateProject } from "@/lib/plans";
import { division, divisionLabel } from "@/lib/csi";
import type { Plan } from "@/db/schema";

export class ProjectError extends Error {}

/** Statuses that consume a plan slot. Awarded and archived are free. */
export const ACTIVE_STATUSES: ProjectStatus[] = ["draft", "bidding", "leveling"];

export async function countActiveProjects(companyId: string): Promise<number> {
  const db = getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), inArray(projects.status, ACTIVE_STATUSES)));
  return Number(count);
}

export async function createProject(
  companyId: string,
  plan: Plan,
  actor: { userId: string; label: string },
  input: { name: string; address: string | null; bidDueAt: Date; notes: string | null },
): Promise<Project> {
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new ProjectError("Give the project a name");
  if (Number.isNaN(input.bidDueAt.getTime())) throw new ProjectError("Pick a bid due date");

  const gate = canCreateProject(plan, await countActiveProjects(companyId));
  if (!gate.allowed) throw new ProjectError(gate.reason!);

  const db = getDb();
  const [project] = await db
    .insert(projects)
    .values({
      companyId,
      name,
      address: input.address?.trim().slice(0, 240) || null,
      bidDueAt: input.bidDueAt,
      notes: input.notes?.trim().slice(0, 2000) || null,
      status: "bidding",
    })
    .returning();

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "project.created",
    target: `project:${project.id}`,
    metadata: { name: project.name, dueAt: project.bidDueAt.toISOString() },
  });
  return project;
}

export async function getProject(companyId: string, projectId: string): Promise<Project | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
  return row ?? null;
}

export async function updateProject(
  companyId: string,
  projectId: string,
  input: {
    name?: string;
    address?: string | null;
    bidDueAt?: Date;
    ownerMeetingAt?: Date | null;
    status?: ProjectStatus;
    notes?: string | null;
  },
): Promise<void> {
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 160);
  if (input.address !== undefined) patch.address = input.address?.trim().slice(0, 240) || null;
  if (input.bidDueAt !== undefined) patch.bidDueAt = input.bidDueAt;
  if (input.ownerMeetingAt !== undefined) patch.ownerMeetingAt = input.ownerMeetingAt;
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes?.trim().slice(0, 2000) || null;
  if (Object.keys(patch).length === 0) return;

  await db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));

  // Moving the bid date moves every outstanding link's deadline with it. Expiry is a
  // column rather than a claim precisely so the link a sub is already holding keeps
  // working when the GC grants an extension.
  if (input.bidDueAt !== undefined) {
    const { retimeProjectTokens } = await import("@/lib/portal-tokens");
    await retimeProjectTokens(companyId, projectId, input.bidDueAt);
  }
}

/* ----------------------------------------------------------------- packages --- */

export async function createPackage(
  companyId: string,
  projectId: string,
  actor: { userId: string; label: string },
  input: { csiDivision: string; tradeLabel?: string; scopeNotes: string | null; seedForm: boolean },
): Promise<TradePackage> {
  const project = await getProject(companyId, projectId);
  if (!project) throw new ProjectError("That project no longer exists");

  const div = division(input.csiDivision);
  const code = div?.code ?? input.csiDivision.trim().slice(0, 4);
  if (!code) throw new ProjectError("Pick a trade division");

  const db = getDb();
  const [existing] = await db
    .select()
    .from(tradePackages)
    .where(and(eq(tradePackages.projectId, projectId), eq(tradePackages.csiDivision, code)));
  if (existing) {
    throw new ProjectError(`${divisionLabel(code)} is already a package on this project`);
  }

  const [pkg] = await db
    .insert(tradePackages)
    .values({
      companyId,
      projectId,
      csiDivision: code,
      tradeLabel: input.tradeLabel?.trim().slice(0, 120) || divisionLabel(code),
      scopeNotes: input.scopeNotes?.trim().slice(0, 4000) || null,
      status: "open",
    })
    .returning();

  if (input.seedForm && div) {
    await db.insert(bidFormLines).values(
      div.seedLines.map((description, i) => ({
        tradePackageId: pkg.id,
        sort: (i + 1) * 10,
        description,
      })),
    );
  }

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "package.created",
    target: `package:${pkg.id}`,
    metadata: { division: code, project: project.name },
  });
  return pkg;
}

export async function getPackage(
  companyId: string,
  packageId: string,
): Promise<{ pkg: TradePackage; project: Project } | null> {
  const db = getDb();
  const [row] = await db
    .select({ pkg: tradePackages, project: projects })
    .from(tradePackages)
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(and(eq(tradePackages.id, packageId), eq(tradePackages.companyId, companyId)));
  return row ?? null;
}

export async function updatePackage(
  companyId: string,
  packageId: string,
  input: { tradeLabel?: string; scopeNotes?: string | null; status?: PackageStatus },
): Promise<void> {
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (input.tradeLabel !== undefined) patch.tradeLabel = input.tradeLabel.trim().slice(0, 120);
  if (input.scopeNotes !== undefined) {
    patch.scopeNotes = input.scopeNotes?.trim().slice(0, 4000) || null;
  }
  if (input.status !== undefined) patch.status = input.status;
  if (Object.keys(patch).length === 0) return;
  await db
    .update(tradePackages)
    .set(patch)
    .where(and(eq(tradePackages.id, packageId), eq(tradePackages.companyId, companyId)));
}

export async function listPackages(companyId: string, projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(tradePackages)
    .where(and(eq(tradePackages.companyId, companyId), eq(tradePackages.projectId, projectId)))
    .orderBy(asc(tradePackages.csiDivision));
}

/* ------------------------------------------------------------ bid form lines --- */

export async function listFormLines(tradePackageId: string): Promise<BidFormLine[]> {
  const db = getDb();
  return db
    .select()
    .from(bidFormLines)
    .where(eq(bidFormLines.tradePackageId, tradePackageId))
    .orderBy(asc(bidFormLines.sort), asc(bidFormLines.id));
}

export async function addFormLine(
  companyId: string,
  packageId: string,
  input: {
    description: string;
    unit: string | null;
    quantity: string | null;
    isAlternate: boolean;
    isAllowance: boolean;
  },
): Promise<void> {
  const owned = await getPackage(companyId, packageId);
  if (!owned) throw new ProjectError("That package no longer exists");
  if (owned.pkg.status === "awarded") throw new ProjectError("This package is awarded and read-only");

  const description = input.description.trim().slice(0, 300);
  if (!description) throw new ProjectError("Describe the line item");

  const db = getDb();
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${bidFormLines.sort}), 0)` })
    .from(bidFormLines)
    .where(eq(bidFormLines.tradePackageId, packageId));

  await db.insert(bidFormLines).values({
    tradePackageId: packageId,
    sort: Number(max) + 10,
    description,
    unit: input.unit?.trim().slice(0, 24) || null,
    quantity: input.quantity?.trim().slice(0, 24) || null,
    isAlternate: input.isAlternate,
    isAllowance: input.isAllowance,
  });
}

/**
 * Delete a form line. Refused once a bid has priced it: removing the row would
 * silently drop that money out of the sub's total and change the apparent low.
 */
export async function deleteFormLine(
  companyId: string,
  packageId: string,
  formLineId: string,
): Promise<void> {
  const owned = await getPackage(companyId, packageId);
  if (!owned) throw new ProjectError("That package no longer exists");

  const db = getDb();
  const submitted = await db
    .select({ id: bids.id })
    .from(bids)
    .where(and(eq(bids.tradePackageId, packageId), eq(bids.isDraft, false)));
  if (submitted.length > 0) {
    const [priced] = await db
      .select({ id: bidLines.id })
      .from(bidLines)
      .where(
        and(
          inArray(
            bidLines.bidId,
            submitted.map((b) => b.id),
          ),
          eq(bidLines.bidFormLineId, formLineId),
        ),
      )
      .limit(1);
    if (priced) {
      throw new ProjectError(
        "A submitted bid has priced this line. Mark it an alternate or leave it — deleting it would change a bidder's total.",
      );
    }
  }

  await db
    .delete(bidFormLines)
    .where(and(eq(bidFormLines.id, formLineId), eq(bidFormLines.tradePackageId, packageId)));
}

/* --------------------------------------------------------------- board data --- */

export interface ProjectSummary {
  project: Project;
  packageCount: number;
  invited: number;
  submitted: number;
  declined: number;
  awardedPackages: number;
}

/**
 * The projects home. One query per fact rather than one clever join: the numbers
 * are small (a GC has tens of projects, not millions) and a wrong coverage line is
 * worse than a slow one.
 */
export async function listProjectSummaries(companyId: string): Promise<ProjectSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.companyId, companyId))
    .orderBy(asc(projects.bidDueAt), desc(projects.createdAt));
  if (rows.length === 0) return [];

  const pkgs = await db
    .select()
    .from(tradePackages)
    .where(eq(tradePackages.companyId, companyId));
  const invites = await db
    .select({
      id: invitations.id,
      tradePackageId: invitations.tradePackageId,
      status: invitations.status,
      declinedAt: invitations.declinedAt,
    })
    .from(invitations)
    .where(eq(invitations.companyId, companyId));
  const submittedBids = await db
    .select({ invitationId: bids.invitationId, tradePackageId: bids.tradePackageId })
    .from(bids)
    .where(and(eq(bids.companyId, companyId), eq(bids.isDraft, false)));

  const submittedInvites = new Set(submittedBids.map((b) => b.invitationId));

  return rows.map((project) => {
    const projectPkgs = pkgs.filter((p) => p.projectId === project.id);
    const pkgIds = new Set(projectPkgs.map((p) => p.id));
    const projectInvites = invites.filter((i) => pkgIds.has(i.tradePackageId));
    return {
      project,
      packageCount: projectPkgs.length,
      invited: projectInvites.length,
      submitted: projectInvites.filter((i) => submittedInvites.has(i.id)).length,
      declined: projectInvites.filter((i) => i.declinedAt !== null).length,
      awardedPackages: projectPkgs.filter((p) => p.status === "awarded").length,
    };
  });
}

export interface PackageSummary {
  pkg: TradePackage;
  formLineCount: number;
  invited: number;
  submitted: number;
  declined: number;
  unanswered: number;
  /** Lowest adjusted total is a leveling concern; this is just the raw low. */
  lowestSubmittedCents: number | null;
}

/**
 * Per-package counts for the project screen. Deliberately raw totals: the *adjusted*
 * low belongs to the leveling grid, and quoting a raw low here would contradict it.
 */
export async function packageSummaries(
  companyId: string,
  projectId: string,
): Promise<PackageSummary[]> {
  const db = getDb();
  const pkgs = await listPackages(companyId, projectId);
  if (pkgs.length === 0) return [];
  const ids = pkgs.map((p) => p.id);

  const [formLines, inviteRows, bidRows, questionRows] = await Promise.all([
    db
      .select({ id: bidFormLines.id, tradePackageId: bidFormLines.tradePackageId })
      .from(bidFormLines)
      .where(inArray(bidFormLines.tradePackageId, ids)),
    db
      .select({
        id: invitations.id,
        tradePackageId: invitations.tradePackageId,
        declinedAt: invitations.declinedAt,
      })
      .from(invitations)
      .where(inArray(invitations.tradePackageId, ids)),
    db
      .select({
        invitationId: bids.invitationId,
        tradePackageId: bids.tradePackageId,
        totalCents: bids.totalCents,
        supersededById: bids.supersededById,
      })
      .from(bids)
      .where(and(inArray(bids.tradePackageId, ids), eq(bids.isDraft, false))),
    db
      .select({ id: questions.id, tradePackageId: questions.tradePackageId, answeredAt: questions.answeredAt })
      .from(questions)
      .where(inArray(questions.tradePackageId, ids)),
  ]);

  return pkgs.map((pkg) => {
    const invited = inviteRows.filter((i) => i.tradePackageId === pkg.id);
    const active = bidRows.filter((b) => b.tradePackageId === pkg.id && b.supersededById === null);
    const totals = active.map((b) => b.totalCents).filter((t) => t > 0);
    return {
      pkg,
      formLineCount: formLines.filter((f) => f.tradePackageId === pkg.id).length,
      invited: invited.length,
      submitted: active.length,
      declined: invited.filter((i) => i.declinedAt !== null).length,
      unanswered: questionRows.filter((q) => q.tradePackageId === pkg.id && !q.answeredAt).length,
      lowestSubmittedCents: totals.length > 0 ? Math.min(...totals) : null,
    };
  });
}

/** Roll a project to `awarded` once every package is. Never the other way. */
export async function rollUpProjectStatus(companyId: string, projectId: string): Promise<void> {
  const db = getDb();
  const pkgs = await listPackages(companyId, projectId);
  if (pkgs.length === 0) return;
  const allAwarded = pkgs.every((p) => p.status === "awarded");
  if (!allAwarded) return;
  await db
    .update(projects)
    .set({ status: "awarded" })
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
}

export async function awardedPackageIds(companyId: string, projectId: string) {
  const db = getDb();
  return db
    .select({ packageId: awards.tradePackageId })
    .from(awards)
    .innerJoin(tradePackages, eq(awards.tradePackageId, tradePackages.id))
    .where(and(eq(awards.companyId, companyId), eq(tradePackages.projectId, projectId)));
}
