/**
 * src/lib/library.ts
 *
 * The answer library: reusable boilerplate, past answers, team bios, and
 * past-performance blurbs — with **link-and-snapshot** semantics.
 *
 * The invariant the whole feature exists to protect: linking a block into a
 * pursuit copies its body into `block_uses` and freezes it there. Editing the
 * library afterwards changes the library and nothing else. A submitted proposal
 * is history, and history does not get rewritten because someone tidied a bio
 * six weeks later.
 *
 * Staleness has two forms on purpose. `answer_blocks.stale` is a stored flag the
 * weekly job maintains, so "stale first" can be an index-backed sort. Display
 * derives it as-of-now with `isStale()`, because a stored flag reconciled weekly
 * is exactly how a bio last reviewed in 2024 ends up rendering as fresh.
 */

import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  answerBlocks,
  auditLog,
  blockUses,
  pursuits,
  requirements,
  type AnswerBlock,
  type BlockUse,
} from "@/db/schema";
import { blockKindLabel, formatDayYear } from "@/lib/format";

/** A block unreviewed for longer than this wants a look before it's reused. */
export const STALE_AFTER_DAYS = 365;

export function staleThreshold(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000);
}

/** As-of-now staleness. Never read the stored column for display. */
export function isStale(lastReviewedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastReviewedAt) return true;
  return lastReviewedAt.getTime() < staleThreshold(now).getTime();
}

/** The sentence shown on a stale block and at link time. */
export function staleWarning(
  block: Pick<AnswerBlock, "kind" | "title" | "lastReviewedAt">,
  timezone: string,
  now: Date = new Date(),
): string | null {
  if (!isStale(block.lastReviewedAt, now)) return null;
  if (!block.lastReviewedAt) {
    return `${blockKindLabel(block.kind)} "${block.title}" has never been reviewed — review before use?`;
  }
  return `${blockKindLabel(block.kind)} "${block.title}" was last reviewed ${formatDayYear(block.lastReviewedAt, timezone)} — review before use?`;
}

/* ----------------------------------------------------------------- writing */

export interface BlockInput {
  kind: AnswerBlock["kind"];
  title: string;
  body: string;
  tags: string[];
}

export async function createBlock(input: {
  firmId: string;
  actorUserId: string;
  block: BlockInput;
}): Promise<AnswerBlock> {
  const db = getDb();
  const [row] = await db
    .insert(answerBlocks)
    .values({
      firmId: input.firmId,
      kind: input.block.kind,
      title: input.block.title.trim().slice(0, 300),
      body: input.block.body,
      tags: normalizeTags(input.block.tags),
      version: 1,
      lastReviewedAt: new Date(),
      stale: false,
    })
    .returning();
  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "library.block_created",
    target: row.id,
    metadata: { kind: row.kind, title: row.title },
  });
  return row;
}

/**
 * Edit a block. The version bumps on every content change, which is what makes
 * a snapshot legible later ("linked at v4, library is now v6").
 */
export async function updateBlock(input: {
  firmId: string;
  actorUserId: string;
  blockId: string;
  block: BlockInput;
}): Promise<AnswerBlock> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(answerBlocks)
    .where(and(eq(answerBlocks.id, input.blockId), eq(answerBlocks.firmId, input.firmId)));
  if (!existing) throw new Error("That library block does not belong to this firm.");

  const changed =
    existing.body !== input.block.body ||
    existing.title.trim() !== input.block.title.trim() ||
    existing.kind !== input.block.kind;

  const [row] = await db
    .update(answerBlocks)
    .set({
      kind: input.block.kind,
      title: input.block.title.trim().slice(0, 300),
      body: input.block.body,
      tags: normalizeTags(input.block.tags),
      version: changed ? existing.version + 1 : existing.version,
      lastReviewedAt: new Date(),
      stale: false,
      updatedAt: new Date(),
    })
    .where(eq(answerBlocks.id, existing.id))
    .returning();

  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: changed ? "library.block_edited" : "library.block_reviewed",
    target: row.id,
    metadata: { version: row.version, title: row.title },
  });
  return row;
}

/** "Still accurate" — resets the staleness clock without a version bump. */
export async function reviewBlock(input: {
  firmId: string;
  actorUserId: string;
  blockId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(answerBlocks)
    .set({ lastReviewedAt: new Date(), stale: false, updatedAt: new Date() })
    .where(and(eq(answerBlocks.id, input.blockId), eq(answerBlocks.firmId, input.firmId)));
  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "library.block_reviewed",
    target: input.blockId,
    metadata: {},
  });
}

export async function archiveBlock(input: {
  firmId: string;
  actorUserId: string;
  blockId: string;
  archived: boolean;
}): Promise<void> {
  const db = getDb();
  await db
    .update(answerBlocks)
    .set({ archived: input.archived, updatedAt: new Date() })
    .where(and(eq(answerBlocks.id, input.blockId), eq(answerBlocks.firmId, input.firmId)));
  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: input.archived ? "library.block_archived" : "library.block_restored",
    target: input.blockId,
    metadata: {},
  });
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.slice(0, 12);
}

