/**
 * The signage chip. Height 24, radius 10, 1px accent border at 60%, Label type,
 * never filled (DESIGN.md). Amber for AWAITING YOU, green for APPROVED, ink-2 for
 * IN PROGRESS — semantic colour only, never decoration.
 */
export function SignageChip({
  children,
  tone = "neutral",
  index,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "amber" | "green" | "accent";
  /** Stagger position for the arrival choreography (80ms per chip). */
  index?: number;
}) {
  return (
    <span
      className={`chip${index === undefined ? "" : " chip-light"}`}
      data-tone={tone === "neutral" ? undefined : tone}
      style={index === undefined ? undefined : ({ "--i": index } as React.CSSProperties)}
    >
      {children}
    </span>
  );
}
