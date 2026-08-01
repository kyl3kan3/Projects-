/**
 * Invitations: sending, tracking, reminding, declining.
 *
 * This is the file that replaces the estimator's chase-list, so the status board
 * it feeds has to be true. Two decisions carry that:
 *
 *  - **Status is derived, not stored** for display. `no_response` becomes true when
 *    the due date passes and no writer is watching the clock; rendering the stored
 *    column would put "OPENED" on an invitation three weeks stale. The column is
 *    still maintained for querying, but `boardFor` reports `derivedStatus`.
 *  - **Reminders are pinned to fixed distances** and deduped per rung against a
 *    unique index. The sweep can run twice a minute or once a day and each sub gets
 *    each reminder exactly once, and nothing at all after the date passes.
 */

import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bidFormLines,
  bidLines,
  bids,
  companies,
  emailEvents,
  invitations,
  projects,
  subCompanies,
  subContacts,
  tradePackages,
  type Bid,
  type EmailEvent,
  type Invitation,
  type InvitationStatus,
  type Project,
  type SubCompany,
  type SubContact,
  type TradePackage,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { sendInviteEmail, sendReminderEmail } from "@/lib/notify";
import { mintPortalToken, portalUrl, tokenExpiryFor, tokenForInvitation } from "@/lib/portal-tokens";
import { derivedStatus, dueReminderRung, reminderDedupeKey } from "@/lib/schedule";
import { daysUntil } from "@/lib/format";
import { alreadySent } from "@/lib/email";

export class InviteError extends Error {}

/* ----------------------------------------------------------------- sending --- */

export interface SendInvitesResult {
  sent: number;
  skipped: number;
  /** Portal links, so the estimator can hand one over by phone if mail bounces. */
  links: { subCompany: string; contact: string; url: string }[];
}

/**
 * Invite a set of contacts to one package.
 *
 * Idempotent per (package, contact) by unique index: pressing Send twice does not
 * mail anyone twice, and re-inviting an existing bidder reuses their invitation
 * (and their link) rather than orphaning the bid they already started.
 */
export async function sendInvites(
  companyId: string,
  actor: { userId: string; label: string },
  input: { packageId: string; subContactIds: string[]; personalNote: string | null },
): Promise<SendInvitesResult> {
  const db = getDb();

  const [pkgRow] = await db
    .select({ pkg: tradePackages, project: projects })
    .from(tradePackages)
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(
      and(eq(tradePackages.id, input.packageId), eq(tradePackages.companyId, companyId)),
    );
  if (!pkgRow) throw new InviteError("That package no longer exists");
  if (pkgRow.pkg.status === "awarded") throw new InviteError("This package has been awarded");

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new InviteError("Company not found");

  const contactIds = [...new Set(input.subContactIds)].filter(Boolean);
  if (contactIds.length === 0) throw new InviteError("Pick at least one sub to invite");

  // Contacts are re-resolved by (id, companyId): a contact id from another GC's
  // directory cannot be invited to this package.
  const contacts = await db
    .select({ contact: subContacts, sub: subCompanies })
    .from(subContacts)
    .innerJoin(subCompanies, eq(subContacts.subCompanyId, subCompanies.id))
    .where(and(inArray(subContacts.id, contactIds), eq(subContacts.companyId, companyId)));

  const result: SendInvitesResult = { sent: 0, skipped: 0, links: [] };
  const note = input.personalNote?.trim().slice(0, 2000) || null;

  for (const { contact, sub } of contacts) {
    const [existing] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tradePackageId, pkgRow.pkg.id),
          eq(invitations.subContactId, contact.id),
        ),
      );

    let invitation: Invitation;
    let token: string;

    if (existing) {
      // Already invited. The link is reproduced, never re-rolled: the sub may be
      // holding the first email, and a fresh random token would break it. Only the
      // deadline is refreshed, and only forwards.
      const expiresAt = tokenExpiryFor(pkgRow.project.bidDueAt);
      const [updated] = await db
        .update(invitations)
        .set({
          tokenExpiresAt:
            expiresAt > existing.tokenExpiresAt ? expiresAt : existing.tokenExpiresAt,
          revokedAt: null,
          personalNote: note ?? existing.personalNote,
        })
        .where(eq(invitations.id, existing.id))
        .returning();
      invitation = updated;
      token = await tokenForInvitation(updated);
    } else {
      // Insert first (we need the id to sign), then attach the token hash.
      const [created] = await db
        .insert(invitations)
        .values({
          companyId,
          tradePackageId: pkgRow.pkg.id,
          subCompanyId: sub.id,
          subContactId: contact.id,
          tokenHash: `pending:${contact.id}:${Date.now()}`,
          tokenExpiresAt: tokenExpiryFor(pkgRow.project.bidDueAt),
          status: "sent",
          personalNote: note,
        })
        .returning();
      const minted = await mintPortalToken({
        invitationId: created.id,
        tradePackageId: pkgRow.pkg.id,
        generation: 0,
      });
      const [updated] = await db
        .update(invitations)
        .set({ tokenHash: minted.tokenHash })
        .where(eq(invitations.id, created.id))
        .returning();
      invitation = updated;
      token = minted.token;
    }

    result.links.push({ subCompany: sub.name, contact: contact.email, url: portalUrl(token) });

    const outcome = await sendInviteEmail({
      company,
      project: pkgRow.project,
      pkg: pkgRow.pkg,
      subCompany: sub,
      contact,
      invitation,
      token,
      personalNote: note,
    });
    if (outcome === "duplicate") result.skipped += 1;
    else result.sent += 1;
  }

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "invites.sent",
    target: `package:${pkgRow.pkg.id}`,
    metadata: { sent: result.sent, skipped: result.skipped, contacts: contactIds.length },
  });

  return result;
}

