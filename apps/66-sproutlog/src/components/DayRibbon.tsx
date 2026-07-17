/**
 * DayRibbon — the signature element (DESIGN.md).
 *
 * A thin horizontal ribbon of the child's day: arrival dot, meal
 * squares, the nap band (storytime 30% stretch), diaper ticks — in
 * chronological order. Rendered on child chips, the digest email
 * header, and the landing device.
 *
 * TODO: props { events }; mark settle 120ms; time-proportional
 * layout across the daycare day; reduced-motion instant.
 */

export interface RibbonEvent {
  kind: string;
  at: string;
  endAt?: string;
}

export function DayRibbon({ events }: { events: RibbonEvent[] }) {
  void events;
  return <div className="ribbon">Not implemented</div>;
}
