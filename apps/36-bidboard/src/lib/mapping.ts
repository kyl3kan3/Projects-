/**
 * The needs-mapping tray: what the estimator does with rows a sub typed
 * themselves, and the memory that stops them doing it twice.
 *
 * Nothing here maps silently. `mapTrayLine` is only ever called from an explicit
 * estimator action, and it records the correction against that sub so the same
 * wording maps itself on their next project — labelled as remembered, and
 * undoable.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bidFormLines,
  bidLines,
  bids,
  invitations,
  subLineAliases,
  tradePackages,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { normalizeDescription, type RememberedAlias } from "@/lib/normalize";

export class MappingError extends Error {}

export async function aliasesForSub(
  companyId: string,
  subCompanyId: string,
): Promise<RememberedAlias[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(subLineAliases)
    .where(
      and(
        eq(subLineAliases.companyId, companyId),
        eq(subLineAliases.subCompanyId, subCompanyId),
      ),
    );
  return rows.map((r) => ({ rawKey: r.rawKey, formKey: r.formKey, formLabel: r.formLabel }));
}

/**
 * Map one tray row onto a form line.
 *
 * Every id is re-resolved against the company and the package: a bid line from
 * another company's package cannot be moved, and a form line from a different
 * package cannot be the target — that would put a sub's money in a grid they were
 * never invited to.
 */
export async function mapTrayLine(input: {
  companyId: string;
  userId: string;
  tradePackageId: string;
  bidLineId: string;
  bidFormLineId: string;
  /** Remember it for this sub's next project. Default true. */
  remember?: boolean;
}): Promise<void> {
  const db = getDb();

  const [pkg] = await db
    .select()
    .from(tradePackages)
    .where(
      and(
        eq(tradePackages.id, input.tradePackageId),
        eq(tradePackages.companyId, input.companyId),
      ),
    );
  if (!pkg) throw new MappingError("That package no longer exists");
  if (pkg.status === "awarded") throw new MappingError("This package is awarded and read-only");

  const [row] = await db
    .select({ line: bidLines, bid: bids })
    .from(bidLines)
    .innerJoin(bids, eq(bidLines.bidId, bids.id))
    .where(
      and(
        eq(bidLines.id, input.bidLineId),
        eq(bids.companyId, input.companyId),
        eq(bids.tradePackageId, input.tradePackageId),
      ),
    );
  if (!row) throw new MappingError("That bid line is not part of this package");

  const [formLine] = await db
    .select()
    .from(bidFormLines)
    .where(
      and(
        eq(bidFormLines.id, input.bidFormLineId),
        eq(bidFormLines.tradePackageId, input.tradePackageId),
      ),
    );
  if (!formLine) throw new MappingError("That form line is not part of this package");

  await db
    .update(bidLines)
    .set({
      bidFormLineId: formLine.id,
      mappingStatus: "manual",
      mappedBy: input.userId,
    })
    .where(eq(bidLines.id, row.line.id));

  if (input.remember !== false) {
    const rawKey = normalizeDescription(row.line.rawDescription);
    if (rawKey) {
      await db
        .insert(subLineAliases)
        .values({
          companyId: input.companyId,
          subCompanyId: await subCompanyOfBid(row.bid.id),
          rawKey,
          formKey: normalizeDescription(formLine.description),
          formLabel: formLine.description,
        })
        .onConflictDoUpdate({
          target: [subLineAliases.subCompanyId, subLineAliases.rawKey],
          set: {
            formKey: normalizeDescription(formLine.description),
            formLabel: formLine.description,
          },
        });
    }
  }

  await audit({
    companyId: input.companyId,
    actorKind: "user",
    actorId: input.userId,
    actorLabel: input.userId,
    action: "bid_line.mapped",
    target: `bid_line:${row.line.id}`,
    metadata: {
      raw: row.line.rawDescription,
      onto: formLine.description,
      remembered: input.remember !== false,
    },
  });
}

async function subCompanyOfBid(bidId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ subCompanyId: invitations.subCompanyId })
    .from(bids)
    .innerJoin(invitations, eq(bids.invitationId, invitations.id))
    .where(eq(bids.id, bidId));
  if (!row) throw new MappingError("That bid no longer exists");
  return row.subCompanyId;
}

/** Put a row back in the tray, and forget the alias that put it where it was. */
export async function unmapTrayLine(input: {
  companyId: string;
  userId: string;
  tradePackageId: string;
  bidLineId: string;
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ line: bidLines, bid: bids })
    .from(bidLines)
    .innerJoin(bids, eq(bidLines.bidId, bids.id))
    .where(
      and(
        eq(bidLines.id, input.bidLineId),
        eq(bids.companyId, input.companyId),
        eq(bids.tradePackageId, input.tradePackageId),
      ),
    );
  if (!row) throw new MappingError("That bid line is not part of this package");

  await db
    .update(bidLines)
    .set({ bidFormLineId: null, mappingStatus: "unmapped", mappedBy: input.userId })
    .where(eq(bidLines.id, row.line.id));

  const rawKey = normalizeDescription(row.line.rawDescription);
  if (rawKey) {
    const subCompanyId = await subCompanyOfBid(row.bid.id);
    await db
      .delete(subLineAliases)
      .where(
        and(
          eq(subLineAliases.subCompanyId, subCompanyId),
          eq(subLineAliases.rawKey, rawKey),
        ),
      );
  }

  await audit({
    companyId: input.companyId,
    actorKind: "user",
    actorId: input.userId,
    actorLabel: input.userId,
    action: "bid_line.unmapped",
    target: `bid_line:${row.line.id}`,
  });
}
