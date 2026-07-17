/**
 * src/components/BoardTile.tsx
 *
 * One unit on the host board (DESIGN.md "Board tile"). The one sanctioned
 * card: everything inside is hairline rows.
 *
 * TODO:
 * - [ ] Layout: unit Title, next check-in mono right ("4:00 PM"),
 *       StatusPill, cleaner Secondary line ("Maria · window 11a–3p" in
 *       ink-3), feed-age line when stale ("calendar as of 12 min ago").
 * - [ ] The four-beat tile flip on completion: photo settles -> count
 *       ticks -> VERIFIED seal stamps (scale 1.15->1.0, ring 0->360° in
 *       240ms) -> amber-to-green crossfade with "ready by 4:00 PM ·
 *       2h 40m to spare". Reduced motion: direct state swap.
 * - [ ] Blocked/collision state renders the red pill + the reason line;
 *       tapping opens the turnover.
 * - [ ] card ground, radius 12, padding 16, hairline border; no shadows.
 */

export type TurnoverStatus =
  | "scheduled"
  | "in_progress"
  | "verified"
  | "blocked"
  | "cancelled";

export interface BoardTileProps {
  unitName: string;
  nextCheckinLabel: string | null;
  status: TurnoverStatus;
  cleanerLine: string | null;
  feedAgeLine: string | null;
  photoProgress: { taken: number; required: number } | null;
}

export function BoardTile(_props: BoardTileProps) {
  throw new Error("Not implemented");
}
