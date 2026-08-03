/**
 * src/lib/pipeline.ts
 *
 * The review pipeline as a resumable stage machine: extract → score → explain → ready.
 *
 * ARCHITECTURE.md specifies BullMQ on a long-lived worker. The deployment target is
 * Vercel, which has no always-on process and a once-a-day Hobby cron, so the pipeline
 * is built as one *stage per invocation* instead: the report screen advances the
 * contract while the reader watches, and `/api/cron/tick` sweeps anything left behind
 * by a closed tab. Same stages, same progress states, no queue to lose.
 *
 * Two details keep it honest under concurrency:
 *
 *  - **Claiming is a conditional UPDATE**, matched on the current status plus a lease
 *    that the *database* compares against its own `now()`. Comparing a JS Date against
 *    a timestamptz set by SQL `now()` truncates milliseconds and produces a row that
 *    looks due forever and is never claimed.
 *  - **Every stage is idempotent.** A stage that dies half-way is re-run from the top,
 *    so clauses and flags are cleared before they are written, and flags carry a unique
 *    index so a re-run cannot double-flag.
 *
 * On any hard failure the credit is refunded, the reason is stored, and the reader is
 * told what happened.
 */

import { and, asc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clauses as clausesTable,
  contractTexts,
  contracts,
  flags as flagsTable,
  redlines as redlinesTable,
  reports,
  type Contract,
  type ContractStatus,
} from "@/db/schema";
import type { ParseResult } from "@/lib/parse";
import { extractClauses } from "@/lib/extract";
import { score, worstSeverity, type ScorableRule } from "@/lib/playbook";
import { explainFlag, LAWYER_POINTER } from "@/lib/explain";
import { resolvePlaybook } from "@/lib/playbook-store";
import { refundCredit } from "@/lib/billing";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { appendAudit } from "@/lib/audit";
import { sendReportReady, sendReviewFailed } from "@/lib/mailer";

/** How long a stage may hold its claim before the sweep may retry it. */
const LEASE_SECONDS = 120;
const MAX_ATTEMPTS_PER_STAGE = 3;

export interface StageProgress {
  status: ContractStatus;
  /** Short label for the processing screen. */
  step: string;
  detail: string;
  done: boolean;
  failed: boolean;
}

const NEXT_STATUS: Record<string, ContractStatus> = {
  uploaded: "extracting",
  parsing: "extracting",
  extracting: "scoring",
  scoring: "explaining",
  explaining: "ready",
};

export function stepLabel(status: ContractStatus): { step: string; detail: string } {
  switch (status) {
    case "uploaded":
    case "parsing":
      return { step: "Reading the document", detail: "Splitting the text into sections." };
    case "extracting":
      return { step: "Mapping the clauses", detail: "Finding each clause and quoting it." };
    case "scoring":
      return { step: "Scoring against your playbook", detail: "Running every rule, in order." };
    case "explaining":
      return { step: "Writing the plain-English read", detail: "One explanation and redline per flag." };
    case "ready":
      return { step: "Report ready", detail: "Every flag is anchored to a quote." };
    case "failed":
      return { step: "Review failed", detail: "Your credit has been returned." };
  }
}

function parseResultFrom(row: { fullText: string; blocks: unknown; sectionMap: unknown }): ParseResult {
  return {
    fullText: row.fullText,
    blocks: row.blocks as ParseResult["blocks"],
    sectionMap: row.sectionMap as ParseResult["sectionMap"],
    warnings: [],
    pageCount: 1,
  };
}

/**
 * Advance one contract by one stage. Returns where it now stands.
 *
 * Safe to call concurrently: a contract already inside a stage returns its current
 * progress rather than running the stage twice.
 */
