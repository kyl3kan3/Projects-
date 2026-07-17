/**
 * src/components/StatusPill.tsx
 *
 * Status pill (DESIGN.md "Status pill"): height 28, 6px dot + Label(11).
 * Semantic colors carry state only -- never the accent.
 *
 * Mapping:
 *  - green  "READY" / "RESTOCKED"
 *  - amber  "IN PROGRESS" / "LOW"
 *  - red    "BLOCKED" / "DAMAGE"
 *  - ink-3  "SCHEDULED"
 *
 * TODO:
 * - [ ] Render dot + uppercase label at the Label type role
 *       (11/600/+0.08em); tone from the variant map above.
 * - [ ] States are always text + pill -- nothing is motion- or
 *       color-only (reduced-motion and contrast safe).
 */

export type PillTone = "green" | "amber" | "red" | "muted";

export interface StatusPillProps {
  tone: PillTone;
  label: string;
}

export function StatusPill(_props: StatusPillProps) {
  throw new Error("Not implemented");
}
