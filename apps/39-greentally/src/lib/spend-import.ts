/**
 * The database side of the spend pipeline: mapping confirmation, storage, the model
 * tail, and operator confirmations.
 *
 * `lib/spend.ts` holds the pure logic (parsing, exclusion rules, classification) and is
 * where the tests live. This file only moves rows.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  documents,
  organizations,
  reportingPeriods,
  spendLines,
  type SpendLine,
} from "@/db/schema";
import { EEIO_BY_SLUG } from "@/db/factors";
import { audit, SYSTEM } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";
import { enqueue, enqueueRecompute } from "@/lib/jobs";
import { getDocumentBytes } from "@/lib/storage";
import {
  classifyLine,
  getClassifier,
  parseSpendCsv,
  readCsvHeaders,
  summarise,
  type SpendMapping,
} from "@/lib/spend";

export async function csvTextFor(documentId: string): Promise<string> {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new ValidationError("That import no longer exists.");
  const bytes = await getDocumentBytes(doc.id, doc.storageKey);
  return Buffer.from(bytes).toString("utf8");
}

export async function previewSpendCsv(documentId: string) {
  return readCsvHeaders(await csvTextFor(documentId));
}

export interface ApplyMappingInput {
  documentId: string;
  organizationId: string;
  mapping: SpendMapping;
  userId: string;
  userLabel: string;
}

/**
 * Parse the CSV with a confirmed mapping, classify every line deterministically, and
 * store the result. Re-running replaces the previous import of the same file, so an
 * operator who mapped the wrong column can just map it again.
 */
export async function applySpendMapping(input: ApplyMappingInput): Promise<{ rows: number }> {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.id, input.documentId), eq(documents.organizationId, input.organizationId)),
    );
  if (!doc) throw new ValidationError("That import no longer exists.");
  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, doc.periodId));
  if (period?.lockedAt) {
    throw new ValidationError(`Reporting year ${period.year} is locked.`);
  }

  const text = await csvTextFor(doc.id);
  const rows = parseSpendCsv(text, input.mapping);

  const classified = rows.map((r) => {
    const c = classifyLine(r.description, r.glAccount);
    return {
      organizationId: doc.organizationId,
      documentId: doc.id,
      periodId: doc.periodId,
      rowNumber: r.rowNumber,
      description: r.description,
      amountCents: r.amountCents,
      currency: "USD",
      glAccount: r.glAccount,
      spendDate: r.spendDate,
      eeioCategory: c.eeioCategory,
      classificationSource: c.eeioCategory ? ("auto" as const) : null,
      classificationConfidenceBp: c.eeioCategory ? c.confidenceBp : null,
      classificationReason: c.reason,
      excluded: c.excluded,
      exclusionReason: c.exclusionReason,
    };
  });

  await db.transaction(async (tx) => {
    await tx.delete(spendLines).where(eq(spendLines.documentId, doc.id));
    for (let i = 0; i < classified.length; i += 500) {
      await tx.insert(spendLines).values(classified.slice(i, i + 500));
    }
    await tx
      .update(documents)
      .set({ status: "accepted", error: null, updatedAt: new Date() })
      .where(eq(documents.id, doc.id));
    // Remember the mapping so the next month's export is one click.
    const [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId));
    await tx
      .update(organizations)
      .set({ settings: { ...org.settings, spendMapping: input.mapping }, updatedAt: new Date() })
      .where(eq(organizations.id, input.organizationId));
  });

  const summary = summarise(classified);
  await audit({
    organizationId: doc.organizationId,
    actor: input.userId,
    actorLabel: input.userLabel,
    action: "spend.imported",
    target: doc.filename,
    metadata: {
      rows: summary.rows,
      included: summary.includedRows,
      excluded: summary.excludedRows,
      unclassified: summary.unclassifiedRows,
      mapping: input.mapping as unknown as Record<string, unknown>,
    },
  });

  // The model tail runs in the background; the operator can start confirming now.
  if (summary.unclassifiedRows > 0 && getClassifier()) {
    await enqueue({
      organizationId: doc.organizationId,
      kind: "classify_spend",
      payload: { documentId: doc.id },
    });
  }
  await enqueueRecompute(doc.organizationId, doc.periodId);

  return { rows: summary.rows };
}

