/**
 * PO formatting and validation — the pure half of lib/po.
 *
 * Split out from lib/po.ts because nothing here touches the database, which makes it
 * unit-testable on its own and keeps the CSV renderer out of anything that would drag
 * `postgres` into a bundle it has no business being in.
 *
 * The CSV is the artefact the supplier actually reads, so its formatting is a feature:
 *
 *  - a UTF-8 BOM, because without it Excel on Windows renders an accented product name
 *    as mojibake and a supplier who cannot read the SKU column does not ship the order;
 *  - CRLF endings, for the same audience;
 *  - quantities that clear the MOQ *and* land on a whole pack, rounded up, because a PO
 *    that violates the supplier's minimum costs a whole lead time.
 */

import type { PoDraft, PoDraftLine, Supplier } from "@/db/schema";
import { moneyExact } from "@/lib/format";
import { roundToOrderable } from "@/lib/reorder";

/** The unit cost used on a PO line: the real cost, or a flagged estimate. */
export function lineUnitCost(row: { costCents: number | null; priceCents: number }): {
  cents: number;
  estimated: boolean;
} {
  if (row.costCents !== null && row.costCents > 0) {
    return { cents: row.costCents, estimated: false };
  }
  return { cents: Math.round(row.priceCents * 0.5), estimated: true };
}

/* ------------------------------------------------------------ validation --- */

export interface LineValidation {
  ok: boolean;
  messages: string[];
  /** The quantity that would actually be accepted. */
  corrected: number;
}

/**
 * Check one edited quantity against the supplier's rules.
 *
 * Returns messages rather than throwing because the merchant is mid-edit: the
 * field says "144 is the next whole pack" while they type, and only the send is
 * blocked outright.
 */
export function validateLine(input: {
  finalQty: number;
  moq: number;
  packSize: number;
}): LineValidation {
  const messages: string[] = [];
  const qty = Math.floor(input.finalQty);
  const pack = Math.max(1, Math.floor(input.packSize || 1));
  const moq = Math.max(0, Math.floor(input.moq || 0));

  if (!Number.isFinite(qty) || qty < 0) {
    return { ok: false, messages: ["Quantity must be a whole number of units."], corrected: 0 };
  }
  if (qty === 0) {
    return { ok: true, messages: ["Zero — this line will be dropped from the PO."], corrected: 0 };
  }
  if (qty < moq) messages.push(`Below the ${moq}-unit minimum for this supplier.`);
  if (qty % pack !== 0) messages.push(`Not a whole number of ${pack}-unit packs.`);

  const corrected = roundToOrderable(qty, moq, pack);
  if (corrected !== qty) messages.push(`Nearest acceptable quantity is ${corrected}.`);
  return { ok: messages.length === 0, messages, corrected };
}

export interface DraftValidation {
  ok: boolean;
  /** Blocking problems. */
  errors: string[];
  /** Things the merchant should know but may proceed past. */
  warnings: string[];
}

