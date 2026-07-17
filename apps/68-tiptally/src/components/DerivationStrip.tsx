/**
 * DerivationStrip — the signature element (DESIGN.md).
 *
 * The receipt block: employee line, derivation steps each on a ruled
 * mono line, the double-ruled total in till green. Renders in the
 * console, the staff page, dispute views, and the landing device —
 * one source of truth, four surfaces.
 *
 * TODO: props { employeeName, steps, amountCents }; paper-unfold
 * expand (180ms); the tally count-up on close; reduced-motion
 * instant.
 */

export interface DerivationStripProps {
  employeeName: string;
  steps: Array<{ label: string; expression: string; valueCents?: number }>;
  amountCents: number;
}

export function DerivationStrip(props: DerivationStripProps) {
  void props;
  return <div className="derivation">Not implemented</div>;
}
