/**
 * UnitMap — the yard, drawn.
 *
 * The grid of units from map_position with status fills; the
 * door-flip wipe (160ms top-to-bottom) on status change; hover/tap
 * cards with tenant + balance; editor mode drags positions.
 *
 * TODO: props { units, onSelect, editable? }; CSS grid layout from
 * positions; flip keyframes; reduced-motion instant fills.
 */

"use client";

export interface MapUnit {
  id: string;
  label: string;
  size: string;
  status: "vacant" | "occupied" | "overdue" | "lien" | "maintenance";
  position: { row: number; col: number; w: number; h: number };
}

export function UnitMap({ units }: { units: MapUnit[] }) {
  void units;
  return <div className="unitmap">Not implemented</div>;
}
