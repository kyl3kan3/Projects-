/**
 * The price book: the moat, and the thing every draft is priced from.
 *
 * Three jobs live here — CRUD with the plan's size cap, CSV import, and per-trade
 * starter templates — plus the one function every drafting path calls to load
 * matchable items.
 *
 * The import is deliberately loud about what it skipped. A silently truncated
 * import means a contractor's estimates quietly miss items they think are in
 * there, which shows up as a wrong number on a proposal weeks later.
 */

import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  priceBookItems,
  type ItemSource,
  type Organization,
  type PriceBookItem,
  type PriceBookItemKind,
  type Trade,
  type Unit,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { cell, findColumn, parseCsv } from "@/lib/csv";
import { parseAmountToCents } from "@/lib/money";
import { orgAsGatable, priceBookCapacity } from "@/lib/plans";
import { starterBookFor } from "@/lib/trades";
import type { MatchableItem } from "@/lib/matching";
import { searchTextFor } from "@/lib/item-fields";

// Re-exported so server code has one import for price-book concerns.
export { KINDS, KIND_LABELS, UNITS, UNIT_LABELS, searchTextFor } from "@/lib/item-fields";


export function asMatchable(item: PriceBookItem): MatchableItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    kind: item.kind,
    unit: item.unit,
    unitCostCents: item.unitCostCents,
    markupPct: item.markupPct,
  };
}

/* ------------------------------------------------------------------ reads --- */

export async function listItems(
  organizationId: string,
  options: { search?: string; includeInactive?: boolean } = {},
): Promise<PriceBookItem[]> {
  const db = getDb();
  const filters = [eq(priceBookItems.organizationId, organizationId)];
  if (!options.includeInactive) filters.push(eq(priceBookItems.active, true));
  const search = (options.search ?? "").trim();
  if (search) {
    const pattern = `%${search}%`;
    const matches = or(
      ilike(priceBookItems.name, pattern),
      ilike(priceBookItems.category, pattern),
      ilike(priceBookItems.searchText, pattern),
    );
    if (matches) filters.push(matches);
  }
  return db
    .select()
    .from(priceBookItems)
    .where(and(...filters))
    .orderBy(asc(priceBookItems.category), asc(priceBookItems.name));
}

export async function itemCount(organizationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(priceBookItems)
    .where(
      and(eq(priceBookItems.organizationId, organizationId), eq(priceBookItems.active, true)),
    );
  return Number(row?.value ?? 0);
}

export async function getItem(
  organizationId: string,
  id: string,
): Promise<PriceBookItem | null> {
  const db = getDb();
  const [item] = await db
    .select()
    .from(priceBookItems)
    .where(and(eq(priceBookItems.organizationId, organizationId), eq(priceBookItems.id, id)));
  return item ?? null;
}

/** Active items as matchable rows — every drafting path starts here. */
export async function matchableItems(organizationId: string): Promise<MatchableItem[]> {
  const items = await listItems(organizationId);
  return items.map(asMatchable);
}

export function groupByCategory(items: readonly PriceBookItem[]): Array<[string, PriceBookItem[]]> {
  const groups = new Map<string, PriceBookItem[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

/* ----------------------------------------------------------------- writes --- */

export interface ItemInput {
  category: string;
  name: string;
  description?: string | null;
  kind: PriceBookItemKind;
  unit: Unit;
  unitCostCents: number;
  markupPct?: number | null;
}

export type ItemWriteResult =
  | { ok: true; item: PriceBookItem }
  | { ok: false; error: string };

export async function createItem(
  org: Organization,
  actorId: string,
  input: ItemInput,
): Promise<ItemWriteResult> {
  if (!input.name.trim()) return { ok: false, error: "Give the item a name." };
  if (!input.category.trim()) return { ok: false, error: "Give the item a category." };
  if (!Number.isFinite(input.unitCostCents) || input.unitCostCents < 0) {
    return { ok: false, error: "Enter a cost." };
  }

  const capacity = priceBookCapacity(orgAsGatable(org), await itemCount(org.id));
  if (capacity.atLimit) {
    return {
      ok: false,
      error: `Your plan's price book holds ${capacity.limit} items and it is full. Upgrade or archive something first.`,
    };
  }

  const db = getDb();
  const values = {
    organizationId: org.id,
    category: input.category.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    kind: input.kind,
    unit: input.unit,
    unitCostCents: Math.round(input.unitCostCents),
    markupPct: input.markupPct ?? null,
    searchText: searchTextFor(input),
    source: "manual" as ItemSource,
  };
  try {
    const [item] = await db.insert(priceBookItems).values(values).returning();
    await audit(org.id, actorId, "price_book_item_created", item.name, {
      unitCostCents: item.unitCostCents,
    });
    return { ok: true, item };
  } catch {
    return { ok: false, error: "You already have an item with that name in that category." };
  }
}

export async function updateItem(
  org: Organization,
  actorId: string,
  id: string,
  input: ItemInput,
): Promise<ItemWriteResult> {
  const existing = await getItem(org.id, id);
  if (!existing) return { ok: false, error: "That item no longer exists." };
  if (!input.name.trim()) return { ok: false, error: "Give the item a name." };

  const db = getDb();
  const [item] = await db
    .update(priceBookItems)
    .set({
      category: input.category.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      kind: input.kind,
      unit: input.unit,
      unitCostCents: Math.round(input.unitCostCents),
      markupPct: input.markupPct ?? null,
      searchText: searchTextFor(input),
      updatedAt: new Date(),
    })
    .where(and(eq(priceBookItems.organizationId, org.id), eq(priceBookItems.id, id)))
    .returning();
  await audit(org.id, actorId, "price_book_item_updated", item.name, {
    from: existing.unitCostCents,
    to: item.unitCostCents,
  });
  return { ok: true, item };
}

/**
 * Archive rather than delete: estimates and sent proposals reference the row, and
 * a contractor asking "what did I charge for that in March" deserves an answer.
 */
export async function archiveItem(
  org: Organization,
  actorId: string,
  id: string,
): Promise<void> {
  const db = getDb();
  const [item] = await db
    .update(priceBookItems)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(priceBookItems.organizationId, org.id), eq(priceBookItems.id, id)))
    .returning();
  if (item) await audit(org.id, actorId, "price_book_item_archived", item.name);
}