/* ------------------------------------------------------------ status board --- */

export interface BoardRow {
  invitation: Invitation;
  subCompany: SubCompany;
  contact: SubContact;
  /** As of now — never the stored column. */
  status: InvitationStatus;
  bid: Bid | null;
  emails: EmailEvent[];
  lastEmailAt: Date | null;
  reminders: number;
}

export interface PackageBoard {
  pkg: TradePackage;
  project: Project;
  rows: BoardRow[];
  invited: number;
  submitted: number;
  declined: number;
  noResponse: number;
}

export async function boardFor(
  companyId: string,
  packageId: string,
  now: Date = new Date(),
): Promise<PackageBoard | null> {
  const db = getDb();
  const [pkgRow] = await db
    .select({ pkg: tradePackages, project: projects })
    .from(tradePackages)
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(and(eq(tradePackages.id, packageId), eq(tradePackages.companyId, companyId)));
  if (!pkgRow) return null;

  const rows = await db
    .select({ invitation: invitations, sub: subCompanies, contact: subContacts })
    .from(invitations)
    .innerJoin(subCompanies, eq(invitations.subCompanyId, subCompanies.id))
    .innerJoin(subContacts, eq(invitations.subContactId, subContacts.id))
    .where(eq(invitations.tradePackageId, packageId))
    .orderBy(asc(subCompanies.name));

  const invitationIds = rows.map((r) => r.invitation.id);
  const bidRows = invitationIds.length
    ? await db
        .select()
        .from(bids)
        .where(and(inArray(bids.invitationId, invitationIds), eq(bids.isDraft, false)))
    : [];
  const emails = invitationIds.length
    ? await db.select().from(emailEvents).where(inArray(emailEvents.invitationId, invitationIds))
    : [];

  const board: BoardRow[] = rows.map(({ invitation, sub, contact }) => {
    // The active revision: the one nothing supersedes.
    const mine = bidRows.filter((b) => b.invitationId === invitation.id);
    const active = mine.find((b) => b.supersededById === null) ?? null;
    const mail = emails.filter((e) => e.invitationId === invitation.id);
    const lastEmailAt = mail.reduce<Date | null>(
      (latest, e) => (!latest || e.occurredAt > latest ? e.occurredAt : latest),
      null,
    );
    return {
      invitation,
      subCompany: sub,
      contact,
      status: derivedStatus(
        {
          storedStatus: invitation.status,
          hasSubmittedBid: active !== null,
          declinedAt: invitation.declinedAt,
          openedAt: invitation.openedAt,
          bidDueAt: pkgRow.project.bidDueAt,
        },
        now,
      ),
      bid: active,
      emails: mail,
      lastEmailAt,
      reminders: mail.filter((e) => e.kind === "reminder").length,
    };
  });

  return {
    pkg: pkgRow.pkg,
    project: pkgRow.project,
    rows: board,
    invited: board.length,
    submitted: board.filter((r) => r.status === "submitted").length,
    declined: board.filter((r) => r.status === "declined").length,
    noResponse: board.filter((r) => r.status === "no_response").length,
  };
}

/* --------------------------------------------------------------- reminders --- */

export interface SweepResult {
  considered: number;
  sent: number;
  skipped: number;
  packages: number;
}

/**
 * The reminder sweep. Safe to run on any schedule, including twice at once.
 *
 * Idempotency is the email dedupe key (`reminder:<invitation>:t3`) and its unique
 * index — not `last_reminder_at`, which is only a display value. A timestamp
 * comparison would be exactly the trap the brief describes: JS milliseconds
 * against Postgres microseconds, a row found "due" and then never claimed.
 */
