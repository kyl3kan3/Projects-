/**
 * src/lib/contracts.ts
 *
 * Contract intake and report assembly — the data layer the screens read.
 *
 * Parsing happens *inside the upload call*, on purpose. It takes a few hundred
 * milliseconds and it is the one stage whose failures are the reader's fault and
 * fixable: a scanned PDF, a 200-page master agreement, a restaurant menu. Doing it
 * here means those come back on the upload form as a sentence the reader can act on,
 * instead of arriving twenty seconds later as a failed review.
 *
 * The credit is reserved after the parse succeeds, so an unreadable file never costs
 * anyone $19.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkerHits,
  clauses as clausesTable,
  contractTexts,
  contracts,
  flags as flagsTable,
  redlines as redlinesTable,
  reports,
  type Clause,
  type ClauseType,
  type Contract,
  type ContractType,
  type CoverageEntry,
  type Flag,
  type Redline,
  type Report,
  type Severity,
  type SourceKind,
} from "@/db/schema";
import { ParseError, parseDocx, parsePdf, parseText, type ParseResult } from "@/lib/parse";
import { citationFor } from "@/lib/extract";
import { CLAUSE_LABELS, CLAUSE_ORDER, CONTRACT_TYPE_LABELS } from "@/lib/taxonomy";
import { clauseSummary } from "@/lib/summaries";
import { severityRank, worstSeverity } from "@/lib/playbook";
import { NoCreditsError, refundCredit, reserveCredit } from "@/lib/billing";
import { appendAudit } from "@/lib/audit";
import { assertAcknowledged } from "@/lib/auth";
import type { Account } from "@/db/schema";

export { ParseError };

export interface UploadSource {
  kind: SourceKind;
  /** Raw bytes for pdf/docx; the pasted string for text. */
  bytes?: Uint8Array;
  text?: string;
  filename?: string;
}

export interface CreateReviewInput {
  account: Account;
  actor: string;
  title?: string;
  counterparty?: string;
  source: UploadSource;
}

export interface CreateReviewResult {
  contractId: string;
  duplicateOf?: string;
  pageCount: number;
  sections: number;
  warnings: string[];
}

