/**
 * The database side of a POS import: match rows to dishes, store the stats,
 * classify, and store the matrix snapshot.
 *
 * Split from src/lib/pos-import.ts on purpose — that file is pure and heavily
 * tested; this one is the thin layer that talks to Postgres.
 *
 * Recomputation is a first-class operation, not a re-upload: entering a plate
 * cost must update the matrix for an import that already ran, which is why
 * {@link recomputeMatrix} reads `item_sales_stats` back rather than the CSV.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  itemSalesStats,
  matrixSnapshots,
  menuItems,
  menuSections,
  menus,
  posImports,
  type ColumnMapping,
  type PosImport,
} from "@/db/schema";
import { classify, summarise, type Classification, type EngineeringInput } from "@/lib/engineering";
import {
  MAX_IMPORT_ROWS,
  matchRateBp,
  matchRows,
  parseSalesCsv,
  type MatchCandidate,
  type ParseIssue,
} from "@/lib/pos-import";

export interface RunImportInput {
  locationId: string;
  filename: string;
  csv: string;
  mapping?: ColumnMapping | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export type RunImportResult =
  | {
      ok: true;
      importId: string;
      rowCount: number;
      matchedCount: number;
      unmatchedCount: number;
      matchRateBp: number;
      issues: ParseIssue[];
      summary: ReturnType<typeof summarise>;
    }
  | {
      ok: false;
      kind: "needs_mapping" | "unreadable" | "no_menu";
      message: string;
      headers: string[];
      sample: string[][];
    };

/** Every item at a location that a CSV row could match, with its section. */
async function matchCandidates(locationId: string): Promise<
  (MatchCandidate & { sectionId: string; sectionName: string; priceCents: number; costCents: number | null })[]
> {
  const db = getDb();
  const rows = await db
    .select({
      itemId: menuItems.id,
      name: menuItems.name,
      sectionId: menuSections.id,
      sectionName: menuSections.name,
      priceCents: menuItems.priceCents,
      costCents: menuItems.costCents,
    })
    .from(menuItems)
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .where(eq(menuItems.locationId, locationId))
    .orderBy(asc(menuSections.position), asc(menuItems.position));
  return rows;
}

export async function runImport(input: RunImportInput): Promise<RunImportResult> {
  const db = getDb();

  const candidates = await matchCandidates(input.locationId);
  if (!candidates.length) {
    return {
      ok: false,
      kind: "no_menu",
      message: "Build the menu first — there is nothing here for the sales rows to match against.",
      headers: [],
      sample: [],
    };
  }

  const parsed = parseSalesCsv(input.csv, { mapping: input.mapping, maxRows: MAX_IMPORT_ROWS });
  if (!parsed.ok) {
    return {
      ok: false,
      kind: parsed.kind,
      message: parsed.message,
      headers: parsed.headers,
      sample: parsed.sample,
    };
  }

  const outcome = matchRows(parsed.rows, candidates);
  const byId = new Map(candidates.map((c) => [c.itemId, c]));

  const [record] = await db
    .insert(posImports)
    .values({
      locationId: input.locationId,
      source: parsed.source,
      filename: input.filename.slice(0, 200),
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      rowCount: parsed.rows.length,
      matchedCount: outcome.matched.length,
      unmatched: outcome.unmatched.map((r) => ({ name: r.name, qty: r.qty, netCents: r.netCents })),
      columnMapping: parsed.mapping,
      status: "processing",
    })
    .returning();

  if (outcome.matched.length) {
    await db.insert(itemSalesStats).values(
      outcome.matched.map((m) => ({
        posImportId: record.id,
        menuItemId: m.itemId,
        qtySold: m.row.qty,
        revenueCents: m.row.netCents,
        costCentsAtImport: byId.get(m.itemId)?.costCents ?? null,
        matchedName: m.row.name,
        matchKind: m.kind,
      })),
    );
  }

  const classifications = await recomputeMatrix(record.id);

  await db
    .update(posImports)
    .set({ status: "complete", error: null })
    .where(eq(posImports.id, record.id));

  return {
    ok: true,
    importId: record.id,
    rowCount: parsed.rows.length,
    matchedCount: outcome.matched.length,
    unmatchedCount: outcome.unmatched.length,
    matchRateBp: matchRateBp(outcome),
    issues: parsed.issues,
    summary: summarise(classifications),
  };
}

/**
 * Rebuild the matrix for an import from the stats already stored.
 *
 * Plate costs are read **live**, not from `cost_cents_at_import`: the reason to
 * recompute is that the owner just typed a cost in, and an analysis that ignored
 * the number they entered would be indefensible. The at-import cost is kept as
 * the historical record of what was known at the time.
 */
