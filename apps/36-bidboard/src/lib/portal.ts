/**
 * The sub-portal boundary. **This is the file to read if you read one.**
 *
 * A sub must never see another sub's numbers. The invariant, enforced here so no
 * page or action has to remember it:
 *
 *  1. A portal request carries exactly one credential: the signed token in the
 *     URL. `resolvePortal` turns it into a `PortalContext` whose ids all come out
 *     of the **invitation row** (see portal-tokens.ts), never out of the URL and
 *     never out of a form field.
 *  2. Every function below takes a `PortalContext`. **Not one of them accepts an
 *     invitation id, bid id, package id or sub id from the caller.** There is no
 *     parameter a malicious request could put another sub's id into.
 *  3. Ids that *must* come from the request — a plan file to download, a form line
 *     an amount belongs to — are resolved as a pair against the context
 *     (`(fileId, projectId)`, `(formLineId, tradePackageId)`). An id from another
 *     project resolves to null, not to somebody else's plans, and an amount posted
 *     against a foreign form line is dropped rather than stored.
 *  4. Bid rows are only ever read with `eq(bids.invitationId, ctx.invitationId)`.
 *     There is no code path in the portal that can select a sibling bidder's bid,
 *     and the Q&A reader hides who asked what.
 *
 * The tests in portal.test.ts drive each of these with the *other* sub's ids and
 * assert nothing leaks.
 */

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bidAttachments,
  bidFormLines,
  bidLines,
  bids,
  companies,
  invitations,
  planFiles,
  projects,
  questions,
  subCompanies,
  subContacts,
  tradePackages,
  type Bid,
  type BidAttachment,
  type BidFormLine,
  type BidKind,
  type Company,
  type LineState,
  type PlanFile,
  type Project,
  type SubCompany,
  type SubContact,
  type TradePackage,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { parseMoneyToCents } from "@/lib/format";
import { normalizeDescription, suggestMappings } from "@/lib/normalize";
import {
  verifyPortalToken,
  type PortalScope,
  type TokenRejection,
} from "@/lib/portal-tokens";
import { aliasesForSub } from "@/lib/mapping";
import { notifyBidSubmitted, notifyQuestionAsked } from "@/lib/notify";

export class PortalError extends Error {}

/* ---------------------------------------------------------------- context --- */

export interface PortalContext extends PortalScope {
  pkg: TradePackage;
  project: Project;
  company: Company;
  subCompany: SubCompany;
  subContact: SubContact;
  /** False once the package is awarded or closed: the portal goes read-only. */
  acceptingBids: boolean;
}

export type PortalResolution =
  | { ok: true; ctx: PortalContext }
  | { ok: false; reason: TokenRejection };

/**
 * The only way into the portal. Everything downstream takes what this returns.
 */
export async function resolvePortal(token: string): Promise<PortalResolution> {
  const verified = await verifyPortalToken(token);
  if (!verified.ok) return { ok: false, reason: verified.reason };
  const scope = verified.scope;

  const db = getDb();
  // Every row is fetched by (id, companyId) so a package that has been moved
  // between companies — or an id that never belonged here — cannot resolve.
  const [pkg] = await db
    .select()
    .from(tradePackages)
    .where(
      and(
        eq(tradePackages.id, scope.tradePackageId),
        eq(tradePackages.companyId, scope.companyId),
      ),
    );
  if (!pkg) return { ok: false, reason: "unknown" };

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, pkg.projectId), eq(projects.companyId, scope.companyId)));
  const [company] = await db.select().from(companies).where(eq(companies.id, scope.companyId));
  const [subCompany] = await db
    .select()
    .from(subCompanies)
    .where(
      and(eq(subCompanies.id, scope.subCompanyId), eq(subCompanies.companyId, scope.companyId)),
    );
  const [subContact] = await db
    .select()
    .from(subContacts)
    .where(
      and(eq(subContacts.id, scope.subContactId), eq(subContacts.companyId, scope.companyId)),
    );
  if (!project || !company || !subCompany || !subContact) return { ok: false, reason: "unknown" };

  return {
    ok: true,
    ctx: {
      ...scope,
      pkg,
      project,
      company,
      subCompany,
      subContact,
      acceptingBids: pkg.status === "open" || pkg.status === "draft",
    },
  };
}

/** Throwing variant for server actions. */
export async function requirePortal(token: string): Promise<PortalContext> {
  const resolved = await resolvePortal(token);
  if (!resolved.ok) throw new PortalError("This bid link is no longer valid");
  return resolved.ctx;
}

