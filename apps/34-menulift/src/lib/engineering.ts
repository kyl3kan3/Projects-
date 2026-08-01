/**
 * Menu engineering: the stars / plowhorses / puzzles / dogs matrix.
 *
 * This is the classic Kasavana–Smith analysis, stated explicitly because every
 * vague implementation of it produces confident nonsense.
 *
 * ## The two axes
 *
 * Both are computed **within a section** (the "category" in the literature).
 * Comparing an $8 dessert against a $34 steak is the standard way to get a
 * matrix that only tells you which section you're looking at.
 *
 * **Popularity.** An item's menu mix is its share of the section's units sold:
 * `mix = qty / sectionUnits`. If a section has `n` items, an even split would
 * give each `1/n`. Kasavana–Smith calls an item popular when its mix reaches
 * **70% of that even split** — so the line is `0.70 / n`.
 *
 * **Margin.** Contribution margin is `price − plateCost`, in cents. The line is
 * the section's **unit-weighted average** contribution margin,
 * `Σ(cm_i × qty_i) / Σ(qty_i)`, taken over items whose cost is known.
 *
 * ## Boundaries, stated once
 *
 * An item sitting *exactly* on either line counts as **high** on that axis
 * (`>=`, not `>`). Both comparisons are done in exact integer arithmetic, never
 * against a rounded index, so an item cannot be classified one way and reported
 * another.
 *
 * |            | margin high | margin low |
 * |------------|-------------|------------|
 * | pop. high  | star        | plowhorse  |
 * | pop. low   | puzzle      | dog        |
 *
 * ## When we refuse to answer
 *
 * A quadrant is a recommendation to change a menu, so it is withheld — with a
 * stated reason — whenever the data cannot support one:
 *
 *  - `too_few_items` — fewer than {@link MIN_SECTION_ITEMS} items in the
 *    section. With three items the popularity line sits at 23% and every call
 *    is noise.
 *  - `too_few_sales` — the section sold fewer than
 *    {@link MIN_SECTION_UNITS} covers, or this item sold fewer than
 *    {@link MIN_ITEM_UNITS}. A dish that sold four times is not a dog; it is
 *    an unmeasured dish.
 *  - `needs_cost` — no plate cost for this item, or fewer than
 *    {@link MIN_COSTED_ITEMS} costed items in the section to average against.
 *    Popularity is still reported; the margin axis simply isn't there.
 *
 * Reasons are checked in that order: sample-size problems first (nothing the
 * owner types will fix them), missing costs last (a data-entry prompt will).
 *
 * Pure module — no database, no clock. Deterministic for a given input.
 */

export type Quadrant = "star" | "plowhorse" | "puzzle" | "dog";
export type WithheldReason = "too_few_items" | "too_few_sales" | "needs_cost";

/** Popularity line: 70% of an even share of section units. */
export const POPULARITY_FACTOR_BP = 7000;
/** Below this many items in a section, the popularity line is meaningless. */
export const MIN_SECTION_ITEMS = 4;
/** Below this many units sold in a section, the whole section is unmeasured. */
export const MIN_SECTION_UNITS = 40;
/** Below this many units for one item, that item is unmeasured. */
export const MIN_ITEM_UNITS = 10;
/** Costed items needed in a section before an average margin means anything. */
export const MIN_COSTED_ITEMS = 2;

export interface EngineeringInput {
  itemId: string;
  itemName: string;
  sectionId: string;
  sectionName: string;
  priceCents: number;
  /** Plate cost. Null when the owner has not entered one. */
  costCents: number | null;
  qtySold: number;
  /** Net sales from the POS, in cents. Reported, never used to classify. */
  revenueCents: number;
}

