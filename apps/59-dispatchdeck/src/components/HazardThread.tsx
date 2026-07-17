/**
 * HazardThread — the signature element (DESIGN.md).
 *
 * A continuous 2px hazard line down the left of a stop list, advancing
 * past each stamped stop; the same component renders in the cab card,
 * the load detail, and the landing device.
 *
 * TODO:
 * - [ ] Props: stops (with stamps), compact mode for board rows.
 * - [ ] Extension animation 160ms ease-out-quart on new stamps;
 *       prefers-reduced-motion renders final state.
 * - [ ] Detention register: the segment at an arrived-overdue stop
 *       renders the clock chip inline.
 */

export interface ThreadStop {
  seq: number;
  kind: "pickup" | "delivery";
  city: string;
  state: string;
  arrivedAt: string | null;
  departedAt: string | null;
}

export function HazardThread({ stops }: { stops: ThreadStop[] }) {
  void stops;
  return <div className="thread">Not implemented</div>;
}
