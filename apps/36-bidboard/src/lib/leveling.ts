/**
 * The leveling engine. Pure functions over plain data — no database, no React —
 * so the arithmetic that decides a six-figure award is unit-testable against
 * hand-checked fixtures (see leveling.test.ts).
 *
 * The rules, all of them, in one place:
 *
 *  1. **Integer cents, always.** Nothing here divides money except to compute a
 *     display percentage.
 *  2. **A plug never impersonates a bid.** A plug is applied only where the sub
 *     left no real price. If a revision later prices that line, the plug drops out
 *     of the total automatically — it can never double-count.
 *  3. **A plug never wins a per-line low.** Neither does an excluded cell. Only
 *     money a sub actually wrote can be the low number.
 *  4. **Free-form rows still count.** A row the sub typed themselves is real money
 *     in their bid, so it is inside their comparable total even while it sits in
 *     the needs-mapping tray. Leaving it out would make the sub who priced *more*
 *     scope look cheaper.
 *  5. **Alternates are tallied beside the base, never inside it.** An add-alternate
 *     summed into a base total makes the most thorough bidder look expensive.
 *  6. **Apparent low is computed on adjusted totals, and only among columns that
 *     cover the scope.** If nothing covers it, the low is still shown but marked
 *     provisional — hiding it would send the estimator back to the spreadsheet.
 */

import { scopeKey } from "@/lib/normalize";
import type { AdjustmentKind, BidKind, LineState, MappingStatus } from "@/db/schema";

/* ------------------------------------------------------------------ input --- */

export interface LevelFormLine {
  id: string;
  sort: number;
  description: string;
  unit: string | null;
  quantity: string | null;
  isAlternate: boolean;
  isAllowance: boolean;
}

export interface LevelBidLine {
  id: string;
  bidFormLineId: string | null;
  rawDescription: string;
  state: LineState;
  amountCents: number | null;
  mappingStatus: MappingStatus;
}

export interface LevelBid {
  id: string;
  invitationId: string;
  subCompanyId: string;
  subName: string;
  kind: BidKind;
  revision: number;
  /** What the sub's own submission totalled. Displayed, never trusted as the basis. */
  submittedTotalCents: number;
  inclusions: string[];
  exclusions: string[];
  submittedAt: Date | null;
  lines: LevelBidLine[];
}

export interface LevelAdjustment {
  id: string;
  /** Null = applies to every column (a package-wide normalisation). */
  bidId: string | null;
  bidFormLineId: string | null;
  kind: AdjustmentKind;
  amountCents: number;
  reason: string;
}

export interface LevelingInput {
  formLines: LevelFormLine[];
  bids: LevelBid[];
  adjustments: LevelAdjustment[];
  /** Above this share of the adjusted total, a column is flagged plug-heavy. */
  plugShareFlag?: number;
}

/* ----------------------------------------------------------------- output --- */

/** What the cell renders as. `declared` keeps what the sub actually said. */
export type CellKind = "priced" | "plug" | "excluded" | "included_elsewhere" | "missing";

export interface LevelingCell {
  bidId: string;
  bidFormLineId: string;
  kind: CellKind;
  declared: Exclude<CellKind, "plug">;
  amountCents: number | null;
  isLow: boolean;
  /** The sub's own wording, for the mapping sheet. Null when they used the form. */
  rawDescription: string | null;
  /** >1 when the sub split one form line across two rows; the cell sums them. */
  lineCount: number;
  /** A lump-sum column prices nothing per line; the cell says so instead of "—". */
  isLumpSumColumn: boolean;
  plugReason: string | null;
}

export interface LevelingRow {
  formLine: LevelFormLine;
  cells: LevelingCell[];
  lowCents: number | null;
  /** One sub priced it, another excluded or skipped it. The real cause of bad awards. */
  scopeGap: boolean;
}

export interface LevelingColumn {
  bid: LevelBid;
  isLumpSum: boolean;
  /** Priced base cells (mapped) + free-form rows the sub added. */
  baseCents: number;
  mappedBaseCents: number;
  unmappedExtraCents: number;
  alternatesCents: number;
  plugCents: number;
  /** normalize + scope_add adjustments applying to this column. */
  adjustmentCents: number;
  adjustedTotalCents: number;
  /** 0…1 of the adjusted total that is GC-supplied plug money. */
  plugShare: number;
  plugHeavy: boolean;
  unmappedCount: number;
  /** Base form lines this bid neither priced nor had plugged. */
  gapFormLineIds: string[];
  complete: boolean;
  isApparentLow: boolean;
}

