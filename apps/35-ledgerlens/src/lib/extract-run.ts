/**
 * The extraction job: take a stored document, read it, and land it in the inbox as
 * confirmed, flagged, or rejected.
 *
 * Called from `/api/cron/tick` (via `lib/sweep.ts`), from `next/server`'s `after()`
 * right after an upload so the operator sees it happen, and from the optional worker
 * loop. All three call exactly this function, and it is idempotent: the claim is a
 * conditional `UPDATE … WHERE status = 'queued'` evaluated by Postgres, so two
 * callers racing on the same document produce one extraction, not two.
 *
 * Notably absent: any comparison of a JavaScript `Date` against a `timestamptz` to
 * decide whether a row is claimable. JS truncates to milliseconds and Postgres keeps
 * microseconds, so a row stamped by SQL `now()` reads as "due" and then never gets
 * claimed — a queue that silently stops. The database does its own comparisons here.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  documents,
  extractions,
  lineItems,
  organizations,
  reviewItems,
  type DocumentRow,
  type FieldConfidence,
  type Organization,
  type ReviewField,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { categoryHintFor, normalizeVendor, resolveCategory } from "@/lib/categorize";
import {
  DEFAULT_POLICY,
  decide,
  shouldEscalate,
  toBp,
  type ConfidencePolicy,
  type Decision,
} from "@/lib/confidence";
import { STALE_EXTRACTING_MS, findDuplicateCandidate } from "@/lib/documents";
import { getExtractor, type ExtractionOutcome, type Extractor } from "@/lib/extraction";
import { bumpUsage, categoryBySlug, currentPeriod, usageFor } from "@/lib/org";
import { planCap } from "@/lib/plans";
import { getObject } from "@/lib/storage";
import { bumpVendorDocumentCount, upsertVendor } from "@/lib/vendors";

const MAX_ATTEMPTS = 3;

export type ExtractOutcomeKind =
  | "confirmed"
  | "needs_review"
  | "rejected"
  | "parked"
  | "retry"
  | "skipped";

export interface ExtractRunResult {
  documentId: string;
  outcome: ExtractOutcomeKind;
  /** Present for confirmed / needs_review / rejected. */
  reason?: string;
  costMicrocents: number;
  durationMs: number;
}

/**
 * Claim the document for extraction.
 *
 * The `where` clause is the lock: `queued`, or `extracting` for longer than the
 * stale window (a process that died mid-run must not strand a document forever).
 * The interval is written in SQL so Postgres compares its own clock to its own
 * column.
 */
async function claim(documentId: string): Promise<DocumentRow | null> {
  const staleSeconds = Math.round(STALE_EXTRACTING_MS / 1000);
  const [row] = await getDb()
    .update(documents)
    .set({ status: "extracting", extractingSince: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(documents.id, documentId),
        isNull(documents.duplicateOfId),
        or(
          eq(documents.status, "queued"),
          and(
            eq(documents.status, "extracting"),
            sql`${documents.extractingSince} < now() - (${staleSeconds} * interval '1 second')`,
          ),
        ),
      ),
    )
    .returning();
  return row ?? null;
}

async function release(documentId: string, status: DocumentRow["status"]): Promise<void> {
  await getDb()
    .update(documents)
    .set({ status, extractingSince: null, updatedAt: sql`now()` })
    .where(eq(documents.id, documentId));
}

/**
 * Run extraction for one document.
 *
 * @param force re-run a document that has already been extracted (the "Re-run
 *              extraction" action on a rejected or wrong reading).
 */
