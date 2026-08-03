/**
 * The pure facts about a unit: the sizes a facility rents, how big they are, where
 * a door sits on the map, and what each status is called.
 *
 * This module exists separately from `lib/units.ts` for one reason: the map editor
 * and the unit form are client components and they need the size list. Importing it
 * from `lib/units.ts` — which reaches the database client — pulls `postgres`, `net`
 * and `tls` into the browser bundle and fails the build outright. It did, once. The
 * split is the fix, and `tools/craft-check.mjs` now fails if it comes back.
 */

export const UNIT_SIZES = ["5x5", "5x10", "10x10", "10x15", "10x20", "10x30"] as const;

export type UnitSize = (typeof UNIT_SIZES)[number];

/** Square feet, for the occupancy-by-size table and the street-rate sheet. */
export function squareFeet(size: string): number {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim());
  if (!m) return 0;
  return Number(m[1]) * Number(m[2]);
}

export interface MapPosition {
  row: number;
  col: number;
  w: number;
  h: number;
}

/** `map_position` is jsonb, so it can be anything by the time it comes back. */
export function readPosition(value: unknown): MapPosition {
  const p = (value ?? {}) as Partial<MapPosition>;
  return {
    row: Number.isFinite(p.row) ? Number(p.row) : 1,
    col: Number.isFinite(p.col) ? Number(p.col) : 1,
    w: Number.isFinite(p.w) && Number(p.w) > 0 ? Number(p.w) : 1,
    h: Number.isFinite(p.h) && Number(p.h) > 0 ? Number(p.h) : 1,
  };
}

export type UnitStatusName = "vacant" | "occupied" | "overdue" | "lien" | "maintenance";

export const STATUS_LABEL: Record<UnitStatusName, string> = {
  vacant: "Vacant",
  occupied: "Occupied",
  overdue: "Overdue",
  lien: "Lien",
  maintenance: "Maintenance",
};
