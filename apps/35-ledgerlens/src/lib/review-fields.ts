/**
 * Turning a loaded review sheet into the five field rows the UI draws.
 *
 * Pure, and shared by the document screen and the review queue, so a flagged field
 * looks and behaves identically wherever it is met. Kept out of the client component so
 * that component imports a type rather than the database layer.
 */

import type { Category, ReviewField } from "@/db/schema";
import { centsToDecimal, formatCents } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import type { ReviewSheet } from "@/lib/review";

export interface FieldModel {
  field: ReviewField;
  label: string;
  display: string;
  value: string;
  flagged: boolean;
  confidenceBp: number | null;
  evidence: string | null;
  kind: "text" | "date" | "amount" | "category";
}

const LABELS: Record<ReviewField, string> = {
  vendor: "Vendor",
  date: "Date",
  total: "Total",
  tax: "Tax",
  category: "Category",
};

export function buildFieldModels(sheet: ReviewSheet, categories: Category[]): FieldModel[] {
  const open = new Map(sheet.open.map((item) => [item.field, item]));
  const provenance = (sheet.extraction?.provenance ?? {}) as Record<string, string>;
  const line = sheet.lineItem;
  const currency = line?.currency ?? "USD";
  const category = sheet.category ?? null;

  const model = (
    field: ReviewField,
    display: string,
    value: string,
    kind: FieldModel["kind"],
  ): FieldModel => {
    const item = open.get(field);
    return {
      field,
      label: LABELS[field],
      display,
      value,
      flagged: Boolean(item),
      confidenceBp: item?.confidenceBp ?? null,
      evidence: provenance[field] ?? null,
      kind,
    };
  };

  const categoryDisplay = category
    ? `${category.name} · Schedule C ${category.scheduleCLine}`
    : "Not categorised";

  void categories;

  return [
    model("vendor", sheet.vendor?.displayName ?? "", sheet.vendor?.displayName ?? "", "text"),
    model(
      "date",
      line ? shortDate(line.docDate) : "",
      line?.docDate ?? "",
      "date",
    ),
    model(
      "total",
      line ? formatCents(line.amountCents, currency) : "",
      line ? centsToDecimal(line.amountCents) : "",
      "amount",
    ),
    model(
      "tax",
      line?.taxCents === null || line?.taxCents === undefined
        ? "None printed"
        : formatCents(line.taxCents, currency),
      line?.taxCents === null || line?.taxCents === undefined ? "" : centsToDecimal(line.taxCents),
      "amount",
    ),
    model("category", categoryDisplay, category?.slug ?? "", "category"),
  ];
}
