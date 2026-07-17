/**
 * src/components/PositionLadder.tsx
 *
 * The per-SKU position ladder (DESIGN.md "Position ladder"). One
 * hairline row per seller sorted by price; YOUR row carries the 2px
 * ticker left rail.
 *
 * TODO:
 * - [ ] Rows: label, mono price, mono delta-to-you right; your row's
 *       price in ticker; stock-outs render ink-3 struck prices with
 *       "out of stock" (listed, unranked).
 * - [ ] Provenance line under every rival price (Secondary mono, ink-3):
 *       "$84.99 · structured · 22 min ago"; warning/blocked pages swap
 *       in the amber/red status note.
 * - [ ] The marker slide (overnight reveal beat 3): your row animates to
 *       its new rung with spring-gentle <=300ms; reduced motion snaps.
 * - [ ] card ground, radius 12, padding 16, hairline dividers; no
 *       shadows, no zebra striping.
 */

export interface LadderRow {
  label: string;
  priceCents: number | null;
  inStock: boolean | null;
  isYou: boolean;
  provenance: string | null; // "structured · 22 min ago"
  statusNote: string | null; // "blocked since Tue" (warning/blocked)
}

export interface PositionLadderProps {
  rows: LadderRow[];
  rank: number | null;
  of: number;
  currency: string;
}

export function PositionLadder(_props: PositionLadderProps) {
  throw new Error("Not implemented");
}
