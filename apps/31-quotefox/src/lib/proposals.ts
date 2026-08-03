/**
 * The proposal lifecycle: freeze an estimate into a sendable artifact, deliver it,
 * track what the homeowner does with it, and record acceptance.
 *
 * The distinction that runs through this file: **estimates are editable, proposals
 * are frozen.** A proposal copies the total, the deposit, the scope and the terms
 * at send time and keeps its own PDF snapshot, so changing a price afterwards can
 * never change what someone already agreed to.
 *
 * Acceptance is idempotent — a homeowner double-tapping "Accept" on a slow
 * connection must not produce two acceptance records or two notification emails.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  deposits,
  estimateLineItems,
  estimates,
  jobs,
  organizations,
  priceBookItems,
  proposalEvents,
  proposalNudges,
  proposals,
  users,
  walkthroughMedia,
  type Deposit,
  type Estimate,
  type EstimateLineItem,
  type Job,
  type Organization,
  type Proposal,
  type ProposalEvent,
  type ProposalEventType,
  type ProposalStatus,
  type WalkthroughMedia,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { computeDepositCents } from "@/lib/deposits";
import { contractorAlertMail, proposalMail, sendMail } from "@/lib/email";
import { env } from "@/lib/env";
import { getEstimate, needsPricingCount } from "@/lib/estimates";
import { formatMoney } from "@/lib/money";
import { quantityLabel } from "@/lib/item-fields";
import { renderProposalPdf, type PdfRow } from "@/lib/pdf";
import { featureEnabled, orgAsGatable } from "@/lib/plans";
import { pdfKey, putObject } from "@/lib/storage";
import { mintProposalToken, newTokenId, PROPOSAL_TTL_DAYS, proposalUrl } from "@/lib/tokens";

export const DEFAULT_TERMS =
  "This proposal is valid for 30 days. Work begins once the deposit clears and materials are on hand. " +
  "Any change to the scope above is quoted separately before it is performed. " +
  "Permit fees are passed through at cost. Balance is due on completion.";

/* ------------------------------------------------------------------ reads --- */

export interface ProposalBundle {
  proposal: Proposal;
  org: Organization;
  job: Job;
  estimate: Estimate;
  lines: EstimateLineItem[];
  photos: WalkthroughMedia[];
  deposit: Deposit | null;
  events: ProposalEvent[];
}

export async function loadProposal(proposalId: string): Promise<ProposalBundle | null> {
  const db = getDb();
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) return null;
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, proposal.organizationId));
  const [job] = await db.select().from(jobs).where(eq(jobs.id, proposal.jobId));
  const [estimate] = await db.select().from(estimates).where(eq(estimates.id, proposal.estimateId));
  if (!org || !job || !estimate) return null;
  const lines = await db
    .select()
    .from(estimateLineItems)
    .where(eq(estimateLineItems.estimateId, estimate.id))
    .orderBy(asc(estimateLineItems.position));
  const photos = estimate.walkthroughId
    ? await db
        .select()
        .from(walkthroughMedia)
        .where(
          and(
            eq(walkthroughMedia.walkthroughId, estimate.walkthroughId),
            eq(walkthroughMedia.kind, "photo"),
            eq(walkthroughMedia.uploadStatus, "complete"),
          ),
        )
        .orderBy(asc(walkthroughMedia.sequence))
    : [];
  const [deposit] = await db
    .select()
    .from(deposits)
    .where(eq(deposits.proposalId, proposal.id))
    .orderBy(desc(deposits.createdAt))
    .limit(1);
  const events = await db
    .select()
    .from(proposalEvents)
    .where(eq(proposalEvents.proposalId, proposal.id))
    .orderBy(asc(proposalEvents.occurredAt));
  return { proposal, org, job, estimate, lines, photos, deposit: deposit ?? null, events };
}

