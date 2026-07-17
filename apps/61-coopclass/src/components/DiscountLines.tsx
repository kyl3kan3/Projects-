/**
 * DiscountLines — the calculator, retired (README feature 5).
 *
 * The invoice's line-by-line math: fees, materials, each discount
 * named with its rule ("Sibling discount — Mia (2nd child): -$12.00"),
 * the family cap as a final named line. No mystery totals, ever.
 *
 * TODO: props from pricing.buildInvoice; discount lines in moss;
 * running total in Plex Mono; print-friendly.
 */

export interface DiscountLinesProps {
  lines: Array<{ label: string; amountCents: number; kind: "fee" | "materials" | "discount" }>;
  totalCents: number;
}

export function DiscountLines(props: DiscountLinesProps) {
  void props;
  return <div className="rowlist">Not implemented</div>;
}