export async function advanceContract(contractId: string): Promise<StageProgress> {
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) throw new Error("No such contract");
  if (contract.status === "ready" || contract.status === "failed") return progressOf(contract);

  const next = NEXT_STATUS[contract.status];
  if (!next) return progressOf(contract);

  // Claim the stage: same status as we read, and either no live lease or an expired
  // one. Both sides of the lease comparison are the database's own clock.
  const [claimed] = await db
    .update(contracts)
    .set({ stageStartedAt: sql`now()`, stageAttempts: sql`${contracts.stageAttempts} + 1` })
    .where(
      and(
        eq(contracts.id, contractId),
        eq(contracts.status, contract.status),
        or(
          isNull(contracts.stageStartedAt),
          lt(contracts.stageStartedAt, sql`now() - make_interval(secs => ${LEASE_SECONDS})`),
        ),
      ),
    )
    .returning();

  if (!claimed) {
    // Someone else is inside this stage. Report progress, do not duplicate work.
    const [fresh] = await db.select().from(contracts).where(eq(contracts.id, contractId));
    return progressOf(fresh ?? contract);
  }

  if (claimed.stageAttempts > MAX_ATTEMPTS_PER_STAGE) {
    return failContract(claimed, `The ${claimed.status} stage failed ${MAX_ATTEMPTS_PER_STAGE} times.`);
  }

  try {
    switch (claimed.status) {
      case "uploaded":
      case "parsing":
      case "extracting":
        await runExtract(claimed);
        break;
      case "scoring":
        await runScore(claimed);
        break;
      case "explaining":
        await runExplain(claimed);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[pipeline] ${claimed.id} failed in ${claimed.status}`, err);
    return failContract(claimed, humanError(err));
  }

  await db
    .update(contracts)
    .set({
      status: next,
      stageStartedAt: null,
      stageAttempts: 0,
      ...(next === "ready" ? { readyAt: new Date() } : {}),
    })
    .where(eq(contracts.id, contractId));

  const [updated] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (updated.status === "ready") {
    await onReady(updated);
  }
  return progressOf(updated);
}

function humanError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 400);
}

export function progressOf(contract: Contract): StageProgress {
  const { step, detail } = stepLabel(contract.status);
  return {
    status: contract.status,
    step,
    detail: contract.status === "failed" ? (contract.failureReason ?? detail) : detail,
    done: contract.status === "ready",
    failed: contract.status === "failed",
  };
}

async function failContract(contract: Contract, reason: string): Promise<StageProgress> {
  const db = getDb();
  await db
    .update(contracts)
    .set({ status: "failed", failureReason: reason, stageStartedAt: null })
    .where(eq(contracts.id, contract.id));
  const refunded = await refundCredit(contract.id);
  await appendAudit({
    accountId: contract.accountId,
    actor: "pipeline",
    action: "review_failed",
    target: contract.id,
    metadata: { reason, creditRefunded: refunded },
  });
  await sendReviewFailed(contract, reason, refunded);
  const [updated] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
  return progressOf(updated ?? { ...contract, status: "failed", failureReason: reason });
}

/* ---------------------------------------------------------------- stages */

async function runExtract(contract: Contract): Promise<void> {
  const db = getDb();
  const [text] = await db
    .select()
    .from(contractTexts)
    .where(eq(contractTexts.contractId, contract.id));
  if (!text) throw new Error("The parsed text for this contract is missing.");

  const parsed = parseResultFrom(text);
  const result = await extractClauses(parsed);

  // Idempotent: a retried stage starts from a clean slate.
  await db.delete(clausesTable).where(eq(clausesTable.contractId, contract.id));
  if (result.clauses.length > 0) {
    await db.insert(clausesTable).values(
      result.clauses.map((c) => ({
        contractId: contract.id,
        clauseType: c.clauseType,
        heading: c.heading,
        sectionRef: c.sectionRef,
        sourceSpans: c.sourceSpans,
        extractedFields: c.fields,
        confidence: c.confidence,
        rawModelOutput: (c.raw ?? null) as Record<string, unknown> | null,
        modelVersion: result.modelVersion,
      })),
    );
  }

  const warnings = [...(text.parseWarnings ?? [])];
  if (result.droppedQuotes.length > 0) {
    warnings.push(
      `${result.droppedQuotes.length} quoted passage${
        result.droppedQuotes.length === 1 ? "" : "s"
      } could not be matched to this document and ${
        result.droppedQuotes.length === 1 ? "was" : "were"
      } discarded.`,
    );
  }
  for (const type of result.droppedClauses) {
    warnings.push(`A ${CLAUSE_LABELS[type]} clause was reported but could not be anchored, so it is not in this report.`);
  }

  await db
    .update(contractTexts)
    .set({ coverage: result.coverage, parseWarnings: warnings })
    .where(eq(contractTexts.contractId, contract.id));

  await db
    .update(contracts)
    .set({
      modelVersion: result.modelVersion,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costMicros: result.costMicros,
      ...(contract.typeConfirmed ? {} : { contractType: result.contractType }),
    })
    .where(eq(contracts.id, contract.id));
}

async function runScore(contract: Contract): Promise<void> {
  const db = getDb();
  const { playbook, rules } = await resolvePlaybook(contract.accountId);
  const clauseRows = await db
    .select()
    .from(clausesTable)
    .where(eq(clausesTable.contractId, contract.id));

  const fired = score({
    contractType: contract.contractType,
    clauses: clauseRows.map((c) => ({
      id: c.id,
      clauseType: c.clauseType,
      fields: c.extractedFields ?? {},
    })),
    rules: rules as unknown as ScorableRule[],
  });

  await db.delete(flagsTable).where(eq(flagsTable.contractId, contract.id));
  if (fired.length > 0) {
    await db
      .insert(flagsTable)
      .values(
        fired.map((f) => ({
          contractId: contract.id,
          clauseId: f.clauseId,
          ruleId: f.ruleId,
          ruleKey: f.ruleKey,
          clauseType: f.clauseType,
          severity: f.severity,
          title: f.title,
          firedBecause: f.firedBecause,
          lawyerPointer: f.severity === "high",
        })),
      )
      .onConflictDoNothing();
  }

  await db
    .update(contracts)
    .set({
      playbookId: playbook.id,
      playbookVersion: playbook.version,
      playbookName: playbook.name,
    })
    .where(eq(contracts.id, contract.id));
}

async function runExplain(contract: Contract): Promise<void> {
  const db = getDb();
  const { rules } = await resolvePlaybook(contract.accountId);
  const rulesByKey = new Map(rules.map((r) => [r.ruleKey, r]));
  const flagRows = await db.select().from(flagsTable).where(eq(flagsTable.contractId, contract.id));
  const clauseRows = await db
    .select()
    .from(clausesTable)
    .where(eq(clausesTable.contractId, contract.id));
  const clauseById = new Map(clauseRows.map((c) => [c.id, c]));

  let inputTokens = contract.inputTokens;
  let outputTokens = contract.outputTokens;
  let costMicrosTotal = contract.costMicros;

  for (const flag of flagRows) {
    const rule = rulesByKey.get(flag.ruleKey);
    if (!rule) continue;
    const clause = flag.clauseId ? clauseById.get(flag.clauseId) : null;
    const quote = clause?.sourceSpans?.[0]?.quote ?? null;
    const fields = (clause?.extractedFields ?? {}) as Record<string, unknown>;

    const explanation = await explainFlag({
      clauseLabel: CLAUSE_LABELS[flag.clauseType],
      quote,
      firedBecause: flag.firedBecause,
      severity: flag.severity,
      rule,
      vars: {
        value: fields[rule.comparator.field ?? ""] ?? "—",
        threshold: rule.threshold ?? rule.comparator.threshold ?? "—",
        months: fields.months ?? "—",
      },
    });

    inputTokens += explanation.usage.inputTokens;
    outputTokens += explanation.usage.outputTokens;
    costMicrosTotal += explanation.costMicros;

    await db
      .update(flagsTable)
      .set({
        explanation: explanation.whatItSays,
        forYou: explanation.forYou,
        market: explanation.market,
        explanationSource: explanation.source,
      })
      .where(eq(flagsTable.id, flag.id));

    await db
      .insert(redlinesTable)
      .values({
        flagId: flag.id,
        originalPhrase: explanation.redline.originalPhrase,
        suggestedText: explanation.redline.suggestedText,
        rationale: explanation.redline.rationale,
        emailSnippet: explanation.redline.emailSnippet,
      })
      .onConflictDoUpdate({
        target: redlinesTable.flagId,
        set: {
          originalPhrase: explanation.redline.originalPhrase,
          suggestedText: explanation.redline.suggestedText,
          rationale: explanation.redline.rationale,
          emailSnippet: explanation.redline.emailSnippet,
        },
      });
  }

  await db
    .update(contracts)
    .set({ inputTokens, outputTokens, costMicros: costMicrosTotal })
    .where(eq(contracts.id, contract.id));

  await writeReportRow(contract.id);
}

/** The report row: the provenance record for what the reader is about to see. */
async function writeReportRow(contractId: string): Promise<void> {
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  const [text] = await db.select().from(contractTexts).where(eq(contractTexts.contractId, contractId));
  const clauseRows = await db.select().from(clausesTable).where(eq(clausesTable.contractId, contractId));
  const flagRows = await db.select().from(flagsTable).where(eq(flagsTable.contractId, contractId));

  const bySeverity = new Map<string, string[]>();
  for (const f of flagRows) {
    const list = bySeverity.get(f.clauseId ?? `missing:${f.ruleKey}`) ?? [];
    list.push(f.severity);
    bySeverity.set(f.clauseId ?? `missing:${f.ruleKey}`, list);
  }

  let high = 0;
  let caution = 0;
  let ok = 0;
  for (const clause of clauseRows) {
    const severities = (bySeverity.get(clause.id) ?? []) as Array<"ok" | "caution" | "high">;
    const worst = worstSeverity(severities);
    if (worst === "high") high++;
    else if (worst === "caution") caution++;
    else ok++;
  }
  // Missing-clause flags are their own rows in the map, so they count too.
  for (const f of flagRows.filter((f) => f.clauseId === null)) {
    if (f.severity === "high") high++;
    else caution++;
  }

  const coverage = text?.coverage ?? [];
  const counts = {
    sections: coverage.length,
    analyzed: coverage.filter((c) => c.disposition === "clause").length,
    boilerplate: coverage.filter((c) => c.disposition === "boilerplate").length,
    notAnalyzed: coverage.filter((c) => c.disposition === "not_analyzed").length,
  };

  await db
    .insert(reports)
    .values({
      contractId,
      playbookVersion: contract.playbookVersion ?? 1,
      playbookName: contract.playbookName ?? "Freelancer & SMB default",
      modelVersion: contract.modelVersion ?? "unknown",
      coverage: counts,
      summary: { high, caution, ok },
    })
    .onConflictDoUpdate({
      target: reports.contractId,
      set: {
        generatedAt: new Date(),
        playbookVersion: contract.playbookVersion ?? 1,
        playbookName: contract.playbookName ?? "Freelancer & SMB default",
        modelVersion: contract.modelVersion ?? "unknown",
        coverage: counts,
        summary: { high, caution, ok },
      },
    });
}

async function onReady(contract: Contract): Promise<void> {
  const db = getDb();
  const [report] = await db.select().from(reports).where(eq(reports.contractId, contract.id));
  await appendAudit({
    accountId: contract.accountId,
    actor: "pipeline",
    action: "review_ready",
    target: contract.id,
    metadata: {
      summary: report?.summary ?? {},
      modelVersion: contract.modelVersion,
      costMicros: contract.costMicros,
    },
  });
  await sendReportReady(contract, report?.summary ?? { high: 0, caution: 0, ok: 0 });
}

/** Run a contract to completion. Used by the cron sweep and by tests. */
export async function runToCompletion(contractId: string, maxStages = 8): Promise<StageProgress> {
  let progress = await advanceContract(contractId);
  let guard = 0;
  while (!progress.done && !progress.failed && guard < maxStages) {
    progress = await advanceContract(contractId);
    guard++;
  }
  return progress;
}

/**
 * The sweep: advance contracts that nobody is watching.
 *
 * Bounded by a time budget because it runs inside a serverless invocation. Contracts
 * are taken oldest-first so one busy account cannot starve another's review.
 */
export async function sweepStalledReviews(budgetMs = 20_000): Promise<{
  advanced: number;
  finished: number;
}> {
  const db = getDb();
  const started = Date.now();
  let advanced = 0;
  let finished = 0;

  const stalled = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        ne(contracts.status, "ready"),
        ne(contracts.status, "failed"),
        or(
          isNull(contracts.stageStartedAt),
          lt(contracts.stageStartedAt, sql`now() - make_interval(secs => ${LEASE_SECONDS})`),
        ),
      ),
    )
    .orderBy(asc(contracts.createdAt))
    .limit(25);

  for (const row of stalled) {
    if (Date.now() - started > budgetMs) break;
    const progress = await advanceContract(row.id);
    advanced++;
    if (progress.done || progress.failed) finished++;
  }
  return { advanced, finished };
}