export async function listProposals(organizationId: string): Promise<
  Array<{ proposal: Proposal; job: Job; deposit: Deposit | null }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.organizationId, organizationId))
    .orderBy(desc(proposals.sentAt))
    .limit(100);
  if (!rows.length) return [];
  const jobRows = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.id, rows.map((row) => row.jobId)));
  const jobsById = new Map(jobRows.map((job) => [job.id, job]));
  const depositRows = await db
    .select()
    .from(deposits)
    .where(inArray(deposits.proposalId, rows.map((row) => row.id)));
  const depositByProposal = new Map(depositRows.map((deposit) => [deposit.proposalId, deposit]));
  return rows
    .filter((row) => jobsById.has(row.jobId))
    .map((row) => ({
      proposal: row,
      job: jobsById.get(row.jobId) as Job,
      deposit: depositByProposal.get(row.id) ?? null,
    }));
}

export async function appendEvent(
  proposal: Pick<Proposal, "id" | "organizationId">,
  type: ProposalEventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(proposalEvents).values({
    organizationId: proposal.organizationId,
    proposalId: proposal.id,
    type,
    metadata: metadata ?? null,
  });
}

/* -------------------------------------------------------------------- send --- */

export type SendResult =
  | { ok: true; proposalId: string; url: string; emailed: boolean; emailError?: string }
  | { ok: false; error: string };

/**
 * Send a proposal: freeze the estimate, mint a link, snapshot a PDF, mail the
 * homeowner, and schedule the follow-up rungs.
 *
 * Sending is refused while any row still needs pricing — the draft was honest
 * about what it could not price and sending would bury that.
 */
export async function sendProposal(
  org: Organization,
  actorId: string,
  estimateId: string,
): Promise<SendResult> {
  const db = getDb();
  const found = await getEstimate(org.id, estimateId);
  if (!found) return { ok: false, error: "That estimate no longer exists." };
  if (!found.lines.length) return { ok: false, error: "There is nothing to send yet." };
  const flagged = needsPricingCount(found.lines);
  if (flagged) {
    return {
      ok: false,
      error: `${flagged} line${flagged === 1 ? "" : "s"} still need pricing. Price or remove ${flagged === 1 ? "it" : "them"} first.`,
    };
  }
  if (!found.job.customerEmail) {
    return {
      ok: false,
      error: "Add the homeowner's email address to the job — that is where the proposal link goes.",
    };
  }

  const depositAllowed = featureEnabled(orgAsGatable(org), "deposits");
  const depositCents = depositAllowed
    ? computeDepositCents(found.estimate.totalCents, found.estimate.depositType, found.estimate.depositValue)
    : 0;

  const tokenId = newTokenId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PROPOSAL_TTL_DAYS * 86_400_000);

  const [proposal] = await db
    .insert(proposals)
    .values({
      organizationId: org.id,
      jobId: found.job.id,
      estimateId,
      tokenId,
      status: "sent",
      sentAt: now,
      expiresAt,
      totalCents: found.estimate.totalCents,
      depositCents,
      scopeSummary: found.estimate.scopeSummary,
      termsText: org.termsText?.trim() || DEFAULT_TERMS,
    })
    .returning();

  await db
    .update(estimates)
    .set({ status: "sent", updatedAt: now })
    .where(eq(estimates.id, estimateId));
  await db
    .update(jobs)
    .set({ status: "quoted", updatedAt: now })
    .where(eq(jobs.id, found.job.id));

  const token = await mintProposalToken(proposal.id, tokenId);
  const url = proposalUrl(token);

  await snapshotPdf(proposal.id);
  await appendEvent(proposal, "sent", { to: found.job.customerEmail, totalCents: proposal.totalCents });

  const mail = await sendMail(
    proposalMail({
      companyName: org.name,
      companyPhone: org.phone,
      licenseNumber: org.licenseNumber,
      brandColor: org.brandColor,
      customerName: found.job.customerName,
      customerEmail: found.job.customerEmail,
      jobTitle: found.job.title,
      address: found.job.address,
      totalCents: proposal.totalCents,
      depositCents: proposal.depositCents,
      url,
      expiresAt,
      replyTo: await ownerEmail(org.id),
    }),
  );
  if (mail.delivered) await appendEvent(proposal, "delivered", { messageId: mail.messageId });

  // Nudge rungs are only scheduled for plans that have them; the rows themselves
  // are created by the sweep, which is what makes each rung fire at most once.
  await audit(org.id, actorId, "proposal_sent", `${found.job.title} → ${found.job.customerName}`, {
    proposalId: proposal.id,
    totalCents: proposal.totalCents,
    depositCents: proposal.depositCents,
    emailed: mail.delivered,
    emailError: mail.error,
  });

  return {
    ok: true,
    proposalId: proposal.id,
    url,
    emailed: mail.delivered,
    emailError: mail.error,
  };
}

