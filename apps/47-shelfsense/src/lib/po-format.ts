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

