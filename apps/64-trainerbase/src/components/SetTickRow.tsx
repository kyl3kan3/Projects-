/**
 * SetTickRow — the signature element (DESIGN.md).
 *
 * A row of dashes (prescribed sets) converting to whistle ticks as
 * sets log; the rest arc starts from the newest tick. Rendered in the
 * client PWA, the dashboard's yesterday column, and the landing
 * device.
 *
 * TODO: props { sets, logged }; tick keyframes (120ms settle); arc as
 * SVG circle stroke-dashoffset; reduced-motion numeric countdown.
 */

"use client";

export interface SetTickRowProps {
  sets: number;
  logged: number;
  restSeconds: number | null;
}

export function SetTickRow(props: SetTickRowProps) {
  void props;
  return <div className="tickrow">Not implemented</div>;
}