export async function recomputeMatrix(importId: string): Promise<Classification[]> {
  const db = getDb();
  const stats = await db
    .select({
      menuItemId: itemSalesStats.menuItemId,
      qtySold: itemSalesStats.qtySold,
      revenueCents: itemSalesStats.revenueCents,
      itemName: menuItems.name,
      priceCents: menuItems.priceCents,
      costCents: menuItems.costCents,
      sectionId: menuSections.id,
      sectionName: menuSections.name,
    })
    .from(itemSalesStats)
    .innerJoin(menuItems, eq(menuItems.id, itemSalesStats.menuItemId))
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .where(eq(itemSalesStats.posImportId, importId));

  const inputs: EngineeringInput[] = stats.map((s) => ({
    itemId: s.menuItemId,
    itemName: s.itemName,
    sectionId: s.sectionId,
    sectionName: s.sectionName,
    priceCents: s.priceCents,
    costCents: s.costCents,
    qtySold: s.qtySold,
    revenueCents: s.revenueCents,
  }));

  const classifications = classify(inputs);

  await db.delete(matrixSnapshots).where(eq(matrixSnapshots.posImportId, importId));
  if (classifications.length) {
    await db.insert(matrixSnapshots).values(
      classifications.map((c) => ({
        posImportId: importId,
        menuItemId: c.itemId,
        sectionName: c.sectionName,
        itemName: c.itemName,
        quadrant: c.quadrant,
        withheldReason: c.withheldReason,
        popularityIndex: c.popularityIndex,
        marginIndex: c.marginIndex,
        mixShareBp: c.mixShareBp,
        contributionMarginCents: c.contributionMarginCents,
        qtySold: c.qtySold,
        recommendation: c.recommendation,
      })),
    );
  }
  return classifications;
}

/** Recompute every import that included this item — called after a cost edit. */
export async function recomputeImportsForItem(itemId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ importId: itemSalesStats.posImportId })
    .from(itemSalesStats)
    .where(eq(itemSalesStats.menuItemId, itemId));
  const ids = [...new Set(rows.map((r) => r.importId))];
  for (const id of ids) await recomputeMatrix(id);
  return ids.length;
}

export async function latestImport(locationId: string): Promise<PosImport | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(posImports)
    .where(and(eq(posImports.locationId, locationId), eq(posImports.status, "complete")))
    .orderBy(desc(posImports.createdAt))
    .limit(1);
  return row ?? null;
}

export async function importHistory(locationId: string, limit = 12): Promise<PosImport[]> {
  const db = getDb();
  return db
    .select()
    .from(posImports)
    .where(eq(posImports.locationId, locationId))
    .orderBy(desc(posImports.createdAt))
    .limit(limit);
}

export interface MatrixRow {
  itemId: string;
  itemName: string;
  sectionName: string;
  quadrant: string | null;
  withheldReason: string | null;
  popularityIndex: number;
  marginIndex: number | null;
  mixShareBp: number;
  contributionMarginCents: number | null;
  qtySold: number;
  recommendation: string;
  priceCents: number;
  revenueCents: number;
}

export async function loadMatrix(importId: string): Promise<MatrixRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      itemId: matrixSnapshots.menuItemId,
      itemName: matrixSnapshots.itemName,
      sectionName: matrixSnapshots.sectionName,
      quadrant: matrixSnapshots.quadrant,
      withheldReason: matrixSnapshots.withheldReason,
      popularityIndex: matrixSnapshots.popularityIndex,
      marginIndex: matrixSnapshots.marginIndex,
      mixShareBp: matrixSnapshots.mixShareBp,
      contributionMarginCents: matrixSnapshots.contributionMarginCents,
      qtySold: matrixSnapshots.qtySold,
      recommendation: matrixSnapshots.recommendation,
      priceCents: menuItems.priceCents,
      revenueCents: itemSalesStats.revenueCents,
    })
    .from(matrixSnapshots)
    .innerJoin(menuItems, eq(menuItems.id, matrixSnapshots.menuItemId))
    .innerJoin(
      itemSalesStats,
      and(
        eq(itemSalesStats.menuItemId, matrixSnapshots.menuItemId),
        eq(itemSalesStats.posImportId, matrixSnapshots.posImportId),
      ),
    )
    .where(eq(matrixSnapshots.posImportId, importId))
    .orderBy(desc(matrixSnapshots.qtySold));
  return rows;
}