function sha256(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/** A title from the document's own first heading, so nothing says "Untitled". */
function titleFrom(parsed: ParseResult, fallback: string): string {
  const heading = parsed.blocks.find((b) => b.kind === "heading" && b.text.length > 6);
  const raw = heading?.text ?? parsed.blocks[0]?.text ?? fallback;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  // Contract titles are printed in caps. Title-casing them needs the small words left
  // alone, or a statement of work becomes a "Statement Of Work".
  const titled = /^[A-Z0-9 ,'&/()-]+$/.test(cleaned)
    ? cleaned
        .toLowerCase()
        .split(/([ -])/)
        .map((word, i) =>
          i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/^([a-z])/, (m) => m.toUpperCase()),
        )
        .join("")
        .replace(/\bNda\b/g, "NDA")
        .replace(/\bMsa\b/g, "MSA")
        .replace(/\bSow\b/g, "SOW")
    : cleaned;
  return titled.slice(0, 90) || fallback;
}

/** Guess the counterparty from the preamble. Always shown as editable. */
function counterpartyFrom(parsed: ParseResult): string | null {
  const preamble = parsed.fullText.slice(0, 1500);
  const m =
    /between\s+([A-Z][A-Za-z0-9 .,'&-]{2,60}?(?:,?\s(?:Inc\.|LLC|Ltd\.?|L\.L\.C\.|Corp\.|Corporation|Company|GmbH|PLC))?)\s*(?:,|\(|and\b)/.exec(
      preamble,
    );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

export async function createReview(input: CreateReviewInput): Promise<CreateReviewResult> {
  assertAcknowledged(input.account);
  const db = getDb();

  let parsed: ParseResult;
  let hash: string;
  if (input.source.kind === "text") {
    const text = (input.source.text ?? "").trim();
    if (text.length === 0) throw new ParseError("Paste the contract text first.");
    parsed = parseText(text);
    hash = sha256(text);
  } else if (input.source.kind === "pdf") {
    if (!input.source.bytes) throw new ParseError("That file came through empty. Try again.");
    parsed = await parsePdf(input.source.bytes);
    hash = sha256(input.source.bytes);
  } else {
    if (!input.source.bytes) throw new ParseError("That file came through empty. Try again.");
    parsed = await parseDocx(input.source.bytes);
    hash = sha256(input.source.bytes);
  }

  // Dedupe: the same document uploaded twice offers the finished review rather than
  // charging for it again.
  const [existing] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.accountId, input.account.id), eq(contracts.sha256, hash)))
    .orderBy(desc(contracts.createdAt))
    .limit(1);
  if (existing && existing.status !== "failed") {
    return {
      contractId: existing.id,
      duplicateOf: existing.id,
      pageCount: existing.pageCount,
      sections: parsed.sectionMap.length,
      warnings: parsed.warnings,
    };
  }

  const retentionExpiresAt = new Date(
    Date.now() + input.account.retentionDays * 24 * 60 * 60 * 1000,
  );

  const [contract] = await db
    .insert(contracts)
    .values({
      accountId: input.account.id,
      title: input.title?.trim() || titleFrom(parsed, input.source.filename ?? "Contract"),
      counterparty: input.counterparty?.trim() || counterpartyFrom(parsed),
      sourceKind: input.source.kind,
      sourceFilename: input.source.filename ?? null,
      sha256: hash,
      pageCount: parsed.pageCount,
      sizeBytes: input.source.bytes?.byteLength ?? (input.source.text?.length ?? 0),
      status: "uploaded",
      retentionExpiresAt,
    })
    .returning();

  await db.insert(contractTexts).values({
    contractId: contract.id,
    fullText: parsed.fullText,
    blocks: parsed.blocks,
    sectionMap: parsed.sectionMap,
    parseWarnings: parsed.warnings,
    coverage: [],
    charCount: parsed.fullText.length,
  });

  try {
    await reserveCredit(input.account.id, contract.id);
  } catch (err) {
    // No credit: the upload is undone rather than left as a half-review the reader
    // cannot start or delete.
    await db.delete(contracts).where(eq(contracts.id, contract.id));
    if (err instanceof NoCreditsError) throw err;
    throw err;
  }

  await db.update(contracts).set({ status: "extracting" }).where(eq(contracts.id, contract.id));

  await appendAudit({
    accountId: input.account.id,
    actor: input.actor,
    action: "review_started",
    target: contract.id,
    metadata: {
      title: contract.title,
      sourceKind: input.source.kind,
      pages: parsed.pageCount,
      sections: parsed.sectionMap.length,
      sha256: hash.slice(0, 12),
    },
  });

  return {
    contractId: contract.id,
    pageCount: parsed.pageCount,
    sections: parsed.sectionMap.length,
    warnings: parsed.warnings,
  };
}

/* ------------------------------------------------------------- read side */

export interface ContractListRow {
  contract: Contract;
  summary: { high: number; caution: number; ok: number } | null;
}

export async function listContracts(accountId: string, limit = 50): Promise<ContractListRow[]> {
  const db = getDb();
  const rows = await db
    .select({ contract: contracts, report: reports })
    .from(contracts)
    .leftJoin(reports, eq(reports.contractId, contracts.id))
    .where(eq(contracts.accountId, accountId))
    .orderBy(desc(contracts.createdAt))
    .limit(limit);
  return rows.map((r) => ({ contract: r.contract, summary: r.report?.summary ?? null }));
}

export interface FlagView {
  flag: Flag;
  redline: Redline | null;
}

export interface ClauseRowView {
  kind: "clause" | "missing";
  clauseType: ClauseType;
  label: string;
  sectionRef: string | null;
  page: number | null;
  citation: string | null;
  severity: Severity;
  summary: string;
  quote: string | null;
  fields: Record<string, unknown>;
  confidence: number;
  flags: FlagView[];
}

export interface ReportView {
  contract: Contract;
  report: Report | null;
  rows: ClauseRowView[];
  coverage: CoverageEntry[];
  coverageCounts: { sections: number; analyzed: number; boilerplate: number; notAnalyzed: number };
  /** Sections found by the parser — known from upload, before coverage exists. */
  sectionCount: number;
  warnings: string[];
  summary: { high: number; caution: number; ok: number };
  contractTypeLabel: string;
  flagCount: number;
}

export async function getContract(accountId: string, contractId: string): Promise<Contract | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.accountId, accountId)));
  return row ?? null;
}

/**
 * Assemble the report a screen renders: every clause and every flag for the contract,
 * ordered worst-first, each with its anchored quote and citation.
 *
 * The completeness invariant is asserted by `report.test.ts`: every clause row and
 * every flag row for the contract appears here. A report that quietly drops a flag is
 * the failure this product cannot have.
 */