export type ScopeState = "included" | "excluded" | "unstated";

export interface MatrixRow {
  key: string;
  label: string;
  /** Aligned to `columns`. */
  states: ScopeState[];
  scopeGap: boolean;
}

export interface TrayItem {
  bidId: string;
  subName: string;
  bidLineId: string;
  rawDescription: string;
  amountCents: number | null;
}

export interface LevelingGrid {
  columns: LevelingColumn[];
  rows: LevelingRow[];
  alternateRows: LevelingRow[];
  matrix: MatrixRow[];
  tray: TrayItem[];
  apparentLow: { bidId: string; subName: string; adjustedTotalCents: number } | null;
  /** True when no column covers the whole scope, so the low is a best guess. */
  apparentLowProvisional: boolean;
  /** High minus low across the compared columns — the number that starts arguments. */
  spreadCents: number | null;
  scopeGapCount: number;
}

export const DEFAULT_PLUG_SHARE_FLAG = 0.3;

/* ------------------------------------------------------------------ engine --- */

export function buildLevelingGrid(input: LevelingInput): LevelingGrid {
  const plugFlag = input.plugShareFlag ?? DEFAULT_PLUG_SHARE_FLAG;
  const formLines = [...input.formLines].sort((a, b) => a.sort - b.sort || cmp(a.id, b.id));
  const baseLines = formLines.filter((f) => !f.isAlternate);
  const altLines = formLines.filter((f) => f.isAlternate);
  const bids = [...input.bids].sort(
    (a, b) => timeOf(a.submittedAt) - timeOf(b.submittedAt) || cmp(a.subName, b.subName),
  );

  // Plugs are indexed by (bid, form line). A plug with no form line is a
  // column-level allowance and is indexed under the empty key.
  const plugs = new Map<string, { cents: number; reasons: string[] }>();
  const columnAdjustments = new Map<string, number>();
  for (const adj of input.adjustments) {
    const targets = adj.bidId ? [adj.bidId] : bids.map((b) => b.id);
    for (const bidId of targets) {
      if (adj.kind === "plug") {
        const key = `${bidId}::${adj.bidFormLineId ?? ""}`;
        const prev = plugs.get(key) ?? { cents: 0, reasons: [] };
        plugs.set(key, { cents: prev.cents + adj.amountCents, reasons: [...prev.reasons, adj.reason] });
      } else {
        columnAdjustments.set(bidId, (columnAdjustments.get(bidId) ?? 0) + adj.amountCents);
      }
    }
  }

  /* --- cells ------------------------------------------------------------- */

  const cellsFor = (formLine: LevelFormLine): LevelingCell[] =>
    bids.map((bid) => cellFor(bid, formLine, plugs));

  const rawRows: LevelingRow[] = baseLines.map((formLine) => ({
    formLine,
    cells: cellsFor(formLine),
    lowCents: null,
    scopeGap: false,
  }));
  const rawAltRows: LevelingRow[] = altLines.map((formLine) => ({
    formLine,
    cells: cellsFor(formLine),
    lowCents: null,
    scopeGap: false,
  }));

  for (const row of [...rawRows, ...rawAltRows]) markLowAndGap(row);

  /* --- columns ----------------------------------------------------------- */

  const cellIndex = new Map<string, LevelingCell>();
  for (const row of [...rawRows, ...rawAltRows]) {
    for (const cell of row.cells) cellIndex.set(`${cell.bidId}::${cell.bidFormLineId}`, cell);
  }

  const columns: LevelingColumn[] = bids.map((bid) => {
    const isLumpSum = bid.kind === "lump_sum";

    let mappedBaseCents = 0;
    const gapFormLineIds: string[] = [];
    for (const line of baseLines) {
      const cell = cellIndex.get(`${bid.id}::${line.id}`)!;
      if (cell.kind === "priced") mappedBaseCents += cell.amountCents ?? 0;
      else if (!isLumpSum && cell.kind !== "plug" && cell.kind !== "included_elsewhere") {
        gapFormLineIds.push(line.id);
      }
    }

    let alternatesCents = 0;
    for (const line of altLines) {
      const cell = cellIndex.get(`${bid.id}::${line.id}`)!;
      if (cell.kind === "priced") alternatesCents += cell.amountCents ?? 0;
    }

    const unmapped = bid.lines.filter((l) => l.bidFormLineId === null && l.state === "priced");
    const unmappedExtraCents = unmapped.reduce((sum, l) => sum + (l.amountCents ?? 0), 0);
    const unmappedCount = bid.lines.filter((l) => l.bidFormLineId === null).length;

    // A lump sum prices the whole scope in one number; itemized bids are the sum
    // of what they wrote, mapped or not.
    const baseCents = isLumpSum
      ? bid.submittedTotalCents
      : mappedBaseCents + unmappedExtraCents;

    let plugCents = plugs.get(`${bid.id}::`)?.cents ?? 0;
    for (const line of baseLines) {
      const cell = cellIndex.get(`${bid.id}::${line.id}`)!;
      if (cell.kind === "plug") plugCents += cell.amountCents ?? 0;
    }

    const adjustmentCents = columnAdjustments.get(bid.id) ?? 0;
    const adjustedTotalCents = baseCents + plugCents + adjustmentCents;
    const plugShare =
      adjustedTotalCents > 0 ? Math.abs(plugCents) / adjustedTotalCents : plugCents !== 0 ? 1 : 0;

    return {
      bid,
      isLumpSum,
      baseCents,
      mappedBaseCents: isLumpSum ? bid.submittedTotalCents : mappedBaseCents,
      unmappedExtraCents: isLumpSum ? 0 : unmappedExtraCents,
      alternatesCents,
      plugCents,
      adjustmentCents,
      adjustedTotalCents,
      plugShare,
      plugHeavy: plugShare > plugFlag,
      unmappedCount,
      gapFormLineIds,
      complete: gapFormLineIds.length === 0,
      isApparentLow: false,
    };
  });

  /* --- apparent low ------------------------------------------------------ */

  const priced = columns.filter((c) => c.adjustedTotalCents > 0);
  const covered = priced.filter((c) => c.complete);
  const pool = covered.length > 0 ? covered : priced;
  const apparentLowProvisional = covered.length === 0 && priced.length > 0;

  let lowColumn: LevelingColumn | null = null;
  for (const col of pool) {
    if (!lowColumn || col.adjustedTotalCents < lowColumn.adjustedTotalCents) lowColumn = col;
  }
  if (lowColumn) lowColumn.isApparentLow = true;

  const spreadCents =
    pool.length > 1
      ? Math.max(...pool.map((c) => c.adjustedTotalCents)) -
        Math.min(...pool.map((c) => c.adjustedTotalCents))
      : null;

  /* --- inclusion / exclusion matrix ------------------------------------- */

  const matrix = buildMatrix(bids);

  /* --- needs-mapping tray ----------------------------------------------- */

  const tray: TrayItem[] = [];
  for (const bid of bids) {
    for (const line of bid.lines) {
      if (line.bidFormLineId !== null) continue;
      tray.push({
        bidId: bid.id,
        subName: bid.subName,
        bidLineId: line.id,
        rawDescription: line.rawDescription,
        amountCents: line.amountCents,
      });
    }
  }

  const scopeGapCount =
    rawRows.filter((r) => r.scopeGap).length + matrix.filter((m) => m.scopeGap).length;

  return {
    columns,
    rows: rawRows,
    alternateRows: rawAltRows,
    matrix,
    tray,
    apparentLow: lowColumn
      ? {
          bidId: lowColumn.bid.id,
          subName: lowColumn.bid.subName,
          adjustedTotalCents: lowColumn.adjustedTotalCents,
        }
      : null,
    apparentLowProvisional,
    spreadCents,
    scopeGapCount,
  };
}

