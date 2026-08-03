/**
 * StatusPill — height 28, a 6px dot plus an 11px label (DESIGN.md).
 *
 * The word is always present. Nothing in this product is colour-only: a
 * red-green colourblind reader sees "NO-GO" and "GO" spelled out, and so does a
 * screenshot printed in grey.
 *
 * The dot uses DESIGN.md's palette value; the label uses the AA-measured `-text`
 * variant, because 11px semantic colour on the register ground fails contrast
 * (see the note in globals.css).
 */

export type PillTone = "ok" | "warn" | "bad" | "quiet" | "accent";

const TONES: Record<PillTone, { dot: string; text: string }> = {
  ok: { dot: "var(--color-green)", text: "var(--color-green-text)" },
  warn: { dot: "var(--color-amber)", text: "var(--color-amber-text)" },
  bad: { dot: "var(--color-red)", text: "var(--color-red)" },
  quiet: { dot: "var(--color-ink-3)", text: "var(--color-ink-3)" },
  accent: { dot: "var(--color-federal)", text: "var(--color-federal)" },
};

export function StatusPill({
  label,
  tone = "quiet",
  title,
}: {
  label: string;
  tone?: PillTone;
  title?: string;
}) {
  const { dot, text } = TONES[tone];
  return (
    <span className="pill" style={{ color: text }} title={title}>
      <span className="pill-dot" style={{ background: dot }} />
      {label}
    </span>
  );
}

/* ---- The product's fixed vocabulary, mapped once ---- */

export function stageTone(stage: string): PillTone {
  switch (stage) {
    case "won":
      return "ok";
    case "lost":
      return "bad";
    case "no_bid":
      return "quiet";
    case "submitted":
      return "accent";
    case "drafting":
      return "warn";
    default:
      return "quiet";
  }
}

export function verdictTone(verdict: string | null): PillTone {
  if (verdict === "go") return "ok";
  if (verdict === "conditional") return "warn";
  if (verdict === "no_go") return "bad";
  return "quiet";
}

export function sourceTone(status: string): PillTone {
  if (status === "ok") return "ok";
  if (status === "degraded") return "warn";
  return "bad";
}
