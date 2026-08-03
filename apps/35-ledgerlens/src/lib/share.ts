/**
 * Accountant share links: read-only, no login.
 *
 * The token in the URL *is* the credential, and that is a deliberate trade. Asking a
 * tax preparer to create an account before they can download February is how the
 * package never gets looked at. The trade is made safe by keeping the token narrow
 * (one org, optionally one period, read-only), storing only its **hash** so a
 * database leak cannot mint working links, expiring it after 90 days, making it
 * revocable, and logging every single access so the operator can see exactly when
 * their accountant opened it.
 *
 * Comparison is by hash lookup, not by scanning and comparing in JavaScript, so the
 * lookup is a single indexed query with no timing surface.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  closePeriods,
  shareLinks,
  organizations,
  type ClosePeriod,
  type Organization,
  type ShareLink,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

export const SHARE_TTL_DAYS = 90;

function hashToken(token: string): string {
  // Salted with the app secret so the stored hashes are not a rainbow-table target.
  return createHash("sha256").update(`${env.shareTokenSecret}:${token}`).digest("hex");
}

export function shareUrl(token: string): string {
  return `${env.appUrl}/share/${token}`;
}

export interface CreatedShareLink {
  link: ShareLink;
  /** Shown exactly once. Not recoverable — that is the point of storing a hash. */
  token: string;
  url: string;
}

export async function createShareLink(
  organizationId: string,
  userId: string,
  opts: { label?: string; closePeriodId?: string | null } = {},
): Promise<CreatedShareLink> {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const label = (opts.label ?? "").trim().slice(0, 80) || "My accountant";
  const [link] = await db
    .insert(shareLinks)
    .values({
      organizationId,
      closePeriodId: opts.closePeriodId ?? null,
      label,
      tokenHash: hashToken(token),
      createdByUserId: userId,
      expiresAt: new Date(Date.now() + SHARE_TTL_DAYS * 86_400_000),
    })
    .returning();
  await audit(organizationId, userId, "share.created", link.id, { label });
  return { link, token, url: shareUrl(token) };
}

export async function revokeShareLink(
  organizationId: string,
  userId: string,
  shareLinkId: string,
): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(shareLinks)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(shareLinks.id, shareLinkId),
        eq(shareLinks.organizationId, organizationId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning({ id: shareLinks.id });
  if (!updated) throw new ValidationError("That link has already been revoked.");
  await audit(organizationId, userId, "share.revoked", shareLinkId, {});
}

export async function listShareLinks(organizationId: string): Promise<ShareLink[]> {
  return getDb()
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.organizationId, organizationId))
    .orderBy(desc(shareLinks.createdAt));
}

export type ShareResolution =
  | { ok: true; link: ShareLink; org: Organization; periods: ClosePeriod[] }
  | { ok: false; reason: "unknown" | "revoked" | "expired" };

/**
 * Resolve a token to what it may see. Also records the access — every open is a row
 * in the audit log and a bump on the link, because "your accountant downloaded
 * February" is a retention moment the operator should get for free.
 */
export async function resolveShareToken(token: string): Promise<ShareResolution> {
  const db = getDb();
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, hashToken(token)));
  if (!link) return { ok: false, reason: "unknown" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, link.organizationId));
  if (!org) return { ok: false, reason: "unknown" };

  const periods = await db
    .select()
    .from(closePeriods)
    .where(
      link.closePeriodId
        ? and(eq(closePeriods.id, link.closePeriodId), eq(closePeriods.status, "closed"))
        : and(
            eq(closePeriods.organizationId, link.organizationId),
            eq(closePeriods.status, "closed"),
          ),
    )
    .orderBy(desc(closePeriods.period));

  return { ok: true, link, org, periods };
}

/** Bump the access counters and write the audit row. Called by the page and downloads. */
export async function recordShareAccess(
  link: ShareLink,
  action: "share.accessed" | "export.downloaded",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const db = getDb();
  await db
    .update(shareLinks)
    .set({ lastAccessedAt: sql`now()`, accessCount: sql`${shareLinks.accessCount} + 1` })
    .where(eq(shareLinks.id, link.id));
  await audit(link.organizationId, `share:${link.id}`, action, link.id, {
    label: link.label,
    ...metadata,
  });
}

export function shareState(link: ShareLink): "active" | "revoked" | "expired" {
  if (link.revokedAt) return "revoked";
  return link.expiresAt.getTime() < Date.now() ? "expired" : "active";
}
