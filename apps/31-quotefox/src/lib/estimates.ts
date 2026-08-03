/**
 * Estimates: creating one from a draft, editing its rows, and keeping its totals
 * true.
 *
 * Totals are recomputed server-side from the rows on every write. The client
 * never sends a total, because a total that arrives from a browser is a total a
 * homeowner can be shown that the contractor never agreed to.
 *
 * Two rules the UI depends on:
 *
 *  - **Unpriced rows carry no money and block sending.** `needs pricing` rows are
 *    the honest output of a draft that could not match narration to the book; a
 *    proposal that quietly omits them would under-quote the job.
 *  - **A sent estimate is frozen.** Editing after sending creates the next
 *    version, so the proposal the homeowner opened cannot change under them.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  estimateLineItems,
  estimates,
  jobs,
  priceBookItems,
  walkthroughs,
  type DraftedLineItem,
  type Estimate,
  type EstimateLineItem,
  type Job,
  type Organization,
  type Unit,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { computeTotals, lineTotalCents } from "@/lib/money";
import type { DraftMeta } from "@/lib/drafting";

export interface EstimateWithLines {
  estimate: Estimate;
  lines: EstimateLineItem[];
  job: Job;
}

/* ------------------------------------------------------------------ reads --- */

export async function getEstimate(
  organizationId: string,
  estimateId: string,
): Promise<EstimateWithLines | null> {
  const db = getDb();
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.organizationId, organizationId), eq(estimates.id, estimateId)));
  if (!estimate) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, estimate.jobId));
  if (!job) return null;
  const lines = await db
    .select()
    .from(estimateLineItems)
    .where(eq(estimateLineItems.estimateId, estimate.id))
    .orderBy(asc(estimateLineItems.position));
  return { estimate, lines, job };
}

export async function latestEstimateForJob(
  organizationId: string,
  jobId: string,
): Promise<Estimate | null> {
  const db = getDb();
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.organizationId, organizationId), eq(estimates.jobId, jobId)))
    .orderBy(desc(estimates.version))
    .limit(1);
  return estimate ?? null;
}

/** Flagged rows first — DESIGN.md pins them to the top of the review screen. */
export function orderForReview(lines: readonly EstimateLineItem[]): EstimateLineItem[] {
  return [...lines].sort((a, b) => {
    if (a.needsPricing !== b.needsPricing) return a.needsPricing ? -1 : 1;
    return a.position - b.position;
  });
}

export function needsPricingCount(lines: readonly EstimateLineItem[]): number {
  return lines.filter((line) => line.needsPricing).length;
}

/* ------------------------------------------------------------------ totals --- */

/**
 * Recompute and persist subtotal / tax / total from the rows.
 *
 * Labour is not taxed: every state we can name taxes materials and most exempt
 * installation labour on residential work, and over-charging a homeowner tax is
 * worse than under-collecting it. The tax line is the org's rate applied to
 * material and flat-rate rows only, and the proposal says so.
 */
export async function recomputeTotals(estimateId: string): Promise<Estimate> {
  const db = getDb();
  const lines = await db
    .select({
      lineTotalCents: estimateLineItems.lineTotalCents,
      needsPricing: estimateLineItems.needsPricing,
      priceBookItemId: estimateLineItems.priceBookItemId,
      kind: priceBookItems.kind,
    })
    .from(estimateLineItems)
    .leftJoin(priceBookItems, eq(estimateLineItems.priceBookItemId, priceBookItems.id))
    .where(eq(estimateLineItems.estimateId, estimateId));

  const [current] = await db.select().from(estimates).where(eq(estimates.id, estimateId));
  const totals = computeTotals(
    lines.map((line) => ({
      lineTotalCents: line.lineTotalCents,
      needsPricing: line.needsPricing,
      taxable: line.kind !== "labor",
    })),
    current?.taxRateBp ?? 0,
  );

  const [updated] = await db
    .update(estimates)
    .set({
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      updatedAt: new Date(),
    })
    .where(eq(estimates.id, estimateId))
    .returning();
  return updated;
}

