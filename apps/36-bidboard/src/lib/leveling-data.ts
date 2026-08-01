/**
 * The database side of leveling: load a package's active bids into the shape the
 * pure engine takes, then hand it over.
 *
 * The split is deliberate. Everything that can be wrong about the arithmetic lives
 * in leveling.ts, which has no imports that reach Postgres and is therefore testable
 * against fixtures and safe to reason about. Everything that can be wrong about
 * *which rows* to load lives here, in one function, scoped by company.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  awards,
  bidFormLines,
  bidLines,
  bids,
  invitations,
  levelingAdjustments,
  projects,
  subCompanies,
  tradePackages,
  type Award,
  type Project,
  type TradePackage,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { buildLevelingGrid, type LevelBid, type LevelingGrid } from "@/lib/leveling";
import { suggestMappings, type MappingSuggestion } from "@/lib/normalize";
import { aliasesForSub } from "@/lib/mapping";

export interface LevelingPage {
  pkg: TradePackage;
  project: Project;
  grid: LevelingGrid;
  /** Suggestions for the needs-mapping tray, keyed by bid line id. */
  suggestions: Map<string, MappingSuggestion>;
  award: Award | null;
  /**
   * Rows that mapped themselves from a correction this estimator made on an earlier
   * project. Surfaced so a remembered mapping is never silent — it is labelled and
   * can be undone.
   */
  remembered: {
    bidLineId: string;
    subName: string;
    rawDescription: string;
    formLineDescription: string;
  }[];
  /** Bidders who declined or never answered — context for a thin grid. */
  nonBidders: { subName: string; reason: "declined" | "no_response" | "pending" }[];
}

export async function loadLevelingPage(
  companyId: string,
  packageId: string,
  actor?: { userId: string; label: string },
): Promise<LevelingPage | null> {
  const db = getDb();

  const [pkgRow] = await db
    .select({ pkg: tradePackages, project: projects })
    .from(tradePackages)
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(and(eq(tradePackages.id, packageId), eq(tradePackages.companyId, companyId)));
  if (!pkgRow) return null;

  const formLines = await db
    .select()
    .from(bidFormLines)
    .where(eq(bidFormLines.tradePackageId, packageId))
    .orderBy(asc(bidFormLines.sort), asc(bidFormLines.id));

  // Active revisions only: submitted, and superseded by nothing.
  const bidRows = await db
    .select({ bid: bids, invitation: invitations, sub: subCompanies })
    .from(bids)
    .innerJoin(invitations, eq(bids.invitationId, invitations.id))
    .innerJoin(subCompanies, eq(invitations.subCompanyId, subCompanies.id))
    .where(
      and(
        eq(bids.companyId, companyId),
        eq(bids.tradePackageId, packageId),
        eq(bids.isDraft, false),
        isNull(bids.supersededById),
      ),
    );

  const bidIds = bidRows.map((r) => r.bid.id);
  const lineRows = bidIds.length
    ? await db
        .select()
        .from(bidLines)
        .where(inArray(bidLines.bidId, bidIds))
        .orderBy(asc(bidLines.sort), asc(bidLines.id))
    : [];

  const adjustmentRows = await db
    .select()
    .from(levelingAdjustments)
    .where(
      and(
        eq(levelingAdjustments.companyId, companyId),
        eq(levelingAdjustments.tradePackageId, packageId),
      ),
    );

  const levelBids: LevelBid[] = bidRows.map(({ bid, invitation, sub }) => ({
    id: bid.id,
    invitationId: invitation.id,
    subCompanyId: sub.id,
    subName: sub.name,
    kind: bid.kind,
    revision: bid.revision,
    submittedTotalCents: bid.totalCents,
    inclusions: bid.inclusions,
    exclusions: bid.exclusions,
    submittedAt: bid.submittedAt,
    lines: lineRows
      .filter((l) => l.bidId === bid.id)
      .map((l) => ({
        id: l.id,
        bidFormLineId: l.bidFormLineId,
        rawDescription: l.rawDescription,
        state: l.state,
        amountCents: l.amountCents,
        mappingStatus: l.mappingStatus,
      })),
  }));

  const grid = buildLevelingGrid({
    formLines: formLines.map((f) => ({
      id: f.id,
      sort: f.sort,
      description: f.description,
      unit: f.unit,
      quantity: f.quantity,
      isAlternate: f.isAlternate,
      isAllowance: f.isAllowance,
    })),
    bids: levelBids,
    adjustments: adjustmentRows.map((a) => ({
      id: a.id,
      bidId: a.bidId,
      bidFormLineId: a.bidFormLineId,
      kind: a.kind,
      amountCents: a.amountCents,
      reason: a.reason,
    })),
  });

  /* Suggestions for the tray — computed per sub so remembered aliases apply. */
  const suggestions = new Map<string, MappingSuggestion>();
  const formForMatch = formLines.map((f) => ({ id: f.id, description: f.description }));
  for (const bid of levelBids) {
    const unmapped = bid.lines.filter((l) => l.bidFormLineId === null);
    if (unmapped.length === 0) continue;
    const aliases = await aliasesForSub(companyId, bid.subCompanyId);
    for (const s of suggestMappings(
      unmapped.map((l) => ({ id: l.id, rawDescription: l.rawDescription })),
      formForMatch,
      aliases,
    )) {
      suggestions.set(s.bidLineId, s);
    }
  }

  const formById = new Map(formLines.map((f) => [f.id, f]));
  const remembered = lineRows
    .filter((l) => l.mappedBy === "remembered" && l.bidFormLineId !== null)
    .map((l) => {
      const owner = bidRows.find((r) => r.bid.id === l.bidId);
      return {
        bidLineId: l.id,
        subName: owner?.sub.name ?? "A bidder",
        rawDescription: l.rawDescription,
        formLineDescription: formById.get(l.bidFormLineId!)?.description ?? "a form line",
      };
    });

  const [award] = await db
    .select()
    .from(awards)
    .where(
      and(
        eq(awards.companyId, companyId),
        eq(awards.tradePackageId, packageId),
        isNull(awards.revokedAt),
      ),
    );

  /* Who was invited and is not in the grid. A three-column grid on a nine-sub
     package is a coverage problem, and the page should say so. */
  const invited = await db
    .select({ invitation: invitations, sub: subCompanies })
    .from(invitations)
    .innerJoin(subCompanies, eq(invitations.subCompanyId, subCompanies.id))
    .where(eq(invitations.tradePackageId, packageId));
  const bidderInvitations = new Set(bidRows.map((r) => r.invitation.id));
  const pastDue = pkgRow.project.bidDueAt.getTime() < Date.now();
  const nonBidders = invited
    .filter((i) => !bidderInvitations.has(i.invitation.id))
    .map((i) => ({
      subName: i.sub.name,
      reason: i.invitation.declinedAt
        ? ("declined" as const)
        : pastDue
          ? ("no_response" as const)
          : ("pending" as const),
    }));

  if (actor) {
    await audit({
      companyId,
      actorKind: "user",
      actorId: actor.userId,
      actorLabel: actor.label,
      action: "leveling.viewed",
      target: `package:${packageId}`,
      metadata: { bids: bidIds.length },
    });
  }

  return {
    pkg: pkgRow.pkg,
    project: pkgRow.project,
    grid,
    suggestions,
    award: award ?? null,
    remembered,
    nonBidders,
  };
}

