/**
 * Lien cases, over the database. The arithmetic is in lien-engine.ts; the rule
 * content is in lien-rules.ts. This module does four things:
 *
 *  - **Freezes the rule version at open.** A case stores `rule_version_id`, so a
 *    statute amended next March does not move the deadlines on a sale already
 *    running. That is what a court expects and it costs one foreign key.
 *  - **Refuses to guess.** A facility in a state with no reviewed pack cannot open
 *    a case at all; the UI shows the manual checklist and says why, by name.
 *  - **Enforces the hard stop on the server.** `canComplete` gates the write, not
 *    only the button. A disabled button is a courtesy; the check is the rule.
 *  - **Auto-executes nothing.** The nightly pass marks what is due and stops.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  lienCases,
  lienRules,
  tenancies,
  type LienCase,
  type LienRule,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { buildTimeline, canComplete, caseStatus, type StepsState, type Timeline } from "@/lib/lien-engine";
import { packFor, type RulePack, type RuleStep } from "@/lib/lien-rules";
import { isoDateOf, type IsoDate } from "@/lib/money";

export class ManualModeError extends Error {}

/**
 * Make sure the state's current pack exists as a row, then return it. Rule content
 * ships in code and is mirrored into the database so a case can point at an
 * immutable version — the code can change, the row a case froze cannot.
 */