/**
 * Is this package still taking bids — **right now**?
 *
 * Re-read from the database on every write rather than trusting the value captured
 * when the token was resolved. The window is small but it is real: an estimator can
 * award a package in the same seconds a sub is pressing Submit, and a bid accepted
 * after the award would sit in the record contradicting it.
 */
async function requireOpen(ctx: PortalContext): Promise<void> {
  const db = getDb();
  const [pkg] = await db
    .select({ status: tradePackages.status })
    .from(tradePackages)
    .where(
      and(
        eq(tradePackages.id, ctx.tradePackageId),
        eq(tradePackages.companyId, ctx.companyId),
      ),
    );
  if (!pkg) throw new PortalError("This bid package is no longer available.");
  if (pkg.status === "awarded") {
    throw new PortalError("This package has been awarded and is no longer accepting bids.");
  }
  if (pkg.status === "closed") {
    throw new PortalError("This package is closed and is no longer accepting bids.");
  }
}

/* ------------------------------------------------------------ rate limiting --- */

const WINDOW_MS = 60_000;
const CEILING = 120;
const hits = new Map<string, number[]>();

/**
 * A per-token request ceiling, in memory.
 *
 * Honest about what this is: it holds within one process, which is the shape of a
 * single VPS or a warm serverless instance, and it stops the obvious abuse (a
 * script hammering one link). A multi-instance deployment needs this in Redis or
 * the platform's own rate limiter; the call sites do not change.
 */
