/**
 * LienRail — the signature element (DESIGN.md).
 *
 * The vertical rail of statutory steps: completed nodes filled ink
 * with dates, the current step outlined rolldoor, future steps locked
 * with the hard-stop sentence in liencard ("Sale eligible June 28 —
 * not before — Tex. Prop. Code §59.044"). The disabled button is part
 * of the design. Rendered in the lien case, the unit file, and the
 * landing device.
 *
 * TODO: props from lien.timeline; node fill + date stamp (140ms);
 * reduced-motion instant.
 */

export interface LienRailProps {
  steps: Array<{
    key: string;
    label: string;
    citation: string;
    dueOn: string;
    completedOn: string | null;
    locked: boolean;
    lockSentence: string | null;
  }>;
}

export function LienRail(props: LienRailProps) {
  void props;
  return <div className="lienrail">Not implemented</div>;
}