export async function currentRuleRow(state: string): Promise<{ row: LienRule; pack: RulePack }> {
  const pack = packFor(state);
  if (!pack) throw new ManualModeError(state.toUpperCase());
  const db = getDb();
  const [existing] = await db
    .select()
    .from(lienRules)
    .where(and(eq(lienRules.state, pack.state), eq(lienRules.version, pack.version)));
  if (existing) return { row: existing, pack };
  const [inserted] = await db
    .insert(lienRules)
    .values({
      state: pack.state,
      version: pack.version,
      steps: pack.steps,
      reviewedOn: pack.reviewedOn,
      notes: pack.notes,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { row: inserted, pack };
  const [raced] = await db
    .select()
    .from(lienRules)
    .where(and(eq(lienRules.state, pack.state), eq(lienRules.version, pack.version)));
  return { row: raced, pack };
}

/** The pack a case froze, read back off its own row. */
export function packOfRow(row: LienRule): { steps: RuleStep[]; state: string; version: number; reviewedOn: string; notes: string } {
  return {
    steps: (row.steps ?? []) as RuleStep[],
    state: row.state,
    version: row.version,
    reviewedOn: row.reviewedOn,
    notes: row.notes ?? "",
  };
}

export async function openLienCase(
  ownerId: string,
  actor: string,
  tenancyId: string,
  state: string,
  delinquentSince: IsoDate,
): Promise<{ lienCaseId: string }> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(lienCases)
    .where(
      and(
        eq(lienCases.tenancyId, tenancyId),
        inArray(lienCases.status, ["open", "paused", "sale_eligible"]),
      ),
    );
  if (existing) return { lienCaseId: existing.id };

  const { row, pack } = await currentRuleRow(state);
  const timeline = buildTimeline(pack, delinquentSince, {}, isoDateOf(new Date()));
  const stepsState: StepsState = {};
  for (const step of timeline.steps) stepsState[step.key] = { dueOn: step.dueOn };

  const [created] = await db
    .insert(lienCases)
    .values({
      tenancyId,
      ruleVersionId: row.id,
      delinquentSince,
      status: "open",
      currentStepKey: timeline.currentStepKey,
      stepsState,
      hardStopUntil: timeline.hardStopUntil,
    })
    .returning();

  await db
    .update(tenancies)
    .set({ status: "lien", updatedAt: new Date() })
    .where(eq(tenancies.id, tenancyId));

  await audit(ownerId, actor, "lien.opened", created.id, {
    tenancyId,
    state: pack.state,
    ruleVersion: pack.version,
    delinquentSince,
  });
  return { lienCaseId: created.id };
}

export interface CaseWithTimeline {
  lienCase: LienCase;
  rule: LienRule;
  timeline: Timeline;
}

export async function caseById(lienCaseId: string): Promise<CaseWithTimeline | null> {
  const [row] = await getDb()
    .select({ lienCase: lienCases, rule: lienRules })
    .from(lienCases)
    .innerJoin(lienRules, eq(lienCases.ruleVersionId, lienRules.id))
    .where(eq(lienCases.id, lienCaseId));
  if (!row) return null;
  return {
    ...row,
    timeline: buildTimeline(
      { steps: (row.rule.steps ?? []) as RuleStep[] },
      row.lienCase.delinquentSince,
      (row.lienCase.stepsState ?? {}) as StepsState,
      isoDateOf(new Date()),
    ),
  };
}

export async function openCaseForTenancy(tenancyId: string): Promise<CaseWithTimeline | null> {
  const [row] = await getDb()
    .select({ id: lienCases.id })
    .from(lienCases)
    .where(
      and(
        eq(lienCases.tenancyId, tenancyId),
        inArray(lienCases.status, ["open", "paused", "sale_eligible"]),
      ),
    )
    .orderBy(desc(lienCases.createdAt));
  return row ? caseById(row.id) : null;
}

export class HardStopError extends Error {}

/**
 * Record a statutory step as done. Date-gated by `canComplete`, which is the same
 * function the UI uses to disable the button — one implementation, so a disabled
 * button and a rejected request can never disagree.
 */
export async function completeStep(
  ownerId: string,
  actor: string,
  lienCaseId: string,
  stepKey: string,
  input: { trackingNumber?: string; noticeR2Key?: string; completedOn?: IsoDate },
): Promise<void> {
  const found = await caseById(lienCaseId);
  if (!found) throw new HardStopError("That lien case no longer exists");
  const asOf = input.completedOn ?? isoDateOf(new Date());
  const check = canComplete(found.timeline, stepKey, asOf);
  if (!check.ok) throw new HardStopError(check.reason ?? "That step is not available yet");

  const stepsState = { ...((found.lienCase.stepsState ?? {}) as StepsState) };
  const prior = stepsState[stepKey] ?? {};
  stepsState[stepKey] = {
    ...prior,
    completedOn: asOf,
    ...(input.trackingNumber ? { trackingNumber: input.trackingNumber } : {}),
    ...(input.noticeR2Key ? { noticeR2Key: input.noticeR2Key } : {}),
  };

  const next = buildTimeline(
    { steps: (found.rule.steps ?? []) as RuleStep[] },
    found.lienCase.delinquentSince,
    stepsState,
    asOf,
  );

  await getDb()
    .update(lienCases)
    .set({
      stepsState,
      currentStepKey: next.currentStepKey,
      hardStopUntil: next.hardStopUntil,
      status: caseStatus(next, asOf) === "resolved" ? "closed" : caseStatus(next, asOf),
      resolvedReason: next.complete ? "sold" : null,
      updatedAt: new Date(),
    })
    .where(eq(lienCases.id, lienCaseId));

  await audit(ownerId, actor, "lien.step_completed", lienCaseId, {
    stepKey,
    completedOn: asOf,
    trackingNumber: input.trackingNumber ?? null,
  });
}

/** Attach the generated notice's key to a step without completing it. */
export async function attachNotice(
  lienCaseId: string,
  stepKey: string,
  r2Key: string,
): Promise<void> {
  const found = await caseById(lienCaseId);
  if (!found) return;
  const stepsState = { ...((found.lienCase.stepsState ?? {}) as StepsState) };
  stepsState[stepKey] = { ...(stepsState[stepKey] ?? {}), noticeR2Key: r2Key };
  await getDb()
    .update(lienCases)
    .set({ stepsState, updatedAt: new Date() })
    .where(eq(lienCases.id, lienCaseId));
}

export async function resolveCase(
  ownerId: string,
  actor: string,
  lienCaseId: string,
  reason: "paid" | "vacated" | "sold" | "error",
): Promise<void> {
  await getDb()
    .update(lienCases)
    .set({
      status: reason === "paid" ? "resolved" : "closed",
      resolvedReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(lienCases.id, lienCaseId));
  await audit(ownerId, actor, `lien.resolved.${reason}`, lienCaseId);
}

/** Every live case for an owner, for the delinquency board and the reports. */
export async function liveCasesFor(tenancyIds: readonly string[]): Promise<Map<string, LienCase>> {
  const out = new Map<string, LienCase>();
  if (tenancyIds.length === 0) return out;
  const rows = await getDb()
    .select()
    .from(lienCases)
    .where(
      and(
        inArray(lienCases.tenancyId, [...tenancyIds]),
        inArray(lienCases.status, ["open", "paused", "sale_eligible"]),
      ),
    );
  for (const row of rows) out.set(row.tenancyId, row);
  return out;
}