export function portalRateLimit(invitationId: string, ceiling = CEILING): boolean {
  const now = Date.now();
  const recent = (hits.get(invitationId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(invitationId, recent);
  if (hits.size > 5_000) hits.clear(); // bounded: this is a cache, not a ledger
  return recent.length <= ceiling;
}

/* --------------------------------------------------------------- open / view --- */

/** First open flips the invitation to `opened` and stamps the time. Once. */
export async function markPortalOpened(ctx: PortalContext): Promise<void> {
  const db = getDb();
  // The invitation row was already read during token verification, so the
  // decision is made in TypeScript rather than in a raw SQL CASE — one fewer
  // fragment where a column could bind to the wrong table.
  if (!ctx.invitation.openedAt || ctx.invitation.status === "sent") {
    await db
      .update(invitations)
      .set({
        openedAt: ctx.invitation.openedAt ?? new Date(),
        ...(ctx.invitation.status === "sent" ? { status: "opened" as const } : {}),
      })
      .where(eq(invitations.id, ctx.invitationId));
  }

  await audit({
    companyId: ctx.companyId,
    actorKind: "invitation",
    actorId: ctx.invitationId,
    actorLabel: `${ctx.subCompany.name} (portal)`,
    action: "portal.open",
    target: `package:${ctx.tradePackageId}`,
    metadata: { trade: ctx.pkg.tradeLabel },
  });
}

export interface PortalQuestion {
  id: string;
  body: string;
  answerBody: string | null;
  answeredAt: Date | null;
  createdAt: Date;
  /** True when this bidder asked it. Other bidders' questions are anonymous. */
  mine: boolean;
}

export interface PortalBidView {
  bid: Bid;
  lines: { formLineId: string | null; raw: string; state: LineState; amountCents: number | null }[];
  attachments: BidAttachment[];
}

export interface PortalView {
  ctx: PortalContext;
  formLines: BidFormLine[];
  plans: PlanFile[];
  questions: PortalQuestion[];
  /** The working copy: a draft if one exists, otherwise the latest submission. */
  working: PortalBidView | null;
  /** The last submitted revision, if any — what the GC currently holds. */
  submitted: PortalBidView | null;
}

export async function loadPortalView(ctx: PortalContext): Promise<PortalView> {
  const db = getDb();

  const formLines = await db
    .select()
    .from(bidFormLines)
    .where(eq(bidFormLines.tradePackageId, ctx.tradePackageId))
    .orderBy(asc(bidFormLines.sort), asc(bidFormLines.id));

  // Project-wide plans plus this package's own. Another package's drawings are
  // not readable through this token.
  const plans = await db
    .select()
    .from(planFiles)
    .where(
      and(
        eq(planFiles.projectId, ctx.project.id),
        or(
          isNull(planFiles.tradePackageId),
          eq(planFiles.tradePackageId, ctx.tradePackageId),
        ),
      ),
    )
    .orderBy(asc(planFiles.filename));

  const questionRows = await db
    .select()
    .from(questions)
    .where(eq(questions.tradePackageId, ctx.tradePackageId))
    .orderBy(desc(questions.createdAt));

  const visibleQuestions: PortalQuestion[] = questionRows
    .filter((q) => q.invitationId === ctx.invitationId || (q.answerBody && q.broadcastAt))
    .map((q) => ({
      id: q.id,
      body: q.body,
      answerBody: q.answerBody,
      answeredAt: q.answeredAt,
      createdAt: q.createdAt,
      mine: q.invitationId === ctx.invitationId,
    }));

  const [draft, latestSubmitted] = await Promise.all([
    findDraft(ctx),
    findLatestSubmitted(ctx),
  ]);

  return {
    ctx,
    formLines,
    plans,
    questions: visibleQuestions,
    working: draft ? await hydrate(draft) : latestSubmitted ? await hydrate(latestSubmitted) : null,
    submitted: latestSubmitted ? await hydrate(latestSubmitted) : null,
  };
}

async function hydrate(bid: Bid): Promise<PortalBidView> {
  const db = getDb();
  const lines = await db
    .select()
    .from(bidLines)
    .where(eq(bidLines.bidId, bid.id))
    .orderBy(asc(bidLines.sort), asc(bidLines.id));
  const attachments = await db
    .select()
    .from(bidAttachments)
    .where(eq(bidAttachments.bidId, bid.id));
  return {
    bid,
    lines: lines.map((l) => ({
      formLineId: l.bidFormLineId,
      raw: l.rawDescription,
      state: l.state,
      amountCents: l.amountCents,
    })),
    attachments,
  };
}

async function findDraft(ctx: PortalContext): Promise<Bid | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(bids)
    .where(and(eq(bids.invitationId, ctx.invitationId), eq(bids.isDraft, true)))
    .orderBy(desc(bids.revision))
    .limit(1);
  return row ?? null;
}

async function findLatestSubmitted(ctx: PortalContext): Promise<Bid | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(bids)
    .where(and(eq(bids.invitationId, ctx.invitationId), eq(bids.isDraft, false)))
    .orderBy(desc(bids.revision))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------- bid writing --- */

export interface PortalLineInput {
  /** A GC form line, or null for a row the sub added. Validated against the package. */
  formLineId: string | null;
  rawDescription: string;
  state: LineState;
  /** Raw text as typed; parsed here so a bad amount is an error, never a zero. */
  amount: string | null;
}

export interface PortalBidInput {
  kind: BidKind;
  lines: PortalLineInput[];
  /** Only read when kind is lump_sum. */
  lumpSumAmount: string | null;
  inclusions: string[];
  exclusions: string[];
  notes: string | null;
}

interface PreparedLine {
  formLineId: string | null;
  rawDescription: string;
  state: LineState;
  amountCents: number | null;
  sort: number;
}

/**
 * Turn what the form posted into rows, dropping anything that does not belong to
 * this package.
 *
 * The `formLineId` filter is the attack surface that matters: a crafted POST can
 * name any uuid it likes, and an amount stored against another package's form
 * line would appear in *that* package's leveling grid. Unknown ids are dropped,
 * not mapped to null — silently converting them into free-form rows would let an
 * attacker inject rows into a bid.
 */
async function prepareLines(
  ctx: PortalContext,
  input: PortalBidInput,
): Promise<{ lines: PreparedLine[]; baseCents: number; alternateCents: number }> {
  const db = getDb();
  const formLines = await db
    .select()
    .from(bidFormLines)
    .where(eq(bidFormLines.tradePackageId, ctx.tradePackageId));
  const byId = new Map(formLines.map((f) => [f.id, f]));

  const lines: PreparedLine[] = [];
  let sort = 0;
  for (const raw of input.lines) {
    if (raw.formLineId !== null && !byId.has(raw.formLineId)) continue; // not ours
    const description = raw.rawDescription.trim().slice(0, 300);
    const amountCents = raw.state === "priced" ? parseMoneyToCents(raw.amount) : null;

    // An empty amount on a form line is "not answered yet", not a zero bid.
    if (raw.state === "priced" && amountCents === null) continue;
    if (raw.formLineId === null && description === "") continue;
    if (amountCents !== null && (amountCents < 0 || amountCents > 99_999_999_999)) {
      throw new PortalError(`"${description || "that line"}" is not a plausible amount`);
    }

    lines.push({
      formLineId: raw.formLineId,
      rawDescription:
        description || byId.get(raw.formLineId ?? "")?.description || "(no description)",
      state: raw.state,
      amountCents,
      sort: sort++,
    });
  }

  let baseCents = 0;
  let alternateCents = 0;
  for (const l of lines) {
    if (l.state !== "priced" || l.amountCents === null) continue;
    const form = l.formLineId ? byId.get(l.formLineId) : null;
    if (form?.isAlternate) alternateCents += l.amountCents;
    else baseCents += l.amountCents;
  }

  return { lines, baseCents, alternateCents };
}

/** The running total the portal shows: base scope only, alternates listed apart. */
export async function portalTotals(
  ctx: PortalContext,
  input: PortalBidInput,
): Promise<{ baseCents: number; alternateCents: number }> {
  const { baseCents, alternateCents } = await prepareLines(ctx, input);
  return { baseCents, alternateCents };
}

async function upsertDraft(ctx: PortalContext, input: PortalBidInput): Promise<Bid> {
  const db = getDb();
  const { lines, baseCents } = await prepareLines(ctx, input);

  const lumpSum = input.kind === "lump_sum" ? parseMoneyToCents(input.lumpSumAmount) : null;
  const totalCents = input.kind === "lump_sum" ? (lumpSum ?? 0) : baseCents;

  const existing = await findDraft(ctx);
  let draft: Bid;
  if (existing) {
    const [row] = await db
      .update(bids)
      .set({
        kind: input.kind,
        totalCents,
        inclusions: cleanChips(input.inclusions),
        exclusions: cleanChips(input.exclusions),
        notes: input.notes?.trim().slice(0, 4000) || null,
        updatedAt: new Date(),
      })
      .where(eq(bids.id, existing.id))
      .returning();
    draft = row;
    await db.delete(bidLines).where(eq(bidLines.bidId, draft.id));
  } else {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${bids.revision}), 0)` })
      .from(bids)
      .where(eq(bids.invitationId, ctx.invitationId));
    const [row] = await db
      .insert(bids)
      .values({
        companyId: ctx.companyId,
        invitationId: ctx.invitationId,
        tradePackageId: ctx.tradePackageId,
        revision: Number(max) + 1,
        kind: input.kind,
        totalCents,
        inclusions: cleanChips(input.inclusions),
        exclusions: cleanChips(input.exclusions),
        notes: input.notes?.trim().slice(0, 4000) || null,
        isDraft: true,
      })
      .returning();
    draft = row;
  }

  if (lines.length > 0) {
    await db.insert(bidLines).values(
      lines.map((l) => ({
        bidId: draft.id,
        bidFormLineId: l.formLineId,
        rawDescription: l.rawDescription,
        state: l.state,
        amountCents: l.amountCents,
        mappingStatus: l.formLineId ? ("matched" as const) : ("unmapped" as const),
        mappedBy: "system",
        sort: l.sort,
      })),
    );
  }
  return draft;
}

function cleanChips(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v.trim().slice(0, 120);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= 30) break;
  }
  return out;
}

/** Save without submitting. The sub can close the tab and come back to the link. */
export async function savePortalDraft(ctx: PortalContext, input: PortalBidInput): Promise<Bid> {
  await requireOpen(ctx);
  const draft = await upsertDraft(ctx, input);
  await audit({
    companyId: ctx.companyId,
    actorKind: "invitation",
    actorId: ctx.invitationId,
    actorLabel: `${ctx.subCompany.name} (portal)`,
    action: "bid.draft_saved",
    target: `bid:${draft.id}`,
  });
  return draft;
}

/**
 * Submit. Revision 1 the first time; a later submission becomes revision N and
 * supersedes the one before it, which is preserved in full.
 */
export async function submitPortalBid(
  ctx: PortalContext,
  input: PortalBidInput,
): Promise<{ bid: Bid; revision: number }> {
  await requireOpen(ctx);
  const db = getDb();

  if (input.kind === "lump_sum") {
    const lump = parseMoneyToCents(input.lumpSumAmount);
    if (lump === null || lump <= 0) {
      throw new PortalError("Enter your lump-sum price before submitting.");
    }
  }

  const draft = await upsertDraft(ctx, input);
  const lines = await db.select().from(bidLines).where(eq(bidLines.bidId, draft.id));
  if (input.kind === "itemized" && !lines.some((l) => l.state === "priced")) {
    throw new PortalError(
      "Price at least one line, or switch to a lump-sum price, before submitting.",
    );
  }

  // Remembered corrections: wording this estimator already mapped for this sub
  // maps itself. Nothing else is applied automatically — the rest goes to the
  // needs-mapping tray with a suggestion attached.
  await applyRememberedMappings(ctx, draft.id);

  const previous = await findLatestSubmitted(ctx);
  const now = new Date();
  const [submitted] = await db
    .update(bids)
    .set({ isDraft: false, submittedAt: now, updatedAt: now })
    .where(eq(bids.id, draft.id))
    .returning();

  if (previous) {
    await db
      .update(bids)
      .set({ supersededById: submitted.id })
      .where(eq(bids.id, previous.id));
  }

  await db
    .update(invitations)
    .set({ status: "submitted" })
    .where(eq(invitations.id, ctx.invitationId));

  await audit({
    companyId: ctx.companyId,
    actorKind: "invitation",
    actorId: ctx.invitationId,
    actorLabel: `${ctx.subCompany.name} (portal)`,
    action: previous ? "bid.resubmitted" : "bid.submitted",
    target: `bid:${submitted.id}`,
    metadata: {
      revision: submitted.revision,
      totalCents: submitted.totalCents,
      kind: submitted.kind,
      supersedes: previous?.id ?? null,
    },
  });

  await notifyBidSubmitted({
    ctx,
    bid: submitted,
    isRevision: Boolean(previous),
  });

  return { bid: submitted, revision: submitted.revision };
}

async function applyRememberedMappings(ctx: PortalContext, bidId: string): Promise<void> {
  const db = getDb();
  const unmapped = await db
    .select()
    .from(bidLines)
    .where(and(eq(bidLines.bidId, bidId), isNull(bidLines.bidFormLineId)));
  if (unmapped.length === 0) return;

  const formLines = await db
    .select()
    .from(bidFormLines)
    .where(eq(bidFormLines.tradePackageId, ctx.tradePackageId));
  const aliases = await aliasesForSub(ctx.companyId, ctx.subCompanyId);

  const suggestions = suggestMappings(
    unmapped.map((l) => ({ id: l.id, rawDescription: l.rawDescription })),
    formLines.map((f) => ({ id: f.id, description: f.description })),
    aliases,
  );

  for (const s of suggestions.filter((x) => x.autoApply)) {
    await db
      .update(bidLines)
      .set({ bidFormLineId: s.bidFormLineId, mappingStatus: "manual", mappedBy: "remembered" })
      .where(eq(bidLines.id, s.bidLineId));
  }
}

/* ------------------------------------------------------- decline, Q&A, files --- */

export async function declineFromPortal(ctx: PortalContext, reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(invitations)
    .set({
      status: "declined",
      declinedAt: new Date(),
      declineReason: reason.trim().slice(0, 500) || null,
    })
    .where(eq(invitations.id, ctx.invitationId));
  await audit({
    companyId: ctx.companyId,
    actorKind: "invitation",
    actorId: ctx.invitationId,
    actorLabel: `${ctx.subCompany.name} (portal)`,
    action: "invitation.declined",
    target: `package:${ctx.tradePackageId}`,
    metadata: { reason: reason.slice(0, 200) },
  });
}

export async function willBidFromPortal(ctx: PortalContext): Promise<void> {
  const db = getDb();
  await db
    .update(invitations)
    .set({ status: "will_bid", declinedAt: null, declineReason: null })
    .where(eq(invitations.id, ctx.invitationId));
}

export async function askPortalQuestion(ctx: PortalContext, body: string): Promise<void> {
  const text = body.trim().slice(0, 2000);
  if (text.length < 5) throw new PortalError("Write a little more so the GC can answer it.");
  const db = getDb();
  const [row] = await db
    .insert(questions)
    .values({
      companyId: ctx.companyId,
      tradePackageId: ctx.tradePackageId,
      invitationId: ctx.invitationId,
      body: text,
    })
    .returning();
  await audit({
    companyId: ctx.companyId,
    actorKind: "invitation",
    actorId: ctx.invitationId,
    actorLabel: `${ctx.subCompany.name} (portal)`,
    action: "question.asked",
    target: `package:${ctx.tradePackageId}`,
  });
  await notifyQuestionAsked({ ctx, questionId: row.id, body: text });
}

/**
 * Resolve a plan file the portal asked for. `(fileId, projectId)` plus the package
 * scope: a file id from another project, or from a sibling package, returns null.
 */
export async function portalPlanFile(
  ctx: PortalContext,
  fileId: string,
): Promise<PlanFile | null> {
  if (!isUuid(fileId)) return null;
  const db = getDb();
  const [file] = await db
    .select()
    .from(planFiles)
    .where(
      and(
        eq(planFiles.id, fileId),
        eq(planFiles.projectId, ctx.project.id),
        eq(planFiles.companyId, ctx.companyId),
        or(isNull(planFiles.tradePackageId), eq(planFiles.tradePackageId, ctx.tradePackageId)),
      ),
    );
  if (!file) return null;

  await audit({
    companyId: ctx.companyId,
    actorKind: "invitation",
    actorId: ctx.invitationId,
    actorLabel: `${ctx.subCompany.name} (portal)`,
    action: "plan.downloaded",
    target: `plan_file:${file.id}`,
    metadata: { filename: file.filename, version: file.versionLabel },
  });
  return file;
}

/** An attachment belongs to this invitation's working bid, and nowhere else. */
export async function attachToPortalBid(
  ctx: PortalContext,
  file: { filename: string; contentType: string; data: Buffer },
): Promise<void> {
  await requireOpen(ctx);
  const { storage, newStorageKey, isAllowedFilename } = await import("@/lib/storage");
  const { env } = await import("@/lib/env");

  if (!isAllowedFilename(file.filename)) {
    throw new PortalError("Attach a PDF, drawing, spreadsheet or image.");
  }
  if (file.data.byteLength > env.maxUploadBytes) {
    throw new PortalError(
      `That file is larger than the ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB limit. Email it to the GC instead.`,
    );
  }

  const db = getDb();
  const draft = (await findDraft(ctx)) ?? (await findLatestSubmitted(ctx));
  if (!draft) throw new PortalError("Start your bid before attaching a file.");

  const key = newStorageKey(`bid/${ctx.invitationId}`, file.filename);
  const adapter = storage();
  await adapter.put(key, file.data, file.contentType);
  await db.insert(bidAttachments).values({
    bidId: draft.id,
    invitationId: ctx.invitationId,
    storageKey: key,
    storageDriver: adapter.driver,
    filename: file.filename.slice(0, 200),
    contentType: file.contentType,
    bytes: file.data.byteLength,
  });
  await audit({
    companyId: ctx.companyId,
    actorKind: "invitation",
    actorId: ctx.invitationId,
    actorLabel: `${ctx.subCompany.name} (portal)`,
    action: "bid.attachment_added",
    target: `bid:${draft.id}`,
    metadata: { filename: file.filename, bytes: file.data.byteLength },
  });
}

/** An attachment this invitation uploaded — never another bidder's. */
export async function portalAttachment(
  ctx: PortalContext,
  attachmentId: string,
): Promise<BidAttachment | null> {
  if (!isUuid(attachmentId)) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(bidAttachments)
    .where(
      and(
        eq(bidAttachments.id, attachmentId),
        eq(bidAttachments.invitationId, ctx.invitationId),
      ),
    );
  return row ?? null;
}

export async function removePortalAttachment(
  ctx: PortalContext,
  attachmentId: string,
): Promise<void> {
  await requireOpen(ctx);
  const row = await portalAttachment(ctx, attachmentId);
  if (!row) return;
  const db = getDb();
  await db.delete(bidAttachments).where(eq(bidAttachments.id, row.id));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/* ------------------------------------------------------------------ helpers --- */

/**
 * Bids the GC currently holds for a package: latest submitted revision per
 * invitation. Used by the leveling loader — not reachable from a portal token.
 */
export async function activeBidIdsForPackage(
  companyId: string,
  tradePackageId: string,
): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: bids.id, invitationId: bids.invitationId, revision: bids.revision })
    .from(bids)
    .where(
      and(
        eq(bids.companyId, companyId),
        eq(bids.tradePackageId, tradePackageId),
        eq(bids.isDraft, false),
        isNull(bids.supersededById),
      ),
    );
  return rows.map((r) => r.id);
}

export async function bidLinesFor(bidIds: string[]) {
  if (bidIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(bidLines)
    .where(inArray(bidLines.bidId, bidIds))
    .orderBy(asc(bidLines.sort));
}

export function normalizedFormKey(description: string): string {
  return normalizeDescription(description);
}
