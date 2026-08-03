"use client";

/**
 * UnitMap — the yard, drawn.
 *
 * Rows of doors from `map_position`, filled by status. The fills *are* the status
 * system: vacant is outlined slab, occupied galvanised, overdue roll-door, lien
 * lien-card, maintenance a dashed outline. No badges, no legend needed to read it.
 *
 * Selecting a door reveals its detail line beneath the row rather than in a
 * floating card — a tooltip is unreachable on a phone, and this map has to work at
 * 390px. The whole grid scrolls inside its own container so the page body never
 * scrolls sideways.
 *
 * The door flip runs on exactly one unit: the one named by `flippedUnitId`, which
 * the console sets after an action that changed a status. It is a reaction to
 * something the owner just did, not ambient animation.
 */

import Link from "next/link";
import { useState } from "react";
import type { UnitStatus } from "@/db/schema";

export interface MapUnit {
  id: string;
  label: string;
  size: string;
  status: UnitStatus;
  position: { row: number; col: number; w: number; h: number };
  tenantName: string | null;
  balanceCents: number;
  daysLate: number;
  awaitingSignature: boolean;
}

const STATUS_WORD: Record<UnitStatus, string> = {
  vacant: "Vacant",
  occupied: "Occupied",
  overdue: "Overdue",
  lien: "Lien",
  maintenance: "Maintenance",
};

function money(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function UnitMap({
  units,
  flippedUnitId,
}: {
  units: MapUnit[];
  flippedUnitId?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const rows = new Map<number, MapUnit[]>();
  for (const unit of units) {
    const list = rows.get(unit.position.row);
    if (list) list.push(unit);
    else rows.set(unit.position.row, [unit]);
  }
  const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, list] of ordered) list.sort((a, b) => a.position.col - b.position.col);

  const chosen = units.find((u) => u.id === selected) ?? null;

  return (
    <div>
      <div className="map-wrap">
        {ordered.map(([rowNumber, rowUnits]) => (
          <div className="map-row" key={rowNumber}>
            <span className="map-row-label" aria-hidden="true">
              {rowNumber}
            </span>
            {rowUnits.map((unit) => (
              <button
                type="button"
                key={unit.id}
                className="door"
                data-status={unit.status}
                data-flip={unit.id === flippedUnitId ? "true" : undefined}
                style={unit.position.w > 1 ? { width: 72 * unit.position.w + 2 } : undefined}
                aria-pressed={selected === unit.id}
                aria-label={`Unit ${unit.label}, ${unit.size}, ${STATUS_WORD[unit.status]}${
                  unit.tenantName ? `, ${unit.tenantName}` : ""
                }`}
                onClick={() => setSelected(selected === unit.id ? null : unit.id)}
              >
                {unit.awaitingSignature ? <span className="door-notch" /> : null}
                <span className="door-label">{unit.label}</span>
                <span className="door-size">{unit.size}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="hairline-t" style={{ marginTop: 16, paddingTop: 12, minHeight: 92 }}>
        {chosen ? (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-mono-lg">
                {chosen.label} · {chosen.size}
              </p>
              <span className="placard" data-tone={toneFor(chosen.status)}>
                {STATUS_WORD[chosen.status]}
              </span>
            </div>
            <p className="t-secondary" style={{ marginTop: 4 }}>
              {chosen.tenantName ? chosen.tenantName : "No tenant — ready to rent"}
              {chosen.awaitingSignature ? " · lease not signed yet" : ""}
            </p>
            <p className="t-mono" style={{ marginTop: 4 }}>
              {chosen.status === "vacant"
                ? "Balance —"
                : `Balance ${money(chosen.balanceCents)}${chosen.daysLate > 0 ? ` · ${chosen.daysLate} days late` : ""}`}
            </p>
            <Link
              href={`/units/${chosen.id}`}
              className="btn btn-secondary"
              style={{ marginTop: 12 }}
            >
              Open the unit file
            </Link>
          </div>
        ) : (
          <p className="t-secondary">
            Tap a door to see its tenant, balance and file. Fills are the status:
            outlined is vacant, steel is occupied, orange is overdue, red-brown is a lien
            case, dashed is out for maintenance.
          </p>
        )}
      </div>
    </div>
  );
}

function toneFor(status: UnitStatus): string {
  if (status === "overdue") return "overdue";
  if (status === "lien") return "lien";
  if (status === "occupied") return "ink";
  return "dim";
}

/** The legend, for the header. Same fills, same order as the map reads. */
export function MapLegend({ counts }: { counts: Record<UnitStatus, number> }) {
  const items: Array<{ status: UnitStatus; swatch: string }> = [
    { status: "vacant", swatch: "var(--color-slab)" },
    { status: "occupied", swatch: "var(--color-galv)" },
    { status: "overdue", swatch: "var(--color-rolldoor-strong)" },
    { status: "lien", swatch: "var(--color-liencard)" },
    { status: "maintenance", swatch: "var(--color-line)" },
  ];
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.status} className="flex items-center gap-2">
          <span
            className="legend-swatch"
            style={{
              background: item.swatch,
              border: item.status === "vacant" ? "1px solid var(--color-line)" : undefined,
            }}
          />
          <span className="t-secondary">
            {STATUS_WORD[item.status]} {counts[item.status]}
          </span>
        </span>
      ))}
    </div>
  );
}
