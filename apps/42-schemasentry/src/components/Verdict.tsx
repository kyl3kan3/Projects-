/**
 * The verdict stamp and the level marks.
 *
 * DESIGN.md is explicit that the stamp is NOT a card — it is the top of the diff
 * screen itself: a Label saying which pair is being compared, then the verdict
 * word in Display JBM in its colour, then the mono counts in `text-2`.
 *
 * Every verdict and level is plain text beside a labelled dot, so nothing
 * depends on colour alone (colour-blind-safe, per DESIGN.md's fallback rules).
 */

import { countLine } from "@/lib/format";

export type Level = "breaking" | "risky" | "compatible" | "info";

const WORD: Record<Level, string> = {
  breaking: "BREAKING",
  risky: "RISKY",
  compatible: "COMPATIBLE",
  info: "ACKNOWLEDGED",
};

export function LevelDot({ level }: { level: Level }) {
  return <span className="dot" data-level={level} aria-hidden="true" />;
}

export function LevelLabel({ level, suffix }: { level: Level; suffix?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <LevelDot level={level} />
      <span className="t-label level-label" data-level={level}>
        {WORD[level]}
        {suffix ? ` ${suffix}` : ""}
      </span>
    </span>
  );
}

/** The verdict word alone, for timeline rows: JBM 13 in its colour. */
export function VerdictWord({ level }: { level: Level }) {
  return (
    <span className="t-data level-label" data-level={level} style={{ fontWeight: 600 }}>
      {WORD[level]}
    </span>
  );
}

export function VerdictStamp({
  fromLabel,
  toLabel,
  verdict,
  summary,
  animate = true,
}: {
  fromLabel: string;
  toLabel: string;
  verdict: "breaking" | "risky" | "compatible";
  summary: { breaking: number; risky: number; compatible: number; info?: number };
  animate?: boolean;
}) {
  return (
    <div>
      <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 8px" }}>
        <span className="t-data" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          DEPLOY {toLabel} VS {fromLabel}
        </span>
      </p>
      <p
        className={`t-display stamp-word ${animate ? "stamp-animate" : ""}`}
        data-level={verdict}
        style={{ margin: "0 0 8px" }}
      >
        {WORD[verdict]}
      </p>
      <p className="t-data" style={{ color: "var(--color-text-2)", margin: 0 }}>
        {countLine(summary)}
      </p>
    </div>
  );
}
