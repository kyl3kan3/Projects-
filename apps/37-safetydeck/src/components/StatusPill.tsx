/**
 * The status pill from DESIGN.md: 28px tall, a 6px dot and an 11px label.
 * Semantic colour only — green signed/valid, orange expiring/missed, red
 * expired/recordable. The hardhat accent never appears here; it is brand, not
 * meaning.
 */

export type PillTone = "green" | "orange" | "red" | "faint";

export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