/* ----------------------------------------------------------------- drafts --- */

export interface CreateFromDraftArgs {
  org: Organization;
  job: Job;
  walkthroughId: string | null;
  rows: DraftedLineItem[];
  meta: DraftMeta;
  scopeSummary: string | null;
}

/**
 * Write a drafted estimate.
 *
 * Version numbers come from the job's existing estimates, so a re-run of the
 * pipeline produces version 2 rather than silently replacing version 1 — the
 * contractor may already have sent version 1 to the homeowner.
 */
export async function createEstimateFromDraft(args: CreateFromDraftArgs): Promise<Estimate> {
  const db = getDb();
  const previous = await latestEstimateForJob(args.org.id, args.job.id);
  const version = (previous?.version ?? 0) + 1;

  const [estimate] = await db
    .insert(estimates)
    .values({
      organizationId: args.org.id,
      jobId: args.job.id,
      walkthroughId: args.walkthroughId,
      version,
      status: "draft",
      scopeSummary: args.scopeSummary,
      taxRateBp: args.org.taxRateBp,
      depositType: args.org.defaultDepositType,
      depositValue: args.org.defaultDepositValue,
      draftedByModel: args.meta.model,
      promptVersion: args.meta.promptVersion,
      draftDurationMs: args.meta.durationMs,
    })
    .returning();

  if (args.rows.length) {
    await db.insert(estimateLineItems).values(
      args.rows.map((row, index) => ({
        estimateId: estimate.id,
        organizationId: args.org.id,
        position: index,
        priceBookItemId: row.priceBookItemId,
        name: row.name,
        description: row.description ?? null,
        quantityMilli: row.quantityMilli,
        unit: row.unit,
        unitPriceCents: row.needsPricing ? 0 : row.unitPriceCents,
        lineTotalCents: row.needsPricing ? 0 : lineTotalCents(row.quantityMilli, row.unitPriceCents),
        needsPricing: row.needsPricing,
        source: "ai" as const,
        transcriptExcerpt: row.transcriptExcerpt || null,
        transcriptOffsetSeconds: row.transcriptOffsetSeconds,
      })),
    );
  }

  const withTotals = await recomputeTotals(estimate.id);
  await audit(args.org.id, "ai", "draft_created", `${args.job.title} v${version}`, {
    model: args.meta.model,
    promptVersion: args.meta.promptVersion,
    rows: args.rows.length,
    needsPricing: args.rows.filter((row) => row.needsPricing).length,
    degraded: args.meta.degraded,
    durationMs: args.meta.durationMs,
  });
  return withTotals;
}

/* ------------------------------------------------------------------ edits --- */

export type EditResult = { ok: true } | { ok: false; error: string };

function editable(estimate: Estimate): EditResult {
  if (estimate.status === "sent") {
    return {
      ok: false,
      error:
        "This estimate has already been sent. Duplicate it to make changes — the homeowner is looking at this version.",
    };
  }
  return { ok: true };
}

export interface LineInput {
  name: string;
  description?: string | null;
  quantityMilli: number;
  unit: Unit;
  unitPriceCents: number;
  priceBookItemId?: string | null;
}

