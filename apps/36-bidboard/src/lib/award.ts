/**
 * The award flow: pick the winner, freeze the record, tell everyone.
 *
 * Awarding is the only irreversible-feeling action in the product, so it is gated
 * twice: `awardPreflight` returns everything the estimator is about to ignore
 * (unmapped rows, scope gaps, plug-heavy columns, unanswered questions, a choice
 * that is not the apparent low), and `awardPackage` refuses to commit unless the
 * caller passes those flags back as acknowledged.
 *
 * The award stores the **adjusted total the decision was made on**. Recomputing it
 * later would silently rewrite history the first time someone adds an adjustment.
 */

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  awards,
  bids,
  companies,
  invitations,
  projects,
  subCompanies,
  subContacts,
  tradePackages,
  type Award,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { awardFlags, type AwardFlags } from "@/lib/leveling";
import { loadLevelingPage } from "@/lib/leveling-data";
import { sendAwardEmail, sendRegretEmail } from "@/lib/notify";
import { rollUpProjectStatus } from "@/lib/projects";
import { unansweredCount } from "@/lib/questions";

export class AwardError extends Error {}

export interface AwardPreflight extends AwardFlags {
  subName: string;
  adjustedTotalCents: number;
  baseCents: number;
  plugCents: number;
  adjustmentCents: number;
  unansweredQuestions: number;
  otherBidders: number;
  /** Anything in here is worth a second look before committing. */
  warnings: string[];
}

export async function awardPreflight(
  companyId: string,
  packageId: string,
  bidId: string,
): Promise<AwardPreflight> {
  const page = await loadLevelingPage(companyId, packageId);
  if (!page) throw new AwardError("That package no longer exists");
  const column = page.grid.columns.find((c) => c.bid.id === bidId);
  if (!column) throw new AwardError("That bid is not on this package");

  const flags = awardFlags(page.grid, bidId);
  const unanswered = await unansweredCount(companyId, packageId);

  const warnings: string[] = [];
  if (flags.notApparentLow && page.grid.apparentLow) {
    warnings.push(
      `${page.grid.apparentLow.subName} is the apparent low on adjusted totals. Awarding ${column.bid.subName} is a deliberate choice.`,
    );
  }
  if (flags.unmappedLines > 0) {
    warnings.push(
      flags.unmappedLines === 1
        ? "1 bid row is still sitting in the needs-mapping tray."
        : `${flags.unmappedLines} bid rows are still sitting in the needs-mapping tray.`,
    );
  }
  if (flags.scopeGaps > 0) {
    warnings.push(
      `${flags.scopeGaps} scope gap${flags.scopeGaps === 1 ? "" : "s"} — one bidder priced something another did not.`,
    );
  }
  if (column.plugHeavy) {
    warnings.push(
      `${Math.round(column.plugShare * 100)}% of this column's total is plug money you entered, not their price.`,
    );
  }
  if (!column.complete) {
    warnings.push(
      `This bid leaves ${column.gapFormLineIds.length} form line${column.gapFormLineIds.length === 1 ? "" : "s"} unpriced and unplugged.`,
    );
  }
  if (flags.provisionalLow) {
    warnings.push("No column covers the whole scope, so the apparent low is provisional.");
  }
  if (unanswered > 0) {
    warnings.push(`${unanswered} question${unanswered === 1 ? "" : "s"} from bidders is unanswered.`);
  }

  return {
    ...flags,
    subName: column.bid.subName,
    adjustedTotalCents: column.adjustedTotalCents,
    baseCents: column.baseCents,
    plugCents: column.plugCents,
    adjustmentCents: column.adjustmentCents,
    unansweredQuestions: unanswered,
    otherBidders: page.grid.columns.length - 1,
    warnings,
  };
}

export interface AwardResult {
  award: Award;
  awardEmails: number;
  regretEmails: number;
}

