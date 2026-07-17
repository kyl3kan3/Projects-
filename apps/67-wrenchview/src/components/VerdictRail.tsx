/**
 * VerdictRail — the signature element (DESIGN.md).
 *
 * Three 64px stops (green/yellow/red); tapping fills and collapses
 * the rail to the chosen stop with the photo count beside it; red
 * pulses once. Compressed mode renders the board summary (2R 3Y 20G).
 * Same element in the bay, the board, and the landing device.
 *
 * TODO: props { verdict, onSelect, compact?, counts? }; snap
 * keyframes; the one red pulse; reduced-motion instant.
 */

"use client";

export interface VerdictRailProps {
  verdict: "green" | "yellow" | "red" | "na" | null;
  onSelect?: (verdict: "green" | "yellow" | "red" | "na") => void;
  compact?: boolean;
  counts?: { red: number; yellow: number; green: number };
}

export function VerdictRail(props: VerdictRailProps) {
  void props;
  return <div className="rail">Not implemented</div>;
}
