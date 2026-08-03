import type { Metadata } from "next";
import Link from "next/link";
import { requireFirm } from "@/lib/auth";
import { firmSettings, DEFAULT_SCORE_THRESHOLD } from "@/db/schema";
import { listMatches } from "@/lib/matching";
import { FactorRows } from "@/components/FactorList";
import { formatDay, formatValueBand } from "@/lib/format";
import { stateName } from "@/lib/scoring";
import { ChevronLeft } from "@/components/icons";

export const metadata: Metadata = { title: "Suppressed matches" };

/**
 * The audit view: what the threshold filtered out, and why.
 *
 * "Below-threshold matches suppressed, never deleted" is a promise the product
 * has to be able to show, or it is just a claim in a README. This is the screen
 * that answers "another feed to ignore?" — the scan shows its restraint, and the
 * restraint is inspectable line by line.
 */
export default async function SuppressedPage() {
  const { firm } = await requireFirm();
  const now = new Date();
  const threshold = firmSettings(firm).scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const rows = await listMatches(firm.id, { states: ["suppressed"], limit: 100, now });

  return (
    <main className="pt-4">
      <Link href="/radar" className="btn-quiet">
        <ChevronLeft size={18} /> Radar
      </Link>

      <h1 className="t-h2 mt-3">What the threshold filtered</h1>
      <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
        {rows.length === 0
          ? `Nothing has been suppressed yet. Anything scoring below ${threshold} lands here — stored, never deleted.`
          : `${rows.length} notice${rows.length === 1 ? "" : "s"} scored below your threshold of ${threshold}. Each one is kept with its reasons, so you can check the filter rather than trust it.`}
      </p>
      <p className="t-secondary mt-2">
        Raise or lower the threshold in{" "}
        <Link href="/settings" className="btn-quiet">
          Settings
        </Link>
        .
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {rows.map((row) => (
          <article key={row.match.id} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="t-title">{row.opportunity.title}</h2>
                <p className="t-secondary mt-1">
                  {row.opportunity.agency} · {stateName(row.opportunity.state)}
                </p>
              </div>
              <span
                className="t-score shrink-0"
                style={{ color: "var(--color-ink-3)" }}
                aria-label={`Fit score ${row.match.score} out of 100, below threshold`}
              >
                {row.match.score}
              </span>
            </div>
            <p className="t-mono mt-3" style={{ color: "var(--color-ink-3)" }}>
              {[
                row.opportunity.externalId,
                row.opportunity.responsesDueAt
                  ? `due ${formatDay(row.opportunity.responsesDueAt, firm.timezone)}`
                  : null,
                formatValueBand(row.opportunity.estValueBand as never),
                row.profileName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-2 hair-t">
              <FactorRows factors={row.match.factors as never} />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
