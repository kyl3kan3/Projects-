/**
 * The thread, compressed to a board row: a 2px rule with the hazard fill run out
 * to the load's position. Same element, same colour, same meaning as the
 * full-height thread on the cab card — which is the point of having a signature
 * detail rather than a decoration.
 */

export function ThreadGlyph({
  progress,
  label,
  width = 56,
}: {
  progress: number;
  label: string;
  width?: number;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <span
      className="inline-block relative align-middle"
      style={{ width, height: 2, background: "var(--line)", borderRadius: 999 }}
      role="img"
      aria-label={label}
    >
      <span
        className="absolute left-0 top-0"
        style={{
          width: `${clamped * 100}%`,
          height: 2,
          background: "var(--accent)",
          borderRadius: 999,
        }}
      />
    </span>
  );
}
