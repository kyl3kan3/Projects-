/**
 * DeficiencyList — verdicts as sentences (DESIGN.md's signature rule).
 *
 * Renders an evaluation's deficiencies verbatim, each on its own line in `claim`
 * red-brown, with the coverage line as a placard above it. No icons, no
 * unexplained badges: the sentence is the product, and it is the same string the
 * deficiency letter quotes and the binder prints.
 *
 * Pure presentation — no imports that reach the database, so this is safe inside a
 * client component.
 */

import type { Deficiency } from "@/db/schema";

export interface DeficiencyListProps {
  deficiencies: Deficiency[];
  /** Group by coverage line, printing each line's placard once. */
  grouped?: boolean;
  className?: string;
}

export function DeficiencyList({ deficiencies, grouped = true, className }: DeficiencyListProps) {
  if (!deficiencies.length) return null;

  if (!grouped) {
    return (
      <div className={className}>
        {deficiencies.map((d, i) => (
          <p key={`${d.line}-${i}`} className="deficiency">
            {d.reason}
          </p>
        ))}
      </div>
    );
  }

  const lines: Array<{ line: string; reasons: string[] }> = [];
  for (const d of deficiencies) {
    const existing = lines.find((l) => l.line === d.line);
    if (existing) existing.reasons.push(d.reason);
    else lines.push({ line: d.line, reasons: [d.reason] });
  }

  return (
    <div className={className}>
      {lines.map((group, i) => (
        <div key={`${group.line}-${i}`} style={{ marginTop: i === 0 ? 0 : 12 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>
            {group.line}
          </p>
          {group.reasons.map((reason, j) => (
            <p
              key={j}
              className="deficiency"
              // Staggered 30ms apart, capped by the list length — the sentences
              // arrive in reading order rather than all at once.
              style={{ animationDelay: `${Math.min(i * 2 + j, 7) * 30}ms` }}
            >
              {reason}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
