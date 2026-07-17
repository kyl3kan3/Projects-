/**
 * DeficiencyList — verdicts as sentences (DESIGN.md signature rule).
 *
 * Renders an evaluation's deficiencies verbatim, each on its own row
 * in claim red-brown, with the coverage line label as the placard.
 * Used in vendor detail, the dashboard drill-in, deficiency letters,
 * and the landing device.
 *
 * TODO: props { deficiencies: [{ line, reason }] }; 120ms slide-in
 * stagger; print-friendly.
 */

export interface DeficiencyListProps {
  deficiencies: Array<{ line: string; reason: string }>;
}

export function DeficiencyList(props: DeficiencyListProps) {
  void props;
  return <div className="rowlist">Not implemented</div>;
}