export async function assembleReport(contract: Contract): Promise<ReportView> {
  const db = getDb();
  const [text] = await db
    .select()
    .from(contractTexts)
    .where(eq(contractTexts.contractId, contract.id));
  const clauseRows = await db
    .select()
    .from(clausesTable)
    .where(eq(clausesTable.contractId, contract.id));
  const flagRows = await db
    .select()
    .from(flagsTable)
    .where(eq(flagsTable.contractId, contract.id));
  const flagIds = flagRows.map((f) => f.id);
  const redlineRows = flagIds.length
    ? await db.select().from(redlinesTable).where(inArray(redlinesTable.flagId, flagIds))
    : [];
  const [report] = await db.select().from(reports).where(eq(reports.contractId, contract.id));

  const redlineByFlag = new Map(redlineRows.map((r) => [r.flagId, r]));
  const flagsByClause = new Map<string, Flag[]>();
  const missingFlags: Flag[] = [];
  for (const f of flagRows) {
    if (f.clauseId === null) {
      missingFlags.push(f);
      continue;
    }
    const list = flagsByClause.get(f.clauseId) ?? [];
    list.push(f);
    flagsByClause.set(f.clauseId, list);
  }

  const parsed: ParseResult | null = text
    ? {
        fullText: text.fullText,
        blocks: text.blocks,
        sectionMap: text.sectionMap,
        warnings: text.parseWarnings ?? [],
        pageCount: contract.pageCount,
      }
    : null;

  const rows: ClauseRowView[] = clauseRows.map((clause: Clause) => {
    const clauseFlags = flagsByClause.get(clause.id) ?? [];
    const span = clause.sourceSpans[0];
    return {
      kind: "clause" as const,
      clauseType: clause.clauseType,
      label: CLAUSE_LABELS[clause.clauseType],
      sectionRef: clause.sectionRef,
      page: span?.page ?? null,
      citation: parsed && span ? citationFor(parsed, span) : null,
      severity: worstSeverity(clauseFlags.map((f) => f.severity)),
      summary: clauseSummary(clause.clauseType, clause.extractedFields ?? {}),
      quote: span?.quote ?? null,
      fields: clause.extractedFields ?? {},
      confidence: clause.confidence,
      flags: clauseFlags.map((flag) => ({ flag, redline: redlineByFlag.get(flag.id) ?? null })),
    };
  });

  for (const flag of missingFlags) {
    rows.push({
      kind: "missing",
      clauseType: flag.clauseType,
      label: CLAUSE_LABELS[flag.clauseType],
      sectionRef: null,
      page: null,
      citation: null,
      severity: flag.severity,
      summary: "Not in this contract",
      quote: null,
      fields: {},
      confidence: 1,
      flags: [{ flag, redline: redlineByFlag.get(flag.id) ?? null }],
    });
  }

  // Worst first, then the taxonomy's own order — the same contract always reads in
  // the same order, which is half of what makes two runs comparable.
  rows.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      CLAUSE_ORDER.indexOf(a.clauseType) - CLAUSE_ORDER.indexOf(b.clauseType) ||
      a.label.localeCompare(b.label),
  );

  const coverage = text?.coverage ?? [];
  const coverageCounts = report?.coverage ?? {
    sections: coverage.length,
    analyzed: coverage.filter((c) => c.disposition === "clause").length,
    boilerplate: coverage.filter((c) => c.disposition === "boilerplate").length,
    notAnalyzed: coverage.filter((c) => c.disposition === "not_analyzed").length,
  };

  const summary =
    report?.summary ??
    (() => {
      let high = 0;
      let caution = 0;
      let ok = 0;
      for (const row of rows) {
        if (row.severity === "high") high++;
        else if (row.severity === "caution") caution++;
        else ok++;
      }
      return { high, caution, ok };
    })();

  return {
    contract,
    report: report ?? null,
    rows,
    coverage,
    coverageCounts,
    sectionCount: text?.sectionMap?.length ?? coverage.length,
    warnings: text?.parseWarnings ?? [],
    summary,
    contractTypeLabel: CONTRACT_TYPE_LABELS[contract.contractType],
    flagCount: flagRows.length,
  };
}

/** Every flag across the account, worst first — the Flags tab. */
export async function listFlags(accountId: string, limit = 100) {
  const db = getDb();
  const rows = await db
    .select({ flag: flagsTable, contract: contracts })
    .from(flagsTable)
    .innerJoin(contracts, eq(contracts.id, flagsTable.contractId))
    .where(eq(contracts.accountId, accountId))
    .orderBy(desc(flagsTable.createdAt))
    .limit(limit);
  return rows.sort((a, b) => severityRank(b.flag.severity) - severityRank(a.flag.severity));
}

