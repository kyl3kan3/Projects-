/**
 * ChalkGauge — the signature element (DESIGN.md).
 *
 * 4px track, canvas fill to booked/owned for the window, fraction
 * beside it in Plex Mono ("32/40"). Overbooked: the overrun segment
 * renders rust and the parent names the conflicting order. Rendered in
 * inventory rows, quote lines, and the landing device.
 *
 * TODO: props { booked, owned, requested? }; 180ms ease-out fill;
 * overbooked snap (no ease); reduced-motion final state.
 */

export interface ChalkGaugeProps {
  booked: number;
  owned: number;
  requested?: number;
}

export function ChalkGauge(props: ChalkGaugeProps) {
  void props;
  return <div className="gauge">Not implemented</div>;
}