/* ------------------------------------------------------------- internals --- */

function cellFor(
  bid: LevelBid,
  formLine: LevelFormLine,
  plugs: Map<string, { cents: number; reasons: string[] }>,
): LevelingCell {
  const isLumpSum = bid.kind === "lump_sum";
  const lines = isLumpSum ? [] : bid.lines.filter((l) => l.bidFormLineId === formLine.id);
  const pricedLines = lines.filter((l) => l.state === "priced" && l.amountCents !== null);

  let declared: Exclude<CellKind, "plug">;
  let amountCents: number | null = null;
  if (pricedLines.length > 0) {
    declared = "priced";
    amountCents = pricedLines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0);
  } else if (lines.some((l) => l.state === "excluded")) {
    declared = "excluded";
  } else if (lines.some((l) => l.state === "included_elsewhere")) {
    declared = "included_elsewhere";
  } else {
    declared = "missing";
  }

  const plug = plugs.get(`${bid.id}::${formLine.id}`);
  // Rule 2: a plug fills a hole. It is never applied over real money, so a later
  // revision that prices the line silently retires the plug.
  const usePlug = declared !== "priced" && plug !== undefined;

  return {
    bidId: bid.id,
    bidFormLineId: formLine.id,
    kind: usePlug ? "plug" : declared,
    declared,
    amountCents: usePlug ? plug!.cents : amountCents,
    isLow: false,
    rawDescription: lines[0]?.rawDescription ?? null,
    lineCount: lines.length,
    isLumpSumColumn: isLumpSum,
    plugReason: usePlug ? plug!.reasons.join("; ") : null,
  };
}