/** Every redline across the account — the Redlines tab. */
export async function listRedlines(accountId: string, limit = 100) {
  const db = getDb();
  const rows = await db
    .select({ redline: redlinesTable, flag: flagsTable, contract: contracts })
    .from(redlinesTable)
    .innerJoin(flagsTable, eq(flagsTable.id, redlinesTable.flagId))
    .innerJoin(contracts, eq(contracts.id, flagsTable.contractId))
    .where(eq(contracts.accountId, accountId))
    .orderBy(desc(redlinesTable.createdAt))
    .limit(limit);
  return rows.sort((a, b) => severityRank(b.flag.severity) - severityRank(a.flag.severity));
}

/* ------------------------------------------------------------ write side */

export async function setContractType(
  accountId: string,
  contractId: string,
  contractType: ContractType,
  actor: string,
): Promise<void> {
  const db = getDb();
  const contract = await getContract(accountId, contractId);
  if (!contract) throw new Error("No such contract");
  const changed = contract.contractType !== contractType;
  await db
    .update(contracts)
    .set({
      contractType,
      typeConfirmed: true,
      // The contract-type checklist decides which clauses are *expected*, so a
      // correction has to re-run the scorer. Rewinding the status to "scoring" hands it
      // back to the pipeline instead of leaving a report that contradicts its own label.
      ...(changed && contract.status === "ready"
        ? { status: "scoring" as const, stageStartedAt: null, stageAttempts: 0 }
        : {}),
    })
    .where(eq(contracts.id, contractId));
  await appendAudit({
    accountId,
    actor,
    action: "contract_type_confirmed",
    target: contractId,
    metadata: { contractType, rescored: changed },
  });
}

export async function setRedlineAccepted(
  accountId: string,
  redlineId: string,
  accepted: boolean,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ redline: redlinesTable, contract: contracts })
    .from(redlinesTable)
    .innerJoin(flagsTable, eq(flagsTable.id, redlinesTable.flagId))
    .innerJoin(contracts, eq(contracts.id, flagsTable.contractId))
    .where(eq(redlinesTable.id, redlineId));
  if (!row || row.contract.accountId !== accountId) throw new Error("No such redline");
  await db.update(redlinesTable).set({ accepted }).where(eq(redlinesTable.id, redlineId));
}

/**
 * Delete a contract and everything derived from it.
 *
 * The audit entry restates the retention promise and outlives the row, which is the
 * only way a customer can later be shown that the deletion happened.
 */
export async function deleteContract(
  accountId: string,
  contractId: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  const contract = await getContract(accountId, contractId);
  if (!contract) throw new Error("No such contract");
  if (contract.status !== "ready") await refundCredit(contractId);
  await db.delete(contracts).where(eq(contracts.id, contractId));
  await appendAudit({
    accountId,
    actor,
    action: "contract_deleted",
    target: contractId,
    metadata: {
      title: contract.title,
      hadReport: contract.status === "ready",
      note: "Source text, clauses, flags and report deleted.",
    },
  });
}

/**
 * The retention sweep. Contracts past their window are deleted outright — the promise
 * on the settings screen is "we delete it", not "we hide it".
 */
export async function sweepRetention(): Promise<{ deleted: number }> {
  const db = getDb();
  const due = await db
    .select({ id: contracts.id, accountId: contracts.accountId, title: contracts.title })
    .from(contracts)
    .where(lt(contracts.retentionExpiresAt, new Date()))
    .limit(200);
  for (const row of due) {
    await db.delete(contracts).where(eq(contracts.id, row.id));
    await appendAudit({
      accountId: row.accountId,
      actor: "retention",
      action: "contract_deleted",
      target: row.id,
      metadata: { title: row.title, reason: "retention window elapsed" },
    });
  }
  return { deleted: due.length };
}

/**
 * Prune the free checker's rate-limit rows. They exist only to count requests in the last
 * hour, so anything older than a day is landfill — and it is an IP hash, which is not
 * something to keep for longer than it is useful.
 */
export async function pruneCheckerHits(): Promise<{ deleted: number }> {
  const db = getDb();
  const deleted = await db
    .delete(checkerHits)
    .where(lt(checkerHits.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
    .returning({ id: checkerHits.id });
  return { deleted: deleted.length };
}