export function validateDraft(args: {
  draft: PoDraft;
  lines: PoDraftLine[];
  supplier: Supplier | null;
  variantRules: Map<string, { moq: number; packSize: number }>;
}): DraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const live = args.lines.filter((line) => line.finalQty > 0);

  if (!live.length) errors.push("This PO has no quantities on it yet.");
  if (!args.supplier) {
    errors.push("These SKUs have no supplier assigned, so there is nowhere to send the PO.");
  } else if (!args.supplier.email) {
    errors.push(`${args.supplier.name} has no email address on file.`);
  }

  for (const line of live) {
    const rules = args.variantRules.get(line.variantId);
    if (!rules) continue;
    const check = validateLine({
      finalQty: line.finalQty,
      moq: rules.moq,
      packSize: rules.packSize,
    });
    for (const message of check.messages) warnings.push(`${line.sku}: ${message}`);
  }

  const total = live.reduce((sum, line) => sum + line.finalQty * line.unitCostCents, 0);
  if (args.supplier && args.supplier.minOrderValueCents > total) {
    warnings.push(
      `Order value ${moneyExact(total)} is below ${args.supplier.name}'s ${moneyExact(args.supplier.minOrderValueCents)} minimum.`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* -------------------------------------------------------------------- CSV --- */

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The PO as CSV. Stable column order, one row per line, a totals row at the end,
 * CRLF line endings and a BOM so Excel opens it as UTF-8 without being asked.
 */
export function renderCsv(args: {
  draft: PoDraft;
  lines: PoDraftLine[];
  shopName: string;
  shopDomain: string;
  today: string;
}): string {
  const rows: (string | number)[][] = [
    ["Purchase order", args.draft.supplierName],
    ["From", args.shopName],
    ["Store", args.shopDomain],
    ["Date", args.today],
    ["Lead time (days)", args.draft.leadTimeDays],
    [],
    ["SKU", "Product", "Quantity", "Unit cost", "Line total"],
  ];

  const live = args.lines.filter((line) => line.finalQty > 0);
  for (const line of live) {
    rows.push([
      line.sku,
      line.title,
      line.finalQty,
      (line.unitCostCents / 100).toFixed(2),
      ((line.finalQty * line.unitCostCents) / 100).toFixed(2),
    ]);
  }
  const total = live.reduce((sum, line) => sum + line.finalQty * line.unitCostCents, 0);
  const units = live.reduce((sum, line) => sum + line.finalQty, 0);
  rows.push([]);
  rows.push(["Total", "", units, "", (total / 100).toFixed(2)]);

  // BOM first: Excel on Windows guesses the encoding otherwise and mangles
  // anything non-ASCII in a product title.
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function csvFilename(draft: PoDraft, today: string): string {
  const slug =
    draft.supplierName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "purchase-order";
  return `shelfsense-po-${slug}-${today}.csv`;
}


/* ------------------------------------------------------------- grouping --- */

/** What the grouper needs from a reorder row. A subset of views.SkuRow. */
export interface GroupableRow {
  variantId: string;
  sku: string;
  displayTitle: string;
  status: "order_now" | "order_soon" | "healthy" | "overstocked" | "dead";
  reorderQty: number;
  moq: number;
  packSize: number;
  costCents: number | null;
  priceCents: number;
  supplierId: string | null;
  /** Lead time the forecast used, for a group with no supplier on file. */
  leadTimeDays: number;
  snoozedUntil: Date | null;
}

export interface SupplierRules {
  id: string;
  name: string;
  leadTimeDays: number;
  minOrderValueCents: number;
}

export interface PurchaseLine {
  variantId: string;
  sku: string;
  title: string;
  qty: number;
  unitCostCents: number;
  lineTotalCents: number;
  /** True when the unit cost is half-retail because no cost is on file. */
  costEstimated: boolean;
}

export interface PurchaseGroup {
  supplierId: string | null;
  supplierName: string;
  leadTimeDays: number;
  minOrderValueCents: number;
  lines: PurchaseLine[];
  totalCents: number;
  /** The order does not reach this supplier's minimum. A warning, not a block. */
  belowMinimum: boolean;
}

export interface GroupPurchaseResult {
  groups: PurchaseGroup[];
  /** Rows that need ordering but are covered by a PO already sent or dismissed. */
  suppressedCount: number;
  /** Rows the merchant has snoozed. */
  snoozedCount: number;
  /** Rows that need ordering with no supplier on file. */
  unassignedCount: number;
}

/** The bucket for SKUs that need ordering from nobody in particular. */
export const UNASSIGNED_SUPPLIER_NAME = "No supplier assigned";

/**
 * Group the SKUs that need ordering into one purchase order per supplier.
 *
 * The interesting case is the shared supplier: four SKUs on a 34-day sea-freight
 * account belong on **one** PO, not four, because the merchant places one order and
 * the supplier's minimum applies to the order rather than the line. Getting this
 * wrong produces four POs that each miss a £1,200 minimum, and a merchant who goes
 * back to the spreadsheet.
 *
 * Rows with no supplier are grouped together rather than dropped — "four SKUs need
 * ordering and I do not know from whom" is information, and quietly omitting them is
 * how a stockout gets missed. Snoozed and suppressed rows are excluded and *counted*,
 * so the screen can say why a SKU it just flagged is not on a PO.
 *
 * Pure: no database, no clock beyond the `now` it is handed. The persistence lives in
 * lib/po.ts.
 */
export function groupForPurchase(args: {
  rows: GroupableRow[];
  suppliers: SupplierRules[];
  suppressedVariantIds?: ReadonlySet<string>;
  now?: Date;
  defaultLeadTimeDays?: number;
}): GroupPurchaseResult {
  const suppressed = args.suppressedVariantIds ?? new Set<string>();
  const now = args.now ?? new Date();
  const supplierById = new Map(args.suppliers.map((s) => [s.id, s]));

  const needsOrdering = args.rows.filter(
    (row) => (row.status === "order_now" || row.status === "order_soon") && row.reorderQty > 0,
  );

  let suppressedCount = 0;
  let snoozedCount = 0;
  const eligible: GroupableRow[] = [];
  for (const row of needsOrdering) {
    if (row.snoozedUntil !== null && row.snoozedUntil > now) {
      snoozedCount += 1;
      continue;
    }
    if (suppressed.has(row.variantId)) {
      suppressedCount += 1;
      continue;
    }
    eligible.push(row);
  }

  const buckets = new Map<string, GroupableRow[]>();
  for (const row of eligible) {
    const key = row.supplierId ?? "";
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const groups: PurchaseGroup[] = [];
  for (const [key, rows] of buckets) {
    const supplier = key ? (supplierById.get(key) ?? null) : null;
    const lines: PurchaseLine[] = rows
      .slice()
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((row) => {
        const cost = lineUnitCost(row);
        // Rounded up to the MOQ and then to a whole pack: a PO the supplier
        // rejects costs the entire lead time.
        const qty = roundToOrderable(row.reorderQty, row.moq, row.packSize);
        return {
          variantId: row.variantId,
          sku: row.sku,
          title: row.displayTitle,
          qty,
          unitCostCents: cost.cents,
          lineTotalCents: qty * cost.cents,
          costEstimated: cost.estimated,
        };
      });

    const totalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
    const minOrderValueCents = supplier?.minOrderValueCents ?? 0;
    groups.push({
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? UNASSIGNED_SUPPLIER_NAME,
      leadTimeDays:
        supplier?.leadTimeDays ?? rows[0]?.leadTimeDays ?? args.defaultLeadTimeDays ?? 14,
      minOrderValueCents,
      lines,
      totalCents,
      belowMinimum: minOrderValueCents > 0 && totalCents < minOrderValueCents,
    });
  }

  // Named suppliers first, alphabetically; the unassigned bucket last, because it is
  // a data-quality task rather than a purchase order.
  groups.sort((a, b) => {
    if (a.supplierId === null) return 1;
    if (b.supplierId === null) return -1;
    return a.supplierName.localeCompare(b.supplierName);
  });

  return {
    groups,
    suppressedCount,
    snoozedCount,
    unassignedCount: eligible.filter((row) => row.supplierId === null).length,
  };
}