/* --------------------------------------------------------------- template --- */

/** Seed the trade's starter book. Idempotent: existing names are left alone. */
export async function seedStarterTemplate(
  organizationId: string,
  trade: Trade,
): Promise<number> {
  const db = getDb();
  const starter = starterBookFor(trade);
  const values = starter.map((item) => ({
    organizationId,
    category: item.category,
    name: item.name,
    description: item.description ?? null,
    kind: item.kind,
    unit: item.unit,
    unitCostCents: item.unitCostCents,
    markupPct: item.markupPct ?? null,
    searchText: searchTextFor(item),
    source: "template" as ItemSource,
  }));
  const inserted = await db
    .insert(priceBookItems)
    .values(values)
    .onConflictDoNothing({
      target: [priceBookItems.organizationId, priceBookItems.category, priceBookItems.name],
    })
    .returning();
  if (inserted.length) {
    await audit(organizationId, "system", "price_book_seeded", `${trade} starter book`, {
      items: inserted.length,
    });
  }
  return inserted.length;
}

/* ----------------------------------------------------------------- import --- */

export interface ImportRowIssue {
  line: number;
  reason: string;
  raw: string;
}

export interface ImportPlanRow {
  line: number;
  values: ItemInput;
}

export interface ImportPlan {
  rows: ImportPlanRow[];
  skipped: ImportRowIssue[];
  /** Which column each field was read from, for the confirmation screen. */
  mapping: Record<string, string | null>;
}

const NAME_ALIASES = ["name", "item", "description", "item name", "service", "task"];
const CATEGORY_ALIASES = ["category", "group", "type", "section", "trade"];
const COST_ALIASES = ["unit cost", "cost", "unitcost", "cost each", "price", "unit price", "rate"];
const KIND_ALIASES = ["kind", "item type", "cost type", "class"];
const UNIT_ALIASES = ["unit", "uom", "unit of measure", "per"];
const MARKUP_ALIASES = ["markup", "markup pct", "margin", "markup %"];
const DESCRIPTION_ALIASES = ["notes", "detail", "details", "long description", "spec"];

function parseKind(value: string): PriceBookItemKind {
  const text = value.toLowerCase();
  if (/labou?r|install|tech|hour/.test(text)) return "labor";
  if (/flat|assembly|package|service/.test(text)) return "flat_rate";
  return "material";
}

function parseUnit(value: string): Unit {
  const text = value.toLowerCase().replace(/[^a-z]/g, "");
  if (/hour|hr/.test(text)) return "hour";
  if (/sq|sf/.test(text)) return "sqft";
  if (/lf|linear|lnft|ft|foot|feet/.test(text)) return "lf";
  if (/day/.test(text)) return "day";
  return "each";
}

/**
 * Read a CSV into a plan without touching the database, so the UI can show what
 * it is about to import and what it could not read.
 */