export async function extractDocument(
  documentId: string,
  opts: { force?: boolean; extractor?: Extractor; policy?: ConfidencePolicy } = {},
): Promise<ExtractRunResult> {
  const db = getDb();
  const policy = opts.policy ?? DEFAULT_POLICY;

  if (opts.force) {
    await db
      .update(documents)
      .set({ status: "queued", failureReason: null, extractingSince: null, updatedAt: sql`now()` })
      .where(and(eq(documents.id, documentId), isNull(documents.duplicateOfId)));
  }

  const doc = await claim(documentId);
  if (!doc) {
    return { documentId, outcome: "skipped", costMicrocents: 0, durationMs: 0 };
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, doc.organizationId));
  if (!org) {
    await release(documentId, "queued");
    return { documentId, outcome: "skipped", costMicrocents: 0, durationMs: 0 };
  }

  // Soft plan cap: park, do not fail, do not bill. The document stays `queued` and
  // the inbox derives "OVER CAP" from the same counter this check reads, so the
  // notice can never disagree with the decision.
  const period = currentPeriod(org);
  const usage = await usageFor(org.id, period);
  if (usage.documentsExtracted >= planCap(org.plan)) {
    await release(documentId, "queued");
    return { documentId, outcome: "parked", costMicrocents: 0, durationMs: 0 };
  }

  const priorAttempts = await countAttempts(documentId);
  const extractor = opts.extractor ?? getExtractor();

  let bytes: Uint8Array;
  try {
    bytes = await getObject(doc.storageKey);
  } catch {
    await recordFailure(doc, org, extractor, priorAttempts + 1, {
      ok: false,
      failure: "error",
      message: "The stored original could not be read.",
      raw: null,
      durationMs: 0,
      costMicrocents: 0,
      model: "n/a",
      escalated: false,
    });
    return { documentId, outcome: "rejected", reason: "extractor_error", costMicrocents: 0, durationMs: 0 };
  }

  let outcome = await extractor.extract({
    bytes,
    mimeType: doc.mimeType,
    filename: doc.originalFilename,
    text: doc.sourceText,
    contentHash: doc.contentHash,
  });

  let cost = outcome.costMicrocents;
  let duration = outcome.durationMs;
  let attempt = priorAttempts + 1;

  if (!outcome.ok) {
    const transient = outcome.failure === "timeout" || outcome.failure === "error";
    await writeExtraction(doc, org, extractor, attempt, outcome);
    await bumpUsage(org.id, period, { extracted: 1, costMicrocents: cost });
    if (transient && attempt < MAX_ATTEMPTS) {
      await release(documentId, "queued");
      return { documentId, outcome: "retry", reason: outcome.failure, costMicrocents: cost, durationMs: duration };
    }
    await failDocument(doc, org, outcome.failure === "refused" ? "not_financial" : "extractor_error");
    return {
      documentId,
      outcome: "rejected",
      reason: outcome.failure,
      costMicrocents: cost,
      durationMs: duration,
    };
  }

  // Escalate a middling reading to the stronger model *before* asking a human. A
  // second machine opinion is cheaper than an operator's attention.
  let firstRunId: string | null = null;
  {
    const provisional = await decideFor(org.id, outcome, policy);
    if (extractor.canEscalate && shouldEscalate(provisional.overall, false, policy)) {
      firstRunId = await writeExtraction(doc, org, extractor, attempt, outcome);
      attempt += 1;
      const second = await extractor.extract(
        {
          bytes,
          mimeType: doc.mimeType,
          filename: doc.originalFilename,
          text: doc.sourceText,
          contentHash: doc.contentHash,
        },
        { escalate: true },
      );
      cost += second.costMicrocents;
      duration += second.durationMs;
      if (second.ok) {
        const escalatedDecision = await decideFor(org.id, second, policy);
        if (escalatedDecision.overall >= provisional.overall) outcome = second;
      }
    }
  }

  if (!outcome.ok) {
    await writeExtraction(doc, org, extractor, attempt, outcome);
    await bumpUsage(org.id, period, { extracted: 1, costMicrocents: cost });
    await failDocument(doc, org, "extractor_error");
    return { documentId, outcome: "rejected", reason: "extractor_error", costMicrocents: cost, durationMs: duration };
  }

  const applied = await applyExtraction(doc, org, outcome, policy);
  await writeExtraction(doc, org, extractor, attempt, outcome, applied.decision, applied.categorySlug);
  await bumpUsage(org.id, period, { extracted: 1, costMicrocents: cost });
  void firstRunId;

  return {
    documentId,
    outcome: applied.decision.status,
    reason: applied.decision.status === "rejected" ? applied.decision.reason : undefined,
    costMicrocents: cost,
    durationMs: duration,
  };
}

async function countAttempts(documentId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(extractions)
    .where(eq(extractions.documentId, documentId));
  return Number(rows[0]?.n ?? 0);
}