export async function addLineItem(
  org: Organization,
  actorId: string,
  estimateId: string,
  input: LineInput,
): Promise<EditResult> {
  const db = getDb();
  const found = await getEstimate(org.id, estimateId);
  if (!found) return { ok: false, error: "That estimate no longer exists." };
  const gate = editable(found.estimate);
  if (!gate.ok) return gate;
  if (!input.name.trim()) return { ok: false, error: "Give the line a name." };

  const position = found.lines.reduce((max, line) => Math.max(max, line.position), -1) + 1;
  await db.insert(estimateLineItems).values({
    estimateId,
    organizationId: org.id,
    position,
    priceBookItemId: input.priceBookItemId ?? null,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    quantityMilli: Math.max(1, Math.round(input.quantityMilli)),
    unit: input.unit,
    unitPriceCents: Math.max(0, Math.round(input.unitPriceCents)),
    lineTotalCents: lineTotalCents(input.quantityMilli, input.unitPriceCents),
    needsPricing: false,
    source: "manual",
  });
  await recomputeTotals(estimateId);
  await audit(org.id, actorId, "line_item_added", input.name.trim(), {
    estimateId,
    unitPriceCents: input.unitPriceCents,
  });
  return { ok: true };
}

export interface LinePatch {
  name?: string;
  quantityMilli?: number;
  unitPriceCents?: number;
  unit?: Unit;
  description?: string | null;
}

/**
 * Edit one row. Pricing a flagged row clears the flag — that is the whole
 * `needs pricing` workflow: the contractor supplies the number the AI refused to
 * invent, and the row becomes ordinary.
 */
export async function updateLineItem(
  org: Organization,
  actorId: string,
  estimateId: string,
  lineId: string,
  patch: LinePatch,
): Promise<EditResult> {
  const db = getDb();
  const found = await getEstimate(org.id, estimateId);
  if (!found) return { ok: false, error: "That estimate no longer exists." };
  const gate = editable(found.estimate);
  if (!gate.ok) return gate;
  const line = found.lines.find((candidate) => candidate.id === lineId);
  if (!line) return { ok: false, error: "That line is already gone." };

  const name = patch.name?.trim() || line.name;
  const quantityMilli = Math.max(
    1,
    Math.round(patch.quantityMilli ?? line.quantityMilli),
  );
  const unitPriceCents = Math.max(0, Math.round(patch.unitPriceCents ?? line.unitPriceCents));
  const unit = patch.unit ?? line.unit;
  const stillNeedsPricing = line.needsPricing && unitPriceCents <= 0;

  await db
    .update(estimateLineItems)
    .set({
      name,
      description: patch.description === undefined ? line.description : patch.description,
      quantityMilli,
      unit,
      unitPriceCents,
      lineTotalCents: stillNeedsPricing ? 0 : lineTotalCents(quantityMilli, unitPriceCents),
      needsPricing: stillNeedsPricing,
      source: line.source === "ai" && !line.needsPricing ? "ai" : line.source,
    })
    .where(and(eq(estimateLineItems.id, lineId), eq(estimateLineItems.organizationId, org.id)));

  await recomputeTotals(estimateId);
  await audit(org.id, actorId, "line_item_edited", name, {
    estimateId,
    from: { quantityMilli: line.quantityMilli, unitPriceCents: line.unitPriceCents },
    to: { quantityMilli, unitPriceCents },
    clearedFlag: line.needsPricing && !stillNeedsPricing,
  });
  return { ok: true };
}

export async function removeLineItem(
  org: Organization,
  actorId: string,
  estimateId: string,
  lineId: string,
): Promise<EditResult> {
  const db = getDb();
  const found = await getEstimate(org.id, estimateId);
  if (!found) return { ok: false, error: "That estimate no longer exists." };
  const gate = editable(found.estimate);
  if (!gate.ok) return gate;
  const line = found.lines.find((candidate) => candidate.id === lineId);
  if (!line) return { ok: true };

  await db
    .delete(estimateLineItems)
    .where(and(eq(estimateLineItems.id, lineId), eq(estimateLineItems.organizationId, org.id)));
  await recomputeTotals(estimateId);
  await audit(org.id, actorId, "line_item_removed", line.name, { estimateId });
  return { ok: true };
}

export interface EstimateSettingsPatch {
  taxRateBp?: number;
  depositType?: Estimate["depositType"];
  depositValue?: number;
  scopeSummary?: string | null;
}