export interface Classification {
  itemId: string;
  itemName: string;
  sectionId: string;
  sectionName: string;
  qtySold: number;
  priceCents: number;
  costCents: number | null;
  revenueCents: number;
  /** Share of section units, in basis points (412 = 4.12%). */
  mixShareBp: number;
  /** mix ÷ popularity line, ×10000. Exactly 10000 sits on the line. */
  popularityIndex: number;
  /** price − cost, or null. */
  contributionMarginCents: number | null;
  /** cm ÷ section average cm, ×10000. Null when there is no usable average. */
  marginIndex: number | null;
  popularityHigh: boolean;
  /** Null when the margin axis is unavailable for this item. */
  marginHigh: boolean | null;
  quadrant: Quadrant | null;
  withheldReason: WithheldReason | null;
  /** One concrete sentence, with the item's own numbers in it. */
  recommendation: string;
}

export interface SectionStats {
  sectionId: string;
  sectionName: string;
  itemCount: number;
  totalUnits: number;
  /** Unit-weighted average contribution margin in cents, or null. */
  averageMarginCents: number | null;
  costedItemCount: number;
  /** Units needed to clear the popularity line, rounded up. */
  popularityLineUnits: number;
}

const QUADRANT_LABELS: Record<Quadrant, string> = {
  star: "Star",
  plowhorse: "Plowhorse",
  puzzle: "Puzzle",
  dog: "Dog",
};

export function quadrantLabel(q: Quadrant): string {
  return QUADRANT_LABELS[q];
}

function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function percent(bp: number): string {
  return `${(bp / 100).toFixed(1)}%`;
}

/** Round a price up to the next 50¢ — how menus are actually priced. */
function roundUpToHalfDollar(cents: number): number {
  return Math.ceil(cents / 50) * 50;
}

/**
 * Classify one import's worth of sales.
 *
 * Items are grouped by section; every input row comes back with a
 * classification, in the order it was given.
 */
export function classify(inputs: EngineeringInput[]): Classification[] {
  const sections = new Map<string, EngineeringInput[]>();
  for (const row of inputs) {
    const bucket = sections.get(row.sectionId);
    if (bucket) bucket.push(row);
    else sections.set(row.sectionId, [row]);
  }

  const stats = new Map<string, SectionStats>();
  for (const [sectionId, rows] of sections) {
    stats.set(sectionId, sectionStats(sectionId, rows));
  }

  const bySection = new Map<string, Classification[]>();
  for (const [sectionId, rows] of sections) {
    const s = stats.get(sectionId)!;
    bySection.set(
      sectionId,
      rows.map((row) => classifyOne(row, rows, s)),
    );
  }

  // Preserve input order.
  const cursor = new Map<string, number>();
  return inputs.map((row) => {
    const i = cursor.get(row.sectionId) ?? 0;
    cursor.set(row.sectionId, i + 1);
    return bySection.get(row.sectionId)![i];
  });
}

export function sectionStats(sectionId: string, rows: EngineeringInput[]): SectionStats {
  const totalUnits = rows.reduce((sum, r) => sum + Math.max(0, r.qtySold), 0);
  const costed = rows.filter((r) => r.costCents !== null);
  const costedUnits = costed.reduce((sum, r) => sum + Math.max(0, r.qtySold), 0);
  const weighted = costed.reduce(
    (sum, r) => sum + (r.priceCents - (r.costCents as number)) * Math.max(0, r.qtySold),
    0,
  );
  const averageMarginCents =
    costed.length >= MIN_COSTED_ITEMS && costedUnits > 0
      ? Math.round(weighted / costedUnits)
      : null;

  const n = rows.length;
  const popularityLineUnits =
    n > 0 && totalUnits > 0 ? Math.ceil((totalUnits * POPULARITY_FACTOR_BP) / (n * 10000)) : 0;

  return {
    sectionId,
    sectionName: rows[0]?.sectionName ?? "",
    itemCount: n,
    totalUnits,
    averageMarginCents,
    costedItemCount: costed.length,
    popularityLineUnits,
  };
}

