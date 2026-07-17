/**
 * DealLine — the signature element (DESIGN.md).
 *
 * One horizontal ruled line: date nodes (met = cedar fill, upcoming =
 * ink outline, at-risk = keybox), the keybox today marker, mono labels
 * beneath. Preview mode ghosts moving nodes at 40% with connectors.
 * Rendered in the pipeline, the deal file, the portal miniature, and
 * the landing device.
 *
 * TODO: props { dates, today, preview? }; unfurl stagger on mount;
 * ghost-slide in preview; reduced-motion final states.
 */

export interface DealLineDate {
  key: string;
  label: string;
  dueOn: string;
  status: "upcoming" | "met" | "missed" | "waived";
  previewDueOn?: string;
}

export function DealLine({ dates, today }: { dates: DealLineDate[]; today: string }) {
  void dates;
  void today;
  return <div className="dealline">Not implemented</div>;
}