export function planImport(csv: string): ImportPlan {
  const table = parseCsv(csv);
  if (!table.headers.length) {
    return { rows: [], skipped: [{ line: 1, reason: "The file is empty.", raw: "" }], mapping: {} };
  }

  const nameIdx = findColumn(table.headers, NAME_ALIASES);
  const categoryIdx = findColumn(table.headers, CATEGORY_ALIASES);
  const costIdx = findColumn(table.headers, COST_ALIASES);
  const kindIdx = findColumn(table.headers, KIND_ALIASES);
  const unitIdx = findColumn(table.headers, UNIT_ALIASES);
  const markupIdx = findColumn(table.headers, MARKUP_ALIASES);
  const descIdx = findColumn(table.headers, DESCRIPTION_ALIASES);

  const mapping = {
    name: nameIdx >= 0 ? table.headers[nameIdx] : null,
    category: categoryIdx >= 0 ? table.headers[categoryIdx] : null,
    unitCost: costIdx >= 0 ? table.headers[costIdx] : null,
    kind: kindIdx >= 0 ? table.headers[kindIdx] : null,
    unit: unitIdx >= 0 ? table.headers[unitIdx] : null,
    markupPct: markupIdx >= 0 ? table.headers[markupIdx] : null,
    description: descIdx >= 0 ? table.headers[descIdx] : null,
  };

  const rows: ImportPlanRow[] = [];
  const skipped: ImportRowIssue[] = [];
  const seen = new Set<string>();

  if (nameIdx < 0 || costIdx < 0) {
    skipped.push({
      line: 1,
      reason:
        "The sheet needs at least a name column and a cost column. Rename the headers and try again.",
      raw: table.headers.join(", "),
    });
    return { rows, skipped, mapping };
  }

  table.rows.forEach((row, index) => {
    const line = index + 2; // 1-based, plus the header
    const raw = row.join(", ");
    const name = cell(row, nameIdx);
    if (!name) {
      skipped.push({ line, reason: "No item name.", raw });
      return;
    }
    const cents = parseAmountToCents(cell(row, costIdx));
    if (cents === null) {
      skipped.push({ line, reason: `Could not read a cost from "${cell(row, costIdx)}".`, raw });
      return;
    }
    if (cents < 0) {
      skipped.push({ line, reason: "Negative cost.", raw });
      return;
    }
    const category = cell(row, categoryIdx) || "Imported";
    const dedupeKey = `${category.toLowerCase()}::${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      skipped.push({ line, reason: "Duplicate of an earlier row in this file.", raw });
      return;
    }
    seen.add(dedupeKey);

    const markupRaw = cell(row, markupIdx).replace("%", "");
    const markupPct = markupRaw && Number.isFinite(Number(markupRaw)) ? Number(markupRaw) : null;

    rows.push({
      line,
      values: {
        category,
        name,
        description: cell(row, descIdx) || null,
        kind: parseKind(cell(row, kindIdx) || category),
        unit: parseUnit(cell(row, unitIdx)),
        unitCostCents: cents,
        markupPct,
      },
    });
  });

  return { rows, skipped, mapping };
}

export interface ImportOutcome {
  imported: number;
  updated: number;
  skipped: ImportRowIssue[];
  /** Rows dropped because the plan's cap was reached. */
  overLimit: number;
  limit: number;
}

/**
 * Apply an import plan. Existing name+category rows are updated (a rate sheet is
 * re-imported when prices change), everything else is inserted, and anything past
 * the plan's cap is reported rather than dropped silently.
 */
export async function applyImport(
  org: Organization,
  actorId: string,
  plan: ImportPlan,
): Promise<ImportOutcome> {
  const db = getDb();
  const capacity = priceBookCapacity(orgAsGatable(org), await itemCount(org.id));
  const existing = await listItems(org.id, { includeInactive: true });
  const existingKeys = new Map(
    existing.map((item) => [`${item.category.toLowerCase()}::${item.name.toLowerCase()}`, item]),
  );

  let imported = 0;
  let updated = 0;
  let overLimit = 0;
  let room = capacity.remaining;

  for (const row of plan.rows) {
    const key = `${row.values.category.toLowerCase()}::${row.values.name.toLowerCase()}`;
    const match = existingKeys.get(key);
    if (match) {
      await db
        .update(priceBookItems)
        .set({
          description: row.values.description,
          kind: row.values.kind,
          unit: row.values.unit,
          unitCostCents: row.values.unitCostCents,
          markupPct: row.values.markupPct,
          searchText: searchTextFor(row.values),
          active: true,
          source: "csv_import",
          updatedAt: new Date(),
        })
        .where(eq(priceBookItems.id, match.id));
      updated += 1;
      continue;
    }
    if (room <= 0) {
      overLimit += 1;
      continue;
    }
    await db.insert(priceBookItems).values({
      organizationId: org.id,
      category: row.values.category,
      name: row.values.name,
      description: row.values.description,
      kind: row.values.kind,
      unit: row.values.unit,
      unitCostCents: row.values.unitCostCents,
      markupPct: row.values.markupPct,
      searchText: searchTextFor(row.values),
      source: "csv_import",
    });
    imported += 1;
    room -= 1;
  }

  await audit(org.id, actorId, "price_book_imported", `${imported} added, ${updated} updated`, {
    skipped: plan.skipped.length,
    overLimit,
  });

  return { imported, updated, skipped: plan.skipped, overLimit, limit: capacity.limit };
}

/** A sample CSV the import screen offers, so the format is never a guess. */
export function sampleImportCsv(): string {
  return [
    "Category,Name,Kind,Unit,Unit Cost,Markup %,Notes",
    'Equipment,"Condenser, 3-ton 15.2 SEER2 R-410A",Material,each,1950.00,35,',
    "Labor,Install labor lead technician,Labor,hour,95.00,40,",
    'Flat rate,"Permit filing and inspection",Flat rate,each,325.00,0,Filed with the county',
  ].join("\n");
}

/** Total book value at cost — shown on the price book screen. */
export function bookValueCents(items: readonly PriceBookItem[]): number {
  return items.reduce((sum, item) => sum + item.unitCostCents, 0);
}