/* --------------------------------------------------------- link and snapshot */

export interface LinkResult {
  blockUseId: string;
  snapshotVersion: number;
  staleWarning: string | null;
}

/**
 * Freeze a block into a pursuit. The body is copied, not referenced.
 */
export async function linkBlock(input: {
  firmId: string;
  timezone: string;
  pursuitId: string;
  answerBlockId: string;
  requirementLabel: string;
  linkedByUserId: string;
}): Promise<LinkResult> {
  const db = getDb();
  const [pursuit] = await db
    .select()
    .from(pursuits)
    .where(and(eq(pursuits.id, input.pursuitId), eq(pursuits.firmId, input.firmId)));
  if (!pursuit) throw new Error("That pursuit does not belong to this firm.");
  if (pursuit.stage === "submitted" || pursuit.closedAt) {
    throw new Error(
      "This pursuit has been submitted. Its content is history now — nothing more can be linked into it.",
    );
  }

  const [block] = await db
    .select()
    .from(answerBlocks)
    .where(and(eq(answerBlocks.id, input.answerBlockId), eq(answerBlocks.firmId, input.firmId)));
  if (!block) throw new Error("That library block does not belong to this firm.");

  const [use] = await db
    .insert(blockUses)
    .values({
      pursuitId: pursuit.id,
      answerBlockId: block.id,
      snapshotBody: block.body,
      snapshotVersion: block.version,
      requirementLabel: input.requirementLabel.trim().slice(0, 300) || block.title,
      linkedByUserId: input.linkedByUserId,
    })
    .returning();

  await db.insert(auditLog).values({
    firmId: input.firmId,
    actor: input.linkedByUserId,
    action: "library.block_linked",
    target: use.id,
    metadata: { pursuitId: pursuit.id, blockId: block.id, version: block.version },
  });

  return {
    blockUseId: use.id,
    snapshotVersion: block.version,
    staleWarning: staleWarning(block, input.timezone),
  };
}

export async function unlinkBlockUse(input: {
  firmId: string;
  actorUserId: string;
  blockUseId: string;
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ use: blockUses, pursuit: pursuits })
    .from(blockUses)
    .innerJoin(pursuits, eq(blockUses.pursuitId, pursuits.id))
    .where(and(eq(blockUses.id, input.blockUseId), eq(pursuits.firmId, input.firmId)));
  if (!row) throw new Error("That linked block does not belong to this firm.");
  if (row.pursuit.stage === "submitted" || row.pursuit.closedAt) {
    throw new Error("Submitted pursuits are immutable; their linked content cannot be removed.");
  }
  await getDb().delete(blockUses).where(eq(blockUses.id, input.blockUseId));
  await getDb().insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actorUserId,
    action: "library.block_unlinked",
    target: input.blockUseId,
    metadata: { pursuitId: row.pursuit.id },
  });
}

export interface BlockUseRow {
  use: BlockUse;
  block: AnswerBlock | null;
  /** True when the library has moved on since the snapshot was taken. */
  drifted: boolean;
}

export async function listBlockUses(pursuitId: string): Promise<BlockUseRow[]> {
  const db = getDb();
  const rows = await db
    .select({ use: blockUses, block: answerBlocks })
    .from(blockUses)
    .leftJoin(answerBlocks, eq(blockUses.answerBlockId, answerBlocks.id))
    .where(eq(blockUses.pursuitId, pursuitId))
    .orderBy(asc(blockUses.createdAt));
  return rows.map((row) => ({
    use: row.use,
    block: row.block,
    drifted: Boolean(row.block && row.block.version !== row.use.snapshotVersion),
  }));
}

/**
 * A won pursuit flags every block it used. The library learns which answers win
 * — and `won_with` is the only signal in here the firm did not type by hand.
 */
export async function markWonWith(pursuitId: string): Promise<{ flagged: number }> {
  const db = getDb();
  const uses = await db
    .select({ answerBlockId: blockUses.answerBlockId })
    .from(blockUses)
    .where(eq(blockUses.pursuitId, pursuitId));
  let flagged = 0;
  for (const use of uses) {
    const updated = await db
      .update(answerBlocks)
      .set({ wonWith: true, updatedAt: new Date() })
      .where(and(eq(answerBlocks.id, use.answerBlockId), eq(answerBlocks.wonWith, false)))
      .returning({ id: answerBlocks.id });
    flagged += updated.length;
  }
  return { flagged };
}

/* ----------------------------------------------------------------- reading */

export interface BlockListOptions {
  kind?: AnswerBlock["kind"];
  query?: string;
  tag?: string;
  staleFirst?: boolean;
  includeArchived?: boolean;
}