export async function reminderSweep(
  now: Date = new Date(),
  options: { budgetMs?: number; companyId?: string } = {},
): Promise<SweepResult> {
  const db = getDb();
  const started = Date.now();
  const budget = options.budgetMs ?? 45_000;
  const result: SweepResult = { considered: 0, sent: 0, skipped: 0, packages: 0 };

  // Open packages only. A closed or awarded package never chases anyone.
  const open = await db
    .select({ pkg: tradePackages, project: projects })
    .from(tradePackages)
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(
      options.companyId
        ? and(eq(tradePackages.status, "open"), eq(tradePackages.companyId, options.companyId))
        : eq(tradePackages.status, "open"),
    );

  for (const { pkg, project } of open) {
    if (Date.now() - started > budget) break;

    const [company] = await db.select().from(companies).where(eq(companies.id, pkg.companyId));
    if (!company) continue;

    const rungs = company.settings?.reminderDays ?? [7, 3, 1];
    const rung = dueReminderRung(project.bidDueAt, now, rungs);
    if (rung === null) continue;
    result.packages += 1;

    const candidates = await db
      .select({ invitation: invitations, contact: subContacts })
      .from(invitations)
      .innerJoin(subContacts, eq(invitations.subContactId, subContacts.id))
      .where(
        and(
          eq(invitations.tradePackageId, pkg.id),
          isNull(invitations.revokedAt),
          isNull(invitations.declinedAt),
          ne(invitations.status, "submitted"),
        ),
      );

    for (const { invitation, contact } of candidates) {
      result.considered += 1;
      const dedupeKey = reminderDedupeKey(invitation.id, rung);
      if (await alreadySent(dedupeKey)) {
        result.skipped += 1;
        continue;
      }

      // Never chase someone who has already submitted, even if the status column
      // has not caught up.
      const submitted = await db
        .select({ id: bids.id })
        .from(bids)
        .where(and(eq(bids.invitationId, invitation.id), eq(bids.isDraft, false)))
        .limit(1);
      if (submitted.length > 0) {
        result.skipped += 1;
        continue;
      }

      // Reproduce the sub's existing link rather than minting a new one: the token
      // is a pure function of the invitation and its generation, so the link in the
      // original invite email keeps working. Only the deadline is nudged forwards.
      const expiresAt = tokenExpiryFor(project.bidDueAt);
      if (expiresAt > invitation.tokenExpiresAt) {
        await db
          .update(invitations)
          .set({ tokenExpiresAt: expiresAt })
          .where(eq(invitations.id, invitation.id));
      }
      const token = await tokenForInvitation(invitation);

      const outcome = await sendReminderEmail({
        company,
        project,
        pkg,
        contact,
        invitation,
        token,
        rung,
        dedupeKey,
      });
      if (outcome === "duplicate") {
        result.skipped += 1;
        continue;
      }

      await db
        .update(invitations)
        .set({ lastReminderAt: now })
        .where(eq(invitations.id, invitation.id));
      result.sent += 1;
    }
  }

  return result;
}

/**
 * The manual nudge behind "Send reminder" on the status board.
 *
 * Separate from the scheduled rungs on purpose: an estimator pressing the button
 * expects something to happen, and a scheduled rung that has already gone out would
 * make the button a no-op. Deduped once per sub per calendar day, so a nervous
 * estimator pressing it four times before the owner meeting still sends one email.
 */
export async function nudgeInvitations(
  companyId: string,
  actor: { userId: string; label: string },
  packageId: string,
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  const [pkgRow] = await db
    .select({ pkg: tradePackages, project: projects })
    .from(tradePackages)
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(and(eq(tradePackages.id, packageId), eq(tradePackages.companyId, companyId)));
  if (!pkgRow) throw new InviteError("That package no longer exists");

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new InviteError("Company not found");

  const board = await boardFor(companyId, packageId, now);
  if (!board) throw new InviteError("That package no longer exists");

  const day = now.toISOString().slice(0, 10);
  const rung = Math.max(0, daysUntil(pkgRow.project.bidDueAt, now));
  let sent = 0;
  let skipped = 0;

  for (const row of board.rows) {
    if (row.status === "submitted" || row.status === "declined") continue;
    if (row.invitation.revokedAt) continue;

    const token = await tokenForInvitation(row.invitation);

    const outcome = await sendReminderEmail({
      company,
      project: pkgRow.project,
      pkg: pkgRow.pkg,
      contact: row.contact,
      invitation: row.invitation,
      token,
      rung,
      dedupeKey: `nudge:${row.invitation.id}:${day}`,
    });
    if (outcome === "duplicate") skipped += 1;
    else {
      sent += 1;
      await db
        .update(invitations)
        .set({ lastReminderAt: now })
        .where(eq(invitations.id, row.invitation.id));
    }
  }

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "reminders.nudged",
    target: `package:${packageId}`,
    metadata: { sent, skipped },
  });

  return { sent, skipped };
}