/**
 * The confidence map the policy actually sees, once vendor rules have had their say.
 *
 * When a learned rule supplies the category there is nothing to be unsure about, so
 * category confidence is 1. When the model's suggestion is used it keeps its own
 * score. When neither applies, the low score rides through and the field gets
 * flagged — which is the "learned rule makes month six quiet" mechanism, expressed
 * as arithmetic.
 */
async function decideFor(
  organizationId: string,
  outcome: Extract<ExtractionOutcome, { ok: true }>,
  policy: ConfidencePolicy,
): Promise<Decision & { categorySlug: string | null; confidence: FieldConfidence }> {
  const result = outcome.result;
  const normalized = result.vendor ? normalizeVendor(result.vendor) : "";
  let ruleSlug: string | null = null;
  if (normalized) {
    const { ruleSlug: found } = await upsertVendor(organizationId, result.vendor as string);
    ruleSlug = found;
  }
  const decision = buildDecision(result.confidence, {
    ruleSlug,
    modelSlug: result.suggestedCategory,
    modelConfidence: result.confidence.category ?? 0,
    hintSlug: normalized ? categoryHintFor(normalized) : null,
    hasVendor: Boolean(result.vendor),
    hasDate: Boolean(result.docDate),
    hasTotal: result.totalCents !== null,
    hasTax: result.taxCents !== null,
    policy,
  });
  return decision;
}

interface BuildDecisionInput {
  ruleSlug: string | null;
  modelSlug: string | null;
  modelConfidence: number;
  hintSlug: string | null;
  hasVendor: boolean;
  hasDate: boolean;
  hasTotal: boolean;
  hasTax: boolean;
  policy: ConfidencePolicy;
}

export function buildDecision(
  modelConfidence: FieldConfidence,
  input: BuildDecisionInput,
): Decision & { categorySlug: string | null; confidence: FieldConfidence } {
  const category = resolveCategory({
    ruleSlug: input.ruleSlug,
    modelSlug: input.modelSlug,
    modelConfidence: input.modelConfidence,
    hintSlug: input.hintSlug,
    autoThreshold: input.policy.auto,
  });

  const confidence: FieldConfidence = { ...modelConfidence };
  if (category.source === "rule") confidence.category = 1;
  else if (category.source === "model") confidence.category = input.modelConfidence;
  else confidence.category = input.modelConfidence || (category.slug ? 0.6 : 0);

  const decision = decide(
    {
      present: {
        vendor: input.hasVendor,
        date: input.hasDate,
        total: input.hasTotal,
        tax: input.hasTax,
        category: true,
      },
      confidence,
    },
    input.policy,
  );

  return { ...decision, categorySlug: category.slug, confidence };
}