/**
 * The model tail: whatever the keyword rules could not place.
 *
 * Suggestions arrive as `auto` with the model's confidence and are never marked
 * confirmed — the review table still shows them as suggestions until an operator says
 * yes. Without an API key this job does nothing at all, which is a complete product:
 * the operator assigns those lines themselves.
 */
export async function classifySpendTail(documentId: string): Promise<void> {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return;
  const classifier = getClassifier();
  if (!classifier) return;

  const pending = await db
    .select()
    .from(spendLines)
    .where(
      and(
        eq(spendLines.documentId, doc.id),
        isNull(spendLines.eeioCategory),
        eq(spendLines.excluded, false),
      ),
    );
  if (pending.length === 0) return;

  const outcome = await classifier.suggest(
    pending.map((l) => ({
      rowNumber: l.rowNumber,
      description: l.description,
      glAccount: l.glAccount,
    })),
  );
  if (!outcome.ok) {
    await audit({
      organizationId: doc.organizationId,
      actor: SYSTEM,
      action: "spend.classify_failed",
      target: doc.filename,
      metadata: { message: outcome.message },
    });
    return;
  }

  const byRow = new Map(pending.map((l) => [l.rowNumber, l]));
  let applied = 0;
  for (const s of outcome.suggestions) {
    const line = byRow.get(s.rowNumber);
    if (!line) continue;
    await db
      .update(spendLines)
      .set({
        eeioCategory: s.eeioCategory,
        classificationSource: "auto",
        classificationConfidenceBp: s.confidenceBp,
        classificationReason: `Suggested by ${classifier.name}`,
      })
      .where(eq(spendLines.id, line.id));
    applied += 1;
  }

  if (applied > 0) {
    await audit({
      organizationId: doc.organizationId,
      actor: SYSTEM,
      action: "spend.classified",
      target: doc.filename,
      metadata: { count: applied, category: "model suggestions" },
    });
    await enqueueRecompute(doc.organizationId, doc.periodId);
  }
}

/* -------------------------------------------------------- operator decisions --- */

export interface ConfirmInput {
  organizationId: string;
  periodId: string;
  userId: string;
  userLabel: string;
  lineIds: string[];
  category: string | null;
  excluded: boolean;
  exclusionReason?: string;
}

export async function setSpendCategory(input: ConfirmInput): Promise<number> {
  if (input.lineIds.length === 0) return 0;
  if (input.category && !EEIO_BY_SLUG.has(input.category)) {
    throw new ValidationError("That is not a category in the bundled USEEIO set.");
  }
  const db = getDb();
  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, input.periodId));
  if (period?.lockedAt) throw new ValidationError(`Reporting year ${period.year} is locked.`);

  await db
    .update(spendLines)
    .set({
      eeioCategory: input.category,
      classificationSource: "user",
      classificationConfidenceBp: 10_000,
      classificationReason: "Confirmed by you",
      excluded: input.excluded,
      exclusionReason: input.excluded ? (input.exclusionReason || "Excluded by you") : "",
    })
    .where(
      and(
        eq(spendLines.organizationId, input.organizationId),
        inArray(spendLines.id, input.lineIds),
      ),
    );

  await audit({
    organizationId: input.organizationId,
    actor: input.userId,
    actorLabel: input.userLabel,
    action: "spend.classified",
    target: input.category ? (EEIO_BY_SLUG.get(input.category)?.label ?? input.category) : "excluded",
    metadata: {
      count: input.lineIds.length,
      category: input.category ?? "excluded",
      excluded: input.excluded,
    },
  });

  await enqueueRecompute(input.organizationId, input.periodId);
  return input.lineIds.length;
}

/** Every spend line of a period, newest import first. */
export async function listSpendLines(periodId: string): Promise<SpendLine[]> {
  return getDb()
    .select()
    .from(spendLines)
    .where(eq(spendLines.periodId, periodId))
    .orderBy(spendLines.rowNumber);
}

/** Distinct GL accounts, for the bulk-by-account action. */
export function glAccountGroups(lines: SpendLine[]): { account: string; lines: SpendLine[] }[] {
  const groups = new Map<string, SpendLine[]>();
  for (const l of lines) {
    const key = l.glAccount || "(no account)";
    const list = groups.get(key) ?? [];
    list.push(l);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([account, list]) => ({ account, lines: list }))
    .sort((a, b) => b.lines.length - a.lines.length);
}