function markLowAndGap(row: LevelingRow): void {
  let low: number | null = null;
  for (const cell of row.cells) {
    // Rule 3: only real, sub-written money competes for the low.
    if (cell.kind !== "priced" || cell.amountCents === null) continue;
    if (low === null || cell.amountCents < low) low = cell.amountCents;
  }
  row.lowCents = low;
  if (low !== null) {
    for (const cell of row.cells) {
      if (cell.kind === "priced" && cell.amountCents === low) cell.isLow = true;
    }
  }

  const itemized = row.cells.filter((c) => !c.isLumpSumColumn);
  const anyPriced = itemized.some((c) => c.declared === "priced");
  const anyMissing = itemized.some((c) => c.declared === "excluded" || c.declared === "missing");
  row.scopeGap = anyPriced && anyMissing;
}

function buildMatrix(bids: LevelBid[]): MatrixRow[] {
  interface Entry {
    labels: Map<string, number>;
    firstSeen: number;
    states: Map<string, ScopeState>;
  }
  const entries = new Map<string, Entry>();
  let order = 0;

  const note = (raw: string, bidId: string, state: "included" | "excluded") => {
    const label = raw.trim();
    if (!label) return;
    const key = scopeKey(label);
    if (!key) return;
    let entry = entries.get(key);
    if (!entry) {
      entry = { labels: new Map(), firstSeen: order++, states: new Map() };
      entries.set(key, entry);
    }
    entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
    // A sub who lists the same item as both included and excluded is read the
    // cautious way: excluded. The estimator sees a scope gap and asks.
    if (state === "excluded" || !entry.states.has(bidId)) entry.states.set(bidId, state);
  };

  // Declared chips only. A form line a sub struck out is already a red row in the
  // grid; folding it in here would duplicate it under a slightly different
  // wording ("Fire alarm" and "Fire alarm rough-in" are two matrix rows, one
  // scope item) and make the matrix noisier than the thing it explains.
  for (const bid of bids) {
    for (const raw of bid.inclusions) note(raw, bid.id, "included");
    for (const raw of bid.exclusions) note(raw, bid.id, "excluded");
  }

  const rows: MatrixRow[] = [];
  for (const [key, entry] of entries) {
    const label = [...entry.labels.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0][0];
    const states = bids.map((b) => entry.states.get(b.id) ?? "unstated");
    rows.push({
      key,
      label,
      states,
      scopeGap: states.includes("included") && states.includes("excluded"),
    });
  }

  return rows.sort(
    (a, b) => Number(b.scopeGap) - Number(a.scopeGap) || cmp(a.label.toLowerCase(), b.label.toLowerCase()),
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function timeOf(d: Date | null): number {
  return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
}

/* --------------------------------------------------------------- helpers --- */

/**
 * The one-line summary above the grid on mobile:
 * `LOW: MERIDIAN ELECTRIC · $184,200`.
 */
export function lowStrip(grid: LevelingGrid): string {
  if (!grid.apparentLow) return "NO BIDS IN YET";
  const cents = grid.apparentLow.adjustedTotalCents;
  const whole = Math.round(cents / 100).toLocaleString("en-US");
  return `LOW: ${grid.apparentLow.subName.toUpperCase()} · $${whole}`;
}

/** Everything the award confirm screen has to warn about before it commits. */
export interface AwardFlags {
  unmappedLines: number;
  scopeGaps: number;
  plugHeavyColumns: string[];
  /** The chosen bid is not the apparent low — the estimator must say why. */
  notApparentLow: boolean;
  provisionalLow: boolean;
}

export function awardFlags(grid: LevelingGrid, bidId: string): AwardFlags {
  const column = grid.columns.find((c) => c.bid.id === bidId) ?? null;
  return {
    unmappedLines: grid.tray.length,
    scopeGaps: grid.scopeGapCount,
    plugHeavyColumns: grid.columns.filter((c) => c.plugHeavy).map((c) => c.bid.subName),
    notApparentLow: Boolean(grid.apparentLow && grid.apparentLow.bidId !== bidId) || column === null,
    provisionalLow: grid.apparentLowProvisional,
  };
}