/* ------------------------------------------------------------- adjustments --- */

export class AdjustmentError extends Error {}

export async function addAdjustment(
  companyId: string,
  actor: { userId: string; label: string },
  input: {
    packageId: string;
    bidId: string | null;
    bidFormLineId: string | null;
    kind: "plug" | "normalize" | "scope_add";
    amountCents: number;
    reason: string;
  },
): Promise<void> {
  const db = getDb();
  const [pkg] = await db
    .select()
    .from(tradePackages)
    .where(
      and(eq(tradePackages.id, input.packageId), eq(tradePackages.companyId, companyId)),
    );
  if (!pkg) throw new AdjustmentError("That package no longer exists");
  if (pkg.status === "awarded") throw new AdjustmentError("This package is awarded and read-only");

  const reason = input.reason.trim().slice(0, 300);
  if (!reason) throw new AdjustmentError("Say why — the export footnotes every adjustment");
  if (!Number.isSafeInteger(input.amountCents)) throw new AdjustmentError("Enter an amount");
  if (input.kind === "plug" && input.amountCents <= 0) {
    throw new AdjustmentError("A plug fills a hole, so it is a positive number");
  }

  // Both ids are re-resolved against this package: a bid from a sibling package
  // cannot be adjusted from here, and neither can a form line.
  if (input.bidId) {
    const [bid] = await db
      .select({ id: bids.id })
      .from(bids)
      .where(
        and(
          eq(bids.id, input.bidId),
          eq(bids.companyId, companyId),
          eq(bids.tradePackageId, input.packageId),
        ),
      );
    if (!bid) throw new AdjustmentError("That bid is not part of this package");
  }
  if (input.bidFormLineId) {
    const [line] = await db
      .select({ id: bidFormLines.id })
      .from(bidFormLines)
      .where(
        and(
          eq(bidFormLines.id, input.bidFormLineId),
          eq(bidFormLines.tradePackageId, input.packageId),
        ),
      );
    if (!line) throw new AdjustmentError("That form line is not part of this package");
  }

  await db.insert(levelingAdjustments).values({
    companyId,
    tradePackageId: input.packageId,
    bidId: input.bidId,
    bidFormLineId: input.bidFormLineId,
    kind: input.kind,
    amountCents: input.amountCents,
    reason,
    createdBy: actor.userId,
  });

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: `leveling.${input.kind}_added`,
    target: `package:${input.packageId}`,
    metadata: { amountCents: input.amountCents, reason, bidId: input.bidId },
  });
}

export async function removeAdjustment(
  companyId: string,
  actor: { userId: string; label: string },
  adjustmentId: string,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .delete(levelingAdjustments)
    .where(
      and(
        eq(levelingAdjustments.id, adjustmentId),
        eq(levelingAdjustments.companyId, companyId),
      ),
    )
    .returning({ id: levelingAdjustments.id, packageId: levelingAdjustments.tradePackageId });
  if (rows.length === 0) return;
  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "leveling.adjustment_removed",
    target: `package:${rows[0].packageId}`,
  });
}

export async function adjustmentsFor(companyId: string, packageId: string) {
  const db = getDb();
  return db
    .select()
    .from(levelingAdjustments)
    .where(
      and(
        eq(levelingAdjustments.companyId, companyId),
        eq(levelingAdjustments.tradePackageId, packageId),
      ),
    )
    .orderBy(asc(levelingAdjustments.createdAt));
}