/** Sales stats for one import, for the item-match review screen. */
export async function loadImportStats(importId: string) {
  const db = getDb();
  return db
    .select({
      itemId: itemSalesStats.menuItemId,
      itemName: menuItems.name,
      matchedName: itemSalesStats.matchedName,
      matchKind: itemSalesStats.matchKind,
      qtySold: itemSalesStats.qtySold,
      revenueCents: itemSalesStats.revenueCents,
      costCents: menuItems.costCents,
    })
    .from(itemSalesStats)
    .innerJoin(menuItems, eq(menuItems.id, itemSalesStats.menuItemId))
    .where(eq(itemSalesStats.posImportId, importId))
    .orderBy(desc(itemSalesStats.qtySold));
}

/**
 * Manually attach an unmatched CSV row to a dish.
 *
 * The row is taken out of `unmatched` and turned into a stat, then the matrix is
 * rebuilt. An item that already has a stat for this import is refused rather
 * than silently double-counted.
 */
export async function assignUnmatchedRow(
  importId: string,
  rowName: string,
  itemId: string,
): Promise<void> {
  const db = getDb();
  const [record] = await db.select().from(posImports).where(eq(posImports.id, importId));
  if (!record) throw new Error("That import no longer exists");

  const row = record.unmatched.find((r) => r.name === rowName);
  if (!row) throw new Error("That row is not in this import's unmatched list");

  const [item] = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.locationId, record.locationId)));
  if (!item) throw new Error("That dish is not at this location");

  const existing = await db
    .select()
    .from(itemSalesStats)
    .where(and(eq(itemSalesStats.posImportId, importId), eq(itemSalesStats.menuItemId, itemId)));
  if (existing.length) {
    throw new Error(`${item.name} already has sales in this import — pick a different dish.`);
  }

  await db.insert(itemSalesStats).values({
    posImportId: importId,
    menuItemId: itemId,
    qtySold: row.qty,
    revenueCents: row.netCents,
    costCentsAtImport: item.costCents,
    matchedName: row.name,
    matchKind: "fuzzy",
  });

  await db
    .update(posImports)
    .set({
      unmatched: record.unmatched.filter((r) => r.name !== rowName),
      matchedCount: record.matchedCount + 1,
    })
    .where(eq(posImports.id, importId));

  await recomputeMatrix(importId);
}

/** Items with sales in this import but no plate cost — the entry prompt. */
export async function costGaps(importId: string) {
  const db = getDb();
  const rows = await db
    .select({
      itemId: menuItems.id,
      name: menuItems.name,
      priceCents: menuItems.priceCents,
      costCents: menuItems.costCents,
      qtySold: itemSalesStats.qtySold,
      sectionName: menuSections.name,
    })
    .from(itemSalesStats)
    .innerJoin(menuItems, eq(menuItems.id, itemSalesStats.menuItemId))
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .where(eq(itemSalesStats.posImportId, importId))
    .orderBy(desc(itemSalesStats.qtySold));
  return rows.filter((r) => r.costCents === null);
}

/** Menu items available to attach an unmatched row to. */
export async function assignableItems(locationId: string, importId: string) {
  const db = getDb();
  const taken = await db
    .select({ itemId: itemSalesStats.menuItemId })
    .from(itemSalesStats)
    .where(eq(itemSalesStats.posImportId, importId));
  const takenIds = new Set(taken.map((t) => t.itemId));
  const all = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      sectionName: menuSections.name,
    })
    .from(menuItems)
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .where(eq(menuItems.locationId, locationId))
    .orderBy(asc(menuSections.position), asc(menuItems.position));
  return all.filter((i) => !takenIds.has(i.id));
}

/** Delete an import and everything derived from it. */
export async function deleteImport(importId: string, locationId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(posImports)
    .where(and(eq(posImports.id, importId), eq(posImports.locationId, locationId)));
}

/** Used by the matrix screen to resolve "which import am I looking at". */
export async function importById(importId: string, locationId: string): Promise<PosImport | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(posImports)
    .where(and(eq(posImports.id, importId), eq(posImports.locationId, locationId)));
  return row ?? null;
}

/** Item ids with stats in any import, so the editor can flag "has sales data". */
export async function itemsWithSales(locationId: string): Promise<Set<string>> {
  const db = getDb();
  const imports = await db
    .select({ id: posImports.id })
    .from(posImports)
    .where(eq(posImports.locationId, locationId));
  if (!imports.length) return new Set();
  const rows = await db
    .select({ itemId: itemSalesStats.menuItemId })
    .from(itemSalesStats)
    .where(inArray(itemSalesStats.posImportId, imports.map((i) => i.id)));
  return new Set(rows.map((r) => r.itemId));
}
