/**
 * The price book's field vocabulary — units, kinds, and their labels.
 *
 * This is a separate module from `price-book.ts` on purpose: the item form is a
 * client component and needs these lists, while `price-book.ts` reaches the
 * database client. Importing the latter from the browser pulls `postgres` into the
 * client bundle and the build fails on `net`, `tls` and `fs`. Pure things live here.
 */

import type { PriceBookItemKind, Unit } from "@/db/schema";

export const UNIT_LABELS: Record<Unit, string> = {
  each: "each",
  hour: "hour",
  sqft: "sq ft",
  lf: "linear ft",
  day: "day",
};

export const KIND_LABELS: Record<PriceBookItemKind, string> = {
  labor: "Labor",
  material: "Material",
  flat_rate: "Flat rate",
};

export const UNITS: Unit[] = ["each", "hour", "sqft", "lf", "day"];
export const KINDS: PriceBookItemKind[] = ["material", "labor", "flat_rate"];

/** name + description + category, lowercased — what lexical retrieval reads. */
export function searchTextFor(item: {
  name: string;
  description?: string | null;
  category: string;
}): string {
  return `${item.name} ${item.description ?? ""} ${item.category}`.toLowerCase().trim();
}

/** "02:14" — the walkthrough citation format on every drafted row. */
export function formatOffset(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * "2", "6 hrs", "2,200 sq ft" — the quantity as it reads in a row.
 *
 * `each` shows no unit at all (DESIGN.md's example row is "2 × $170.00"), and the
 * time units pluralise, because "6 hour" on a proposal reads like a typo to the
 * person being asked for six thousand dollars.
 */
export function quantityLabel(quantityMilli: number, unit: Unit): string {
  const quantity = (Math.round(quantityMilli) || 0) / 1000;
  const value = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(quantity);
  switch (unit) {
    case "each":
      return value;
    case "hour":
      return `${value} ${quantity === 1 ? "hr" : "hrs"}`;
    case "day":
      return `${value} ${quantity === 1 ? "day" : "days"}`;
    case "sqft":
      return `${value} sq ft`;
    case "lf":
      return `${value} lf`;
    default:
      return value;
  }
}