/** Exact popularity test: `qty / totalUnits >= 0.70 / n`, no floats. */
function isPopular(qty: number, totalUnits: number, itemCount: number): boolean {
  if (totalUnits <= 0 || itemCount <= 0) return false;
  return qty * itemCount * 10000 >= totalUnits * POPULARITY_FACTOR_BP;
}

/** Exact margin test: `cm >= Σ(cm·qty) / Σqty`, no floats. */
function isHighMargin(cm: number, rows: EngineeringInput[]): boolean {
  let weighted = 0;
  let units = 0;
  for (const r of rows) {
    if (r.costCents === null) continue;
    const qty = Math.max(0, r.qtySold);
    weighted += (r.priceCents - r.costCents) * qty;
    units += qty;
  }
  if (units <= 0) return false;
  return cm * units >= weighted;
}

function classifyOne(
  row: EngineeringInput,
  siblings: EngineeringInput[],
  s: SectionStats,
): Classification {
  const qty = Math.max(0, row.qtySold);
  const mixShareBp = s.totalUnits > 0 ? Math.round((qty * 10000) / s.totalUnits) : 0;
  const popularityHigh = isPopular(qty, s.totalUnits, s.itemCount);

  // popularityIndex is a display number; the boolean above is the authority.
  const popularityIndex =
    s.totalUnits > 0 && s.itemCount > 0
      ? Math.round((qty * s.itemCount * 10000 * 10000) / (s.totalUnits * POPULARITY_FACTOR_BP))
      : 0;

  const cm = row.costCents === null ? null : row.priceCents - row.costCents;
  const marginIndex =
    cm !== null && s.averageMarginCents !== null && s.averageMarginCents > 0
      ? Math.round((cm * 10000) / s.averageMarginCents)
      : null;

  const base = {
    itemId: row.itemId,
    itemName: row.itemName,
    sectionId: row.sectionId,
    sectionName: row.sectionName,
    qtySold: row.qtySold,
    priceCents: row.priceCents,
    costCents: row.costCents,
    revenueCents: row.revenueCents,
    mixShareBp,
    popularityIndex,
    contributionMarginCents: cm,
    marginIndex,
    popularityHigh,
  };

  // --- the refusal ladder, in the documented order ------------------------
  if (s.itemCount < MIN_SECTION_ITEMS) {
    return {
      ...base,
      marginHigh: null,
      quadrant: null,
      withheldReason: "too_few_items",
      recommendation: `No quadrant: ${s.sectionName} has only ${s.itemCount} ${
        s.itemCount === 1 ? "item" : "items"
      } in this import, and the popularity line needs at least ${MIN_SECTION_ITEMS} to mean anything.`,
    };
  }
  if (s.totalUnits < MIN_SECTION_UNITS) {
    return {
      ...base,
      marginHigh: null,
      quadrant: null,
      withheldReason: "too_few_sales",
      recommendation: `No quadrant: ${s.sectionName} sold ${s.totalUnits} covers in this period, under the ${MIN_SECTION_UNITS} needed to rank items against each other.`,
    };
  }
  if (qty < MIN_ITEM_UNITS) {
    return {
      ...base,
      marginHigh: null,
      quadrant: null,
      withheldReason: "too_few_sales",
      recommendation: `No quadrant: ${qty} sold is too thin a sample to call. Import a longer period before deciding anything about this dish.`,
    };
  }
  if (cm === null) {
    return {
      ...base,
      marginHigh: null,
      quadrant: null,
      withheldReason: "needs_cost",
      recommendation: `Add a plate cost. ${percent(mixShareBp)} of ${s.sectionName} units (${qty} sold) — popularity is clear, margin is unknown until the cost is in.`,
    };
  }
  if (s.averageMarginCents === null) {
    return {
      ...base,
      marginHigh: null,
      quadrant: null,
      withheldReason: "needs_cost",
      recommendation: `Add plate costs to more of ${s.sectionName}. ${MIN_COSTED_ITEMS} costed items are the minimum for a section average; this one has ${s.costedItemCount}.`,
    };
  }

  const marginHigh = isHighMargin(cm, siblings);
  const quadrant: Quadrant = popularityHigh
    ? marginHigh
      ? "star"
      : "plowhorse"
    : marginHigh
      ? "puzzle"
      : "dog";

  return {
    ...base,
    marginHigh,
    quadrant,
    withheldReason: null,
    recommendation: recommend(quadrant, {
      itemName: row.itemName,
      sectionName: s.sectionName,
      priceCents: row.priceCents,
      cm,
      averageMarginCents: s.averageMarginCents,
      qty,
      mixShareBp,
    }),
  };
}