/** Write the line item draft / review items / status. */
async function applyExtraction(
  doc: DocumentRow,
  org: Organization,
  outcome: Extract<ExtractionOutcome, { ok: true }>,
  policy: ConfidencePolicy,
): Promise<{ decision: Decision; categorySlug: string | null; confidence: FieldConfidence }> {
  const db = getDb();
  const result = outcome.result;
  const decided = await decideFor(org.id, outcome, policy);

  // A re-run replaces the previous reading wholesale, so a stale flag cannot survive.
  await db.delete(reviewItems).where(eq(reviewItems.documentId, doc.id));

  if (decided.status === "rejected") {
    await db.delete(lineItems).where(eq(lineItems.documentId, doc.id));
    await db
      .update(documents)
      .set({
        status: "rejected",
        failureReason: decided.reason,
        extractingSince: null,
        extractedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(documents.id, doc.id));
    await audit(org.id, SYSTEM, "document.rejected", doc.id, { reason: decided.reason });
    return decided;
  }

  const vendorRecord = await upsertVendor(org.id, result.vendor as string);
  const category = decided.categorySlug ? await categoryBySlug(decided.categorySlug) : null;
  const confirmed = decided.status === "confirmed";

  const [existing] = await db.select().from(lineItems).where(eq(lineItems.documentId, doc.id));
  const values = {
    organizationId: org.id,
    documentId: doc.id,
    vendorId: vendorRecord.vendor.id,
    categoryId: category?.id ?? null,
    docDate: result.docDate as string,
    amountCents: result.totalCents as number,
    taxCents: result.taxCents,
    currency: result.currency,
    memo: result.lineSummary,
    confirmedBy: confirmed ? "system" : null,
    confirmedAt: confirmed ? sql`now()` : null,
  } as const;

  if (existing) {
    await db
      .update(lineItems)
      .set({ ...values, updatedAt: sql`now()` })
      .where(eq(lineItems.id, existing.id));
  } else {
    await db.insert(lineItems).values(values);
    await bumpVendorDocumentCount(vendorRecord.vendor.id);
  }

  if (!confirmed) {
    await db.insert(reviewItems).values(
      decided.flagged.map((f) => ({
        organizationId: org.id,
        documentId: doc.id,
        field: f.field as ReviewField,
        suggestedValue: suggestedValueFor(f.field, result, decided.categorySlug),
        confidenceBp: toBp(f.confidence),
      })),
    );
  }

  const candidate = await findDuplicateCandidate(
    org.id,
    doc.id,
    vendorRecord.vendor.id,
    result.docDate as string,
    result.totalCents as number,
  );

  await db
    .update(documents)
    .set({
      status: confirmed ? "confirmed" : "needs_review",
      failureReason: null,
      duplicateCandidateOfId: candidate?.documentId ?? null,
      extractingSince: null,
      extractedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(documents.id, doc.id));

  if (confirmed) {
    await audit(org.id, SYSTEM, "document.confirmed", doc.id, {
      vendor: vendorRecord.vendor.displayName,
      amountCents: result.totalCents,
      auto: true,
    });
  }

  return decided;
}

function suggestedValueFor(
  field: ReviewField,
  result: Extract<ExtractionOutcome, { ok: true }>["result"],
  categorySlug: string | null,
): string | null {
  switch (field) {
    case "vendor":
      return result.vendor;
    case "date":
      return result.docDate;
    case "total":
      return result.totalCents === null ? null : String(result.totalCents);
    case "tax":
      return result.taxCents === null ? null : String(result.taxCents);
    case "category":
      return categorySlug;
    default:
      return null;
  }
}

async function writeExtraction(
  doc: DocumentRow,
  org: Organization,
  extractor: Extractor,
  attempt: number,
  outcome: ExtractionOutcome,
  decision?: Decision,
  categorySlug?: string | null,
): Promise<string> {
  const db = getDb();
  const base = {
    organizationId: org.id,
    documentId: doc.id,
    extractor: extractor.name,
    model: outcome.model,
    attempt,
    escalated: outcome.escalated,
    rawResponse: (outcome.raw ?? null) as never,
    durationMs: outcome.durationMs,
    costMicrocents: outcome.costMicrocents,
  };

  if (!outcome.ok) {
    const [row] = await db
      .insert(extractions)
      .values({ ...base, failure: outcome.failure, confidence: {}, overallConfidenceBp: 0 })
      .returning({ id: extractions.id });
    return row.id;
  }

  const r = outcome.result;
  const [row] = await db
    .insert(extractions)
    .values({
      ...base,
      vendorName: r.vendor,
      docType: r.docType,
      docDate: r.docDate,
      totalCents: r.totalCents,
      taxCents: r.taxCents,
      currency: r.currency,
      lineSummary: r.lineSummary,
      suggestedCategorySlug: categorySlug ?? r.suggestedCategory,
      confidence: decision ? confidenceOf(decision) : r.confidence,
      overallConfidenceBp: toBp(decision?.overall ?? 0),
    })
    .returning({ id: extractions.id });
  return row.id;
}

function confidenceOf(decision: Decision & { confidence?: FieldConfidence }): FieldConfidence {
  return decision.confidence ?? {};
}

async function failDocument(
  doc: DocumentRow,
  org: Organization,
  reason: string,
): Promise<void> {
  const db = getDb();
  await db.delete(reviewItems).where(eq(reviewItems.documentId, doc.id));
  await db.delete(lineItems).where(eq(lineItems.documentId, doc.id));
  await db
    .update(documents)
    .set({
      status: "rejected",
      failureReason: reason,
      extractingSince: null,
      extractedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(documents.id, doc.id));
  await audit(org.id, SYSTEM, "document.rejected", doc.id, { reason });
}

async function recordFailure(
  doc: DocumentRow,
  org: Organization,
  extractor: Extractor,
  attempt: number,
  outcome: ExtractionOutcome,
): Promise<void> {
  await writeExtraction(doc, org, extractor, attempt, outcome);
  await failDocument(doc, org, "extractor_error");
}
