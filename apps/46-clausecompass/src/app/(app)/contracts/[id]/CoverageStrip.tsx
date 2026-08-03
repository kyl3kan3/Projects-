"use client";

/**
 * The coverage strip: `15 SECTIONS · 9 ANALYZED · 4 BOILERPLATE · 2 NOT ANALYZED`.
 *
 * Always visible on a report, and "not analyzed" is a link rather than a footnote, because
 * this is the honest half of the product. A section this tool could not account for has to
 * be visible in the report; a review that quietly covered 80% of a contract while looking
 * complete is the failure mode that matters most here.
 */

import { useState } from "react";
import type { CoverageEntry } from "@/db/schema";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { DISPOSITION_LABELS } from "@/lib/summaries";

export function CoverageStrip({
  counts,
  coverage,
  warnings,
}: {
  counts: { sections: number; analyzed: number; boilerplate: number; notAnalyzed: number };
  coverage: CoverageEntry[];
  warnings: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="t-data" style={{ color: "var(--color-text-2)" }}>
        {counts.sections} SECTIONS · {counts.analyzed} ANALYZED · {counts.boilerplate} BOILERPLATE ·{" "}
        <button
          type="button"
          className="t-data tap"
          onClick={() => setOpen((v) => !v)}
          style={{
            color: counts.notAnalyzed > 0 ? "var(--color-oxblood)" : "var(--color-text-3)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
          }}
          aria-expanded={open}
        >
          {counts.notAnalyzed} NOT ANALYZED
        </button>
      </p>

      {open && (
        <div className="expand mt-4">
          <p className="t-secondary">
            Every numbered section is accounted for below. &ldquo;Not analyzed&rdquo; means no
            clause type in the taxonomy matched it, so no playbook rule ran on it — it is not
            a claim that the section is unimportant.
          </p>
          {warnings.length > 0 && (
            <ul className="mt-3" style={{ listStyle: "none", padding: 0 }}>
              {warnings.map((warning) => (
                <li key={warning} className="t-secondary" style={{ color: "var(--color-oxblood)" }}>
                  {warning}
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-4" style={{ listStyle: "none", padding: 0 }}>
            {coverage.map((entry) => (
              <li
                key={`${entry.ref}-${entry.heading}`}
                className="hairline-b flex items-baseline gap-3 py-2"
              >
                <span className="t-data" style={{ color: "var(--color-text-3)", minWidth: 52 }}>
                  {/^\d/.test(entry.ref) ? `§${entry.ref}` : entry.ref}
                </span>
                <span className="t-secondary min-w-0 flex-1" style={{ color: "var(--color-ink)" }}>
                  {entry.heading}
                </span>
                <span
                  className="t-label"
                  style={{
                    color:
                      entry.disposition === "not_analyzed"
                        ? "var(--color-text-3)"
                        : "var(--color-text-2)",
                  }}
                >
                  {entry.clauseType
                    ? CLAUSE_LABELS[entry.clauseType]
                    : DISPOSITION_LABELS[entry.disposition]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