/* ------------------------------------------------------------- GC actions --- */

/** Withdraw a link. The bid already submitted stays; the sub cannot open it again. */
export async function revokeInvitation(
  companyId: string,
  actor: { userId: string; label: string },
  invitationId: string,
): Promise<void> {
  const { revokePortalToken } = await import("@/lib/portal-tokens");
  const ok = await revokePortalToken(invitationId, companyId);
  if (!ok) return;
  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "invitation.revoked",
    target: `invitation:${invitationId}`,
  });
}

/** A fresh link for one invitation, for the "text it to them" case. */
export async function freshLinkFor(
  companyId: string,
  invitationId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ invitation: invitations, project: projects })
    .from(invitations)
    .innerJoin(tradePackages, eq(invitations.tradePackageId, tradePackages.id))
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(and(eq(invitations.id, invitationId), eq(invitations.companyId, companyId)));
  if (!row) return null;

  const { rotatePortalToken, tokenExpiryFor: expiry } = await import("@/lib/portal-tokens");
  const token = await rotatePortalToken(invitationId, companyId, expiry(row.project.bidDueAt));
  return token ? portalUrl(token) : null;
}

/**
 * Transcribe a bid that arrived by email or phone, so the leveling grid never has
 * a hole (README risk 1: the GC must always be able to fall back).
 */
export async function transcribeBid(
  companyId: string,
  actor: { userId: string; label: string },
  input: {
    invitationId: string;
    kind: "itemized" | "lump_sum";
    lumpSumCents: number | null;
    lines: { bidFormLineId: string; amountCents: number | null; excluded: boolean }[];
    notes: string | null;
  },
): Promise<void> {
  const db = getDb();
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, input.invitationId), eq(invitations.companyId, companyId)));
  if (!invitation) throw new InviteError("That invitation is not yours");

  const formLines = await db
    .select()
    .from(bidFormLines)
    .where(eq(bidFormLines.tradePackageId, invitation.tradePackageId));
  const byId = new Map(formLines.map((f) => [f.id, f]));

  const rows = input.lines
    .filter((l) => byId.has(l.bidFormLineId))
    .filter((l) => l.excluded || l.amountCents !== null);

  const baseCents = rows.reduce((sum, l) => {
    if (l.excluded || l.amountCents === null) return sum;
    return byId.get(l.bidFormLineId)!.isAlternate ? sum : sum + l.amountCents;
  }, 0);

  const previous = await db
    .select()
    .from(bids)
    .where(and(eq(bids.invitationId, invitation.id), eq(bids.isDraft, false)));
  const revision = previous.reduce((max, b) => Math.max(max, b.revision), 0) + 1;
  const active = previous.find((b) => b.supersededById === null) ?? null;

  const now = new Date();
  const [bid] = await db
    .insert(bids)
    .values({
      companyId,
      invitationId: invitation.id,
      tradePackageId: invitation.tradePackageId,
      revision,
      kind: input.kind,
      totalCents: input.kind === "lump_sum" ? (input.lumpSumCents ?? 0) : baseCents,
      notes: input.notes?.trim().slice(0, 4000) || null,
      isDraft: false,
      submittedAt: now,
    })
    .returning();

  if (input.kind === "itemized" && rows.length > 0) {
    await db.insert(bidLines).values(
      rows.map((l, i) => ({
        bidId: bid.id,
        bidFormLineId: l.bidFormLineId,
        rawDescription: byId.get(l.bidFormLineId)!.description,
        state: l.excluded ? ("excluded" as const) : ("priced" as const),
        amountCents: l.excluded ? null : l.amountCents,
        mappingStatus: "manual" as const,
        mappedBy: actor.userId,
        sort: i,
      })),
    );
  }

  if (active) {
    await db.update(bids).set({ supersededById: bid.id }).where(eq(bids.id, active.id));
  }
  await db
    .update(invitations)
    .set({ status: "submitted" })
    .where(eq(invitations.id, invitation.id));

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "bid.transcribed",
    target: `bid:${bid.id}`,
    metadata: { revision, totalCents: bid.totalCents, kind: bid.kind },
  });
}