interface RecommendContext {
  itemName: string;
  sectionName: string;
  priceCents: number;
  cm: number;
  averageMarginCents: number;
  qty: number;
  mixShareBp: number;
}

/** One sentence per quadrant, carrying the item's own arithmetic. */
export function recommend(quadrant: Quadrant, c: RecommendContext): string {
  switch (quadrant) {
    case "star":
      return `Protect it. ${c.qty} sold at a ${dollars(c.cm)} margin — hold ${dollars(
        c.priceCents,
      )} and keep it in the top third of ${c.sectionName}.`;
    case "plowhorse": {
      const gap = c.averageMarginCents - c.cm;
      const target = roundUpToHalfDollar(c.priceCents + gap);
      const lift = target - c.priceCents;
      return `Re-price or re-cost. Sells hard (${percent(c.mixShareBp)} of ${
        c.sectionName
      } units) on a thin ${dollars(c.cm)} margin — ${dollars(target)} (+${dollars(
        lift,
      )}) brings it to the ${dollars(c.averageMarginCents)} section average.`;
    }
    case "puzzle":
      return `Reposition and photograph. A ${dollars(c.cm)} margin at only ${percent(
        c.mixShareBp,
      )} of ${c.sectionName} units — move it above the fold and give it a photo before touching the price.`;
    case "dog":
      return `Cut or reinvent. ${c.qty} sold at a ${dollars(
        c.cm,
      )} margin, below the ${dollars(c.averageMarginCents)} section average — the menu space is worth more to something else.`;
  }
}

export interface MatrixSummary {
  star: number;
  plowhorse: number;
  puzzle: number;
  dog: number;
  withheld: number;
  needsCost: number;
  classified: number;
  total: number;
}

export function summarise(rows: Classification[]): MatrixSummary {
  const s: MatrixSummary = {
    star: 0,
    plowhorse: 0,
    puzzle: 0,
    dog: 0,
    withheld: 0,
    needsCost: 0,
    classified: 0,
    total: rows.length,
  };
  for (const r of rows) {
    if (r.quadrant) {
      s[r.quadrant] += 1;
      s.classified += 1;
    } else {
      s.withheld += 1;
      if (r.withheldReason === "needs_cost") s.needsCost += 1;
    }
  }
  return s;
}

/**
 * Chart position in unit space, origin bottom-left.
 *
 * Both lines land at 0.5, so the axes drawn through the middle of the plot are
 * literally the thresholds. An index of 2× or more clamps to the edge — a dish
 * with five times the average margin should sit at the rim, not rescale everyone
 * else into a huddle.
 */
export function plotPoint(c: Classification): { x: number; y: number } | null {
  if (c.marginIndex === null) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: clamp(c.marginIndex / 20000),
    y: clamp(c.popularityIndex / 20000),
  };
}

/** Short human reason, for the row that has no quadrant. */
export function withheldLabel(reason: WithheldReason): string {
  switch (reason) {
    case "too_few_items":
      return "Not enough items in the section";
    case "too_few_sales":
      return "Not enough sales to call";
    case "needs_cost":
      return "Plate cost missing";
  }
}