export async function awardPackage(
  companyId: string,
  actor: { userId: string; label: string },
  input: {
    packageId: string;
    bidId: string;
    note: string | null;
    /** Must equal the number of warnings the preflight produced. */
    acknowledgedWarnings: number;
    sendRegrets: boolean;
  },
): Promise<AwardResult> {
  const db = getDb();
  const preflight = await awardPreflight(companyId, input.packageId, input.bidId);
  if (preflight.warnings.length !== input.acknowledgedWarnings) {
    throw new AwardError(
      "Something changed since you opened this screen — re-read the flags before awarding.",
    );
  }

  const [pkgRow] = await db
    .select({ pkg: tradePackages, project: projects })
    .from(tradePackages)
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(
      and(eq(tradePackages.id, input.packageId), eq(tradePackages.companyId, companyId)),
    );
  if (!pkgRow) throw new AwardError("That package no longer exists");
  if (pkgRow.pkg.status === "awarded") throw new AwardError("This package is already awarded");

  const [winner] = await db
    .select({ bid: bids, invitation: invitations, sub: subCompanies, contact: subContacts })
    .from(bids)
    .innerJoin(invitations, eq(bids.invitationId, invitations.id))
    .innerJoin(subCompanies, eq(invitations.subCompanyId, subCompanies.id))
    .innerJoin(subContacts, eq(invitations.subContactId, subContacts.id))
    .where(
      and(
        eq(bids.id, input.bidId),
        eq(bids.companyId, companyId),
        eq(bids.tradePackageId, input.packageId),
        eq(bids.isDraft, false),
      ),
    );
  if (!winner) throw new AwardError("That bid is not an active submission on this package");

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new AwardError("Company not found");

  const [award] = await db
    .insert(awards)
    .values({
      companyId,
      tradePackageId: input.packageId,
      bidId: winner.bid.id,
      awardedBy: actor.userId,
      awardNote: input.note?.trim().slice(0, 2000) || null,
      awardedTotalCents: preflight.adjustedTotalCents,
    })
    .returning();

  // Freezing the package is what makes every bid read-only: the portal refuses to
  // accept a submission, and mapping/adjustments refuse to change the numbers.
  await db
    .update(tradePackages)
    .set({ status: "awarded", awardedBidId: winner.bid.id })
    .where(eq(tradePackages.id, input.packageId));

  const result: AwardResult = { award, awardEmails: 0, regretEmails: 0 };

  const awarded = await sendAwardEmail({
    company,
    project: pkgRow.project,
    pkg: pkgRow.pkg,
    contact: winner.contact,
    invitation: winner.invitation,
    totalCents: preflight.adjustedTotalCents,
    note: input.note,
  });
  if (awarded !== "duplicate") result.awardEmails += 1;

  if (input.sendRegrets) {
    const others = await db
      .select({ bid: bids, invitation: invitations, contact: subContacts })
      .from(bids)
      .innerJoin(invitations, eq(bids.invitationId, invitations.id))
      .innerJoin(subContacts, eq(invitations.subContactId, subContacts.id))
      .where(
        and(
          eq(bids.companyId, companyId),
          eq(bids.tradePackageId, input.packageId),
          eq(bids.isDraft, false),
          isNull(bids.supersededById),
        ),
      );
    for (const other of others) {
      if (other.bid.id === winner.bid.id) continue;
      const outcome = await sendRegretEmail({
        company,
        project: pkgRow.project,
        pkg: pkgRow.pkg,
        contact: other.contact,
        invitation: other.invitation,
      });
      if (outcome !== "duplicate") result.regretEmails += 1;
    }
  }

  await db
    .update(awards)
    .set({ notificationsSentAt: new Date() })
    .where(eq(awards.id, award.id));

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "package.awarded",
    target: `package:${input.packageId}`,
    metadata: {
      bidId: winner.bid.id,
      sub: winner.sub.name,
      awardedTotalCents: preflight.adjustedTotalCents,
      warningsAcknowledged: preflight.warnings,
      regretsSent: result.regretEmails,
    },
  });

  await rollUpProjectStatus(companyId, pkgRow.pkg.projectId);
  return result;
}

/**
 * Un-award. Rare but real: a sub backs out between award and subcontract. The
 * prior award row is kept, stamped revoked, so the history of how the number was
 * reached survives.
 */
export async function unawardPackage(
  companyId: string,
  actor: { userId: string; label: string },
  input: { packageId: string; reason: string },
): Promise<void> {
  const db = getDb();
  const reason = input.reason.trim().slice(0, 300);
  if (!reason) throw new AwardError("Say why the award is being pulled");

  const [pkg] = await db
    .select()
    .from(tradePackages)
    .where(
      and(eq(tradePackages.id, input.packageId), eq(tradePackages.companyId, companyId)),
    );
  if (!pkg) throw new AwardError("That package no longer exists");
  if (pkg.status !== "awarded") throw new AwardError("That package is not awarded");

  await db
    .update(awards)
    .set({ revokedAt: new Date(), revokeReason: reason })
    .where(
      and(
        eq(awards.tradePackageId, input.packageId),
        eq(awards.companyId, companyId),
        isNull(awards.revokedAt),
      ),
    );
  await db
    .update(tradePackages)
    .set({ status: "open", awardedBidId: null })
    .where(eq(tradePackages.id, input.packageId));
  await db
    .update(projects)
    .set({ status: "leveling" })
    .where(and(eq(projects.id, pkg.projectId), eq(projects.companyId, companyId)));

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "package.unawarded",
    target: `package:${input.packageId}`,
    metadata: { reason },
  });
}

export async function awardFor(companyId: string, packageId: string): Promise<Award | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(awards)
    .where(
      and(
        eq(awards.companyId, companyId),
        eq(awards.tradePackageId, packageId),
        isNull(awards.revokedAt),
      ),
    );
  return row ?? null;
}