/**
 * Library listing and search. Postgres full-text over title, body, and tags —
 * a firm with 200 blocks is searching prose, not filtering a dropdown.
 */
export async function listBlocks(
  firmId: string,
  options: BlockListOptions = {},
): Promise<AnswerBlock[]> {
  const db = getDb();
  const conditions = [eq(answerBlocks.firmId, firmId)];
  if (!options.includeArchived) conditions.push(eq(answerBlocks.archived, false));
  if (options.kind) conditions.push(eq(answerBlocks.kind, options.kind));
  if (options.tag) {
    conditions.push(sql`${options.tag} = any(${answerBlocks.tags})`);
  }
  const query = options.query?.trim();
  if (query) {
    conditions.push(
      sql`to_tsvector('english', ${answerBlocks.title} || ' ' || ${answerBlocks.body} || ' ' || array_to_string(${answerBlocks.tags}, ' ')) @@ websearch_to_tsquery('english', ${query})`,
    );
  }

  const rows = await db
    .select()
    .from(answerBlocks)
    .where(and(...conditions))
    .orderBy(
      options.staleFirst ? asc(answerBlocks.lastReviewedAt) : desc(answerBlocks.updatedAt),
    );
  return rows;
}

export async function getBlock(firmId: string, blockId: string): Promise<AnswerBlock | null> {
  const [row] = await getDb()
    .select()
    .from(answerBlocks)
    .where(and(eq(answerBlocks.id, blockId), eq(answerBlocks.firmId, firmId)));
  return row ?? null;
}

export async function libraryStats(
  firmId: string,
  now: Date = new Date(),
): Promise<{ total: number; stale: number; wonWith: number }> {
  const rows = await getDb()
    .select()
    .from(answerBlocks)
    .where(and(eq(answerBlocks.firmId, firmId), eq(answerBlocks.archived, false)));
  return {
    total: rows.length,
    stale: rows.filter((row) => isStale(row.lastReviewedAt, now)).length,
    wonWith: rows.filter((row) => row.wonWith).length,
  };
}

/** All the firm's tags, most used first — the library's chip row. */
export async function listTags(firmId: string): Promise<Array<{ tag: string; count: number }>> {
  const rows = await getDb()
    .select({ tags: answerBlocks.tags })
    .from(answerBlocks)
    .where(and(eq(answerBlocks.firmId, firmId), eq(answerBlocks.archived, false)));
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/* ----------------------------------------------------------------- export */

/**
 * Export everything. The anti-lock-in promise, and it keeps working in
 * read-only dunning mode — that is the whole point of promising it.
 */
export async function exportLibrary(firmId: string): Promise<{ json: string; count: number }> {
  const db = getDb();
  const blocks = await db
    .select()
    .from(answerBlocks)
    .where(eq(answerBlocks.firmId, firmId))
    .orderBy(asc(answerBlocks.kind), asc(answerBlocks.title));
  const payload = {
    exportedAt: new Date().toISOString(),
    format: "rfpradar.library.v1",
    count: blocks.length,
    blocks: blocks.map((block) => ({
      kind: block.kind,
      title: block.title,
      body: block.body,
      tags: block.tags,
      version: block.version,
      lastReviewedAt: block.lastReviewedAt?.toISOString() ?? null,
      wonWith: block.wonWith,
      archived: block.archived,
      createdAt: block.createdAt.toISOString(),
    })),
  };
  return { json: JSON.stringify(payload, null, 2), count: blocks.length };
}

/* ------------------------------------------------------- the weekly refresh */

/** Recompute the stored `stale` flag. Idempotent; safe to run any number of times. */
export async function refreshStaleness(now: Date = new Date()): Promise<{ marked: number; cleared: number }> {
  const db = getDb();
  const cutoff = staleThreshold(now);
  const marked = await db
    .update(answerBlocks)
    .set({ stale: true })
    .where(
      and(
        eq(answerBlocks.stale, false),
        or(isNull(answerBlocks.lastReviewedAt), lt(answerBlocks.lastReviewedAt, cutoff)),
      ),
    )
    .returning({ id: answerBlocks.id });
  const cleared = await db
    .update(answerBlocks)
    .set({ stale: false })
    // Typed operator, not a raw fragment: a Date inside sql`` skips Drizzle's
    // encoder and postgres.js then tries Buffer.byteLength on it at runtime.
    .where(and(eq(answerBlocks.stale, true), gte(answerBlocks.lastReviewedAt, cutoff)))
    .returning({ id: answerBlocks.id });
  return { marked: marked.length, cleared: cleared.length };
}

/** Requirement rows for a pursuit, in checklist order. */
export async function listRequirements(pursuitId: string) {
  return await getDb()
    .select()
    .from(requirements)
    .where(eq(requirements.pursuitId, pursuitId))
    .orderBy(asc(requirements.sortOrder), asc(requirements.createdAt));
}