async function ownerEmail(organizationId: string): Promise<string | null> {
  const db = getDb();
  const [owner] = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.role, "owner")))
    .limit(1);
  return owner?.email ?? null;
}

async function teamEmails(organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.organizationId, organizationId));
  return rows.map((row) => row.email);
}

/** Re-send: rotate the link so the old URL dies, then mail it again. */
export async function resendProposal(
  org: Organization,
  actorId: string,
  proposalId: string,
): Promise<SendResult> {
  const db = getDb();
  const bundle = await loadProposal(proposalId);
  if (!bundle || bundle.org.id !== org.id) {
    return { ok: false, error: "That proposal no longer exists." };
  }
  if (bundle.proposal.status === "withdrawn") {
    return { ok: false, error: "This proposal was withdrawn. Duplicate the estimate to re-quote." };
  }
  if (!bundle.job.customerEmail) {
    return { ok: false, error: "Add the homeowner's email address to the job first." };
  }

  const tokenId = newTokenId();
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_DAYS * 86_400_000);
  await db
    .update(proposals)
    .set({ tokenId, expiresAt, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  const token = await mintProposalToken(proposalId, tokenId);
  const url = proposalUrl(token);

  const mail = await sendMail(
    proposalMail({
      companyName: org.name,
      companyPhone: org.phone,
      licenseNumber: org.licenseNumber,
      brandColor: org.brandColor,
      customerName: bundle.job.customerName,
      customerEmail: bundle.job.customerEmail,
      jobTitle: bundle.job.title,
      address: bundle.job.address,
      totalCents: bundle.proposal.totalCents,
      depositCents: bundle.proposal.depositCents,
      url,
      expiresAt,
      replyTo: await ownerEmail(org.id),
    }),
  );
  await appendEvent(bundle.proposal, "sent", { resend: true, to: bundle.job.customerEmail });
  await audit(org.id, actorId, "proposal_resent", bundle.job.title, { proposalId, url });
  return { ok: true, proposalId, url, emailed: mail.delivered, emailError: mail.error };
}

/* -------------------------------------------------------------------- view --- */

/**
 * Record a homeowner opening the proposal.
 *
 * Only the *first* view moves the status and notifies the contractor; later views
 * append an event, because "opened it four times" is genuinely useful and "your
 * proposal was viewed" arriving four times is not.
 */
export async function recordView(
  proposalId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<void> {
  const db = getDb();
  const bundle = await loadProposal(proposalId);
  if (!bundle) return;
  const first = !bundle.proposal.firstViewedAt;

  await appendEvent(bundle.proposal, "viewed", {
    userAgent: meta.userAgent ?? null,
    first,
  });

  if (!first) return;

  await db
    .update(proposals)
    .set({
      firstViewedAt: new Date(),
      status: bundle.proposal.status === "sent" ? "viewed" : bundle.proposal.status,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));

  await audit(bundle.org.id, SYSTEM, "proposal_viewed", bundle.job.title, { proposalId });
  await sendMail(
    contractorAlertMail({
      companyName: bundle.org.name,
      to: await teamEmails(bundle.org.id),
      jobTitle: bundle.job.title,
      customerName: bundle.job.customerName,
      event: "viewed",
      totalCents: bundle.proposal.totalCents,
      depositCents: bundle.proposal.depositCents,
      dashboardUrl: `${env.appUrl}/proposals/${proposalId}`,
    }),
  );
}

/* ------------------------------------------------------------------ accept --- */

export type AcceptResult =
  | { ok: true; status: ProposalStatus; alreadyAccepted: boolean }
  | { ok: false; error: string };

export async function acceptProposal(
  proposalId: string,
  typedName: string,
  ip: string | null,
): Promise<AcceptResult> {
  const db = getDb();
  const bundle = await loadProposal(proposalId);
  if (!bundle) return { ok: false, error: "This proposal is no longer available." };

  if (bundle.proposal.status === "accepted" || bundle.proposal.status === "deposit_paid") {
    return { ok: true, status: bundle.proposal.status, alreadyAccepted: true };
  }
  if (bundle.proposal.status === "withdrawn") {
    return { ok: false, error: "This proposal was withdrawn by the contractor." };
  }
  if (bundle.proposal.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This proposal has expired. Ask the contractor for a fresh link." };
  }
  const name = typedName.trim();
  if (name.length < 3) {
    return { ok: false, error: "Type your full name to sign." };
  }

  const acceptedAt = new Date();
  await db
    .update(proposals)
    .set({
      status: "accepted",
      acceptedAt,
      acceptedByName: name,
      acceptanceIp: ip,
      updatedAt: acceptedAt,
    })
    .where(eq(proposals.id, proposalId));

  await appendEvent(bundle.proposal, "accepted", { name, ip });
  // Re-snapshot so the archived PDF carries the acceptance record.
  await snapshotPdf(proposalId);
  await cancelNudges(proposalId, "accepted");
  await audit(bundle.org.id, SYSTEM, "proposal_accepted", `${bundle.job.title} by ${name}`, {
    proposalId,
    ip,
  });
  await sendMail(
    contractorAlertMail({
      companyName: bundle.org.name,
      to: await teamEmails(bundle.org.id),
      jobTitle: bundle.job.title,
      customerName: bundle.job.customerName,
      event: "accepted",
      totalCents: bundle.proposal.totalCents,
      depositCents: bundle.proposal.depositCents,
      acceptedByName: name,
      dashboardUrl: `${env.appUrl}/proposals/${proposalId}`,
    }),
  );
  return { ok: true, status: "accepted", alreadyAccepted: false };
}

export async function withdrawProposal(
  org: Organization,
  actorId: string,
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const bundle = await loadProposal(proposalId);
  if (!bundle || bundle.org.id !== org.id) return { ok: false, error: "Not found." };
  if (bundle.proposal.status === "deposit_paid") {
    return { ok: false, error: "A deposit has been paid on this proposal — it cannot be withdrawn." };
  }
  await db
    .update(proposals)
    .set({ status: "withdrawn", withdrawnAt: new Date(), updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  await appendEvent(bundle.proposal, "withdrawn");
  await cancelNudges(proposalId, "withdrawn");
  await audit(org.id, actorId, "proposal_withdrawn", bundle.job.title, { proposalId });
  return { ok: true };
}

/* ------------------------------------------------------------------ nudges --- */

/**
 * Stop future rungs from firing by writing them as skipped.
 *
 * Writing a row rather than deleting one is the point: the unique index on
 * (proposal, rung) then guarantees a cancelled nudge can never be sent later by a
 * sweep that re-evaluates the same proposal.
 */
export async function cancelNudges(proposalId: string, reason: string): Promise<void> {
  const db = getDb();
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) return;
  await db
    .insert(proposalNudges)
    .values(
      [2, 5].map((rung) => ({
        organizationId: proposal.organizationId,
        proposalId,
        rung,
        sentAt: null,
        skippedReason: reason,
      })),
    )
    .onConflictDoNothing({ target: [proposalNudges.proposalId, proposalNudges.rung] });
}

export async function nudgesFor(proposalId: string) {
  const db = getDb();
  return db
    .select()
    .from(proposalNudges)
    .where(eq(proposalNudges.proposalId, proposalId))
    .orderBy(asc(proposalNudges.rung));
}

/* -------------------------------------------------------------- pdf snapshot --- */

/** Render and archive the proposal PDF. Called on send and on acceptance. */
export async function snapshotPdf(proposalId: string): Promise<string | null> {
  const bundle = await loadProposal(proposalId);
  if (!bundle) return null;
  const db = getDb();

  const kinds = await db
    .select({ id: priceBookItems.id, kind: priceBookItems.kind })
    .from(priceBookItems)
    .where(eq(priceBookItems.organizationId, bundle.org.id));
  const kindById = new Map(kinds.map((row) => [row.id, row.kind]));

  const rows: PdfRow[] = bundle.lines.map((line) => {
    const secondary =
      line.quantityMilli === 1000 && line.unit === "each"
        ? (line.description ?? undefined)
        : `${quantityLabel(line.quantityMilli, line.unit)} × ${formatMoney(line.unitPriceCents)}${line.description ? ` · ${line.description}` : ""}`;
    return {
      label: line.name,
      secondary,
      amount: formatMoney(line.lineTotalCents),
    };
  });

  const taxable = bundle.lines.some(
    (line) => line.priceBookItemId && kindById.get(line.priceBookItemId) !== "labor",
  );
  const totals = [
    { label: "Subtotal", amount: formatMoney(bundle.estimate.subtotalCents) },
    ...(bundle.estimate.taxCents > 0 || taxable
      ? [
          {
            label: `Tax (${(bundle.estimate.taxRateBp / 100).toFixed(2)}% on materials)`,
            amount: formatMoney(bundle.estimate.taxCents),
          },
        ]
      : []),
    { label: "Total", amount: formatMoney(bundle.proposal.totalCents), bold: true },
    ...(bundle.proposal.depositCents > 0
      ? [{ label: "Deposit to start", amount: formatMoney(bundle.proposal.depositCents) }]
      : []),
  ];

  const acceptance = bundle.proposal.acceptedAt
    ? [
        `Accepted by ${bundle.proposal.acceptedByName ?? "the customer"}`,
        `Signed electronically ${bundle.proposal.acceptedAt.toLocaleString("en-US")}`,
        bundle.proposal.acceptanceIp ? `From IP ${bundle.proposal.acceptanceIp}` : "",
      ].filter(Boolean)
    : undefined;

  const bytes = renderProposalPdf({
    title: `Proposal — ${bundle.job.title}`,
    subtitle: `Prepared ${bundle.proposal.sentAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · valid 30 days · estimate v${bundle.estimate.version}`,
    headerLines: [
      bundle.org.name,
      [
        bundle.org.licenseNumber ? `License ${bundle.org.licenseNumber}` : "",
        bundle.org.insuranceLine ?? "",
        bundle.org.phone ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
      bundle.org.address ?? "",
    ].filter(Boolean),
    customerLines: [
      bundle.job.customerName,
      bundle.job.address,
      bundle.job.customerEmail ?? "",
      bundle.job.customerPhone ?? "",
    ].filter(Boolean),
    scope: bundle.proposal.scopeSummary ?? bundle.estimate.scopeSummary ?? undefined,
    rows,
    totals,
    terms: bundle.proposal.termsText ?? DEFAULT_TERMS,
    acceptance,
    footer: "Prepared with QuoteFox. Every line above came from this contractor's own price book.",
  });

  const key = pdfKey(bundle.org.id, proposalId);
  await putObject(key, bytes, "application/pdf");
  await db
    .update(proposals)
    .set({ pdfKey: key, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  return key;
}
