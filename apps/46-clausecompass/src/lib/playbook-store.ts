/**
 * src/lib/playbook-store.ts
 *
 * The database side of playbooks: seeding the built-in default, resolving which
 * playbook an account is scored against, and the Studio-tier edits.
 *
 * Kept apart from `playbook.ts` on purpose — the scorer is pure and unit-tested, and
 * nothing in it should ever be able to reach a database connection.
 *
 * Rules are rows, not code branches, so a Studio account changing a threshold needs no
 * deploy, and every report pins the playbook version it was scored with.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  playbookRules,
  playbooks,
  type Playbook,
  type PlaybookRule,
  type Severity,
} from "@/db/schema";
import {
  DEFAULT_PLAYBOOK_NAME,
  DEFAULT_PLAYBOOK_VERSION,
  DEFAULT_RULES,
  type RuleSpec,
} from "@/lib/playbook";
import { appendAudit } from "@/lib/audit";

export interface ResolvedPlaybook {
  playbook: Playbook;
  rules: PlaybookRule[];
  /** True when this is the shared built-in, which is read-only. */
  isDefault: boolean;
}

function ruleValues(playbookId: string, spec: RuleSpec) {
  return {
    playbookId,
    clauseType: spec.clauseType,
    ruleKey: spec.ruleKey,
    title: spec.title,
    comparator: spec.comparator,
    severityOnFail: spec.severityOnFail,
    firedTemplate: spec.firedTemplate,
    explanationTemplate: spec.explanationTemplate,
    forYouTemplate: spec.forYouTemplate,
    marketNote: spec.marketNote,
    redlineTemplate: spec.redlineTemplate,
    threshold: spec.threshold,
    enabled: true,
    sortOrder: spec.sortOrder,
  };
}

/**
 * The built-in default playbook, created on first use and then left alone.
 *
 * New rules shipped in `DEFAULT_RULES` are inserted into the existing default rather
 * than bumping its version: a version bump would mean every historical report claimed
 * provenance it never had.
 */
export async function ensureDefaultPlaybook(): Promise<Playbook> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(playbooks)
    .where(and(isNull(playbooks.accountId), eq(playbooks.version, DEFAULT_PLAYBOOK_VERSION)));

  const playbook =
    existing ??
    (
      await db
        .insert(playbooks)
        .values({
          accountId: null,
          name: DEFAULT_PLAYBOOK_NAME,
          version: DEFAULT_PLAYBOOK_VERSION,
          active: true,
        })
        .returning()
    )[0];

  const have = await db
    .select({ ruleKey: playbookRules.ruleKey })
    .from(playbookRules)
    .where(eq(playbookRules.playbookId, playbook.id));
  const haveKeys = new Set(have.map((r) => r.ruleKey));
  const missing = DEFAULT_RULES.filter((r) => !haveKeys.has(r.ruleKey));
  if (missing.length) {
    await db
      .insert(playbookRules)
      .values(missing.map((spec) => ruleValues(playbook.id, spec)))
      .onConflictDoNothing();
  }
  return playbook;
}

/** Which playbook scores this account's contracts? */
export async function resolvePlaybook(accountId: string): Promise<ResolvedPlaybook> {
  const db = getDb();
  const [own] = await db
    .select()
    .from(playbooks)
    .where(and(eq(playbooks.accountId, accountId), eq(playbooks.active, true)));
  const playbook = own ?? (await ensureDefaultPlaybook());
  const rules = await db
    .select()
    .from(playbookRules)
    .where(eq(playbookRules.playbookId, playbook.id))
    .orderBy(asc(playbookRules.sortOrder));
  return { playbook, rules, isDefault: playbook.accountId === null };
}

export async function loadPlaybookById(playbookId: string): Promise<ResolvedPlaybook | null> {
  const db = getDb();
  const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, playbookId));
  if (!playbook) return null;
  const rules = await db
    .select()
    .from(playbookRules)
    .where(eq(playbookRules.playbookId, playbook.id))
    .orderBy(asc(playbookRules.sortOrder));
  return { playbook, rules, isDefault: playbook.accountId === null };
}

/**
 * Copy the default into an editable playbook for this account (Studio tier).
 *
 * A fork rather than an override table: a report that says "scored against Your
 * playbook v1" has to be reproducible years later, and the only reliable way to do
 * that is to keep the rows it was scored against.
 */
export async function forkPlaybookForAccount(accountId: string, actor: string): Promise<ResolvedPlaybook> {
  const db = getDb();
  const existing = await db
    .select()
    .from(playbooks)
    .where(and(eq(playbooks.accountId, accountId), eq(playbooks.active, true)));
  if (existing.length > 0) {
    const resolved = await resolvePlaybook(accountId);
    return resolved;
  }
  const base = await ensureDefaultPlaybook();
  const baseRules = await db
    .select()
    .from(playbookRules)
    .where(eq(playbookRules.playbookId, base.id))
    .orderBy(asc(playbookRules.sortOrder));

  const [playbook] = await db
    .insert(playbooks)
    .values({ accountId, name: "House rules", version: 1, active: true })
    .returning();

  await db.insert(playbookRules).values(
    baseRules.map((r) => ({
      playbookId: playbook.id,
      clauseType: r.clauseType,
      ruleKey: r.ruleKey,
      title: r.title,
      comparator: r.comparator,
      severityOnFail: r.severityOnFail,
      firedTemplate: r.firedTemplate,
      explanationTemplate: r.explanationTemplate,
      forYouTemplate: r.forYouTemplate,
      marketNote: r.marketNote,
      redlineTemplate: r.redlineTemplate,
      threshold: r.threshold,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
    })),
  );

  await appendAudit({
    accountId,
    actor,
    action: "playbook_forked",
    target: playbook.id,
    metadata: { from: base.id, rules: baseRules.length },
  });

  return loadPlaybookById(playbook.id) as Promise<ResolvedPlaybook>;
}

export interface RuleEdit {
  threshold?: number | null;
  enabled?: boolean;
  severityOnFail?: Severity;
}

/** Edit one rule of an account's own playbook. The built-in default is read-only. */
export async function updateRule(
  accountId: string,
  ruleId: string,
  edit: RuleEdit,
  actor: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ rule: playbookRules, playbook: playbooks })
    .from(playbookRules)
    .innerJoin(playbooks, eq(playbooks.id, playbookRules.playbookId))
    .where(eq(playbookRules.id, ruleId));
  if (!row) throw new Error("No such rule");
  if (row.playbook.accountId !== accountId) {
    throw new Error("That rule belongs to a playbook this account cannot edit");
  }
  await db
    .update(playbookRules)
    .set({
      ...(edit.threshold !== undefined ? { threshold: edit.threshold } : {}),
      ...(edit.enabled !== undefined ? { enabled: edit.enabled } : {}),
      ...(edit.severityOnFail !== undefined ? { severityOnFail: edit.severityOnFail } : {}),
    })
    .where(eq(playbookRules.id, ruleId));

  await appendAudit({
    accountId,
    actor,
    action: "playbook_rule_edited",
    target: row.rule.ruleKey,
    metadata: { ...edit },
  });
}