export async function updateEstimateSettings(
  org: Organization,
  actorId: string,
  estimateId: string,
  patch: EstimateSettingsPatch,
): Promise<EditResult> {
  const db = getDb();
  const found = await getEstimate(org.id, estimateId);
  if (!found) return { ok: false, error: "That estimate no longer exists." };
  const gate = editable(found.estimate);
  if (!gate.ok) return gate;

  await db
    .update(estimates)
    .set({
      taxRateBp:
        patch.taxRateBp === undefined
          ? found.estimate.taxRateBp
          : Math.max(0, Math.min(2_500, Math.round(patch.taxRateBp))),
      depositType: patch.depositType ?? found.estimate.depositType,
      depositValue:
        patch.depositValue === undefined
          ? found.estimate.depositValue
          : Math.max(0, Math.round(patch.depositValue)),
      scopeSummary:
        patch.scopeSummary === undefined ? found.estimate.scopeSummary : patch.scopeSummary,
      updatedAt: new Date(),
    })
    .where(eq(estimates.id, estimateId));
  await recomputeTotals(estimateId);
  await audit(org.id, actorId, "estimate_updated", `${found.job.title} v${found.estimate.version}`, {
    ...patch,
  });
  return { ok: true };
}

/** A one-line scope summary for the proposal, from the drafted rows. */
export function scopeSummaryFrom(rows: readonly DraftedLineItem[], jobTitle: string): string {
  const priced = rows.filter((row) => !row.needsPricing).slice(0, 3);
  if (!priced.length) return jobTitle;
  const names = priced.map((row) => row.name.split(",")[0].toLowerCase());
  const rest = rows.filter((row) => !row.needsPricing).length - priced.length;
  return `${jobTitle}: ${names.join(", ")}${rest > 0 ? ` and ${rest} more line${rest === 1 ? "" : "s"}` : ""}.`;
}

/** Duplicate a sent estimate into the next version so it can be revised. */
export async function duplicateEstimate(
  org: Organization,
  actorId: string,
  estimateId: string,
): Promise<{ ok: true; estimateId: string } | { ok: false; error: string }> {
  const db = getDb();
  const found = await getEstimate(org.id, estimateId);
  if (!found) return { ok: false, error: "That estimate no longer exists." };
  const previous = await latestEstimateForJob(org.id, found.job.id);
  const version = (previous?.version ?? found.estimate.version) + 1;

  const [copy] = await db
    .insert(estimates)
    .values({
      organizationId: org.id,
      jobId: found.job.id,
      walkthroughId: found.estimate.walkthroughId,
      version,
      status: "draft",
      scopeSummary: found.estimate.scopeSummary,
      taxRateBp: found.estimate.taxRateBp,
      depositType: found.estimate.depositType,
      depositValue: found.estimate.depositValue,
      draftedByModel: found.estimate.draftedByModel,
      promptVersion: found.estimate.promptVersion,
    })
    .returning();

  if (found.lines.length) {
    await db.insert(estimateLineItems).values(
      found.lines.map((line) => ({
        estimateId: copy.id,
        organizationId: org.id,
        position: line.position,
        priceBookItemId: line.priceBookItemId,
        name: line.name,
        description: line.description,
        quantityMilli: line.quantityMilli,
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.lineTotalCents,
        needsPricing: line.needsPricing,
        source: line.source,
        transcriptExcerpt: line.transcriptExcerpt,
        transcriptOffsetSeconds: line.transcriptOffsetSeconds,
      })),
    );
  }
  await recomputeTotals(copy.id);
  await audit(org.id, actorId, "estimate_updated", `${found.job.title} v${version} created`, {
    from: estimateId,
  });
  return { ok: true, estimateId: copy.id };
}

/** The walkthrough behind an estimate, for the transcript panel. */
export async function walkthroughFor(estimate: Estimate) {
  if (!estimate.walkthroughId) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(walkthroughs)
    .where(eq(walkthroughs.id, estimate.walkthroughId));
  return row ?? null;
}
