import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reportFromShareToken } from "@/lib/reports";
import { LAWYER_POINTER } from "@/lib/explain";
import { CONTRACT_TYPE_LABELS } from "@/lib/taxonomy";
import { FlagSummary } from "@/components/SeverityChip";
import { ClauseMap, type ClauseRowData } from "@/components/ClauseMap";
import { Banner } from "@/components/Banner";
import { IconCompass } from "@/components/icons";

export const metadata: Metadata = {
  title: "Shared review",
  robots: { index: false, follow: false },
};

/**
 * A shared, read-only report.
 *
 * Public by design — the token is the whole credential — so this page is deliberately
 * thin: no actions, no account chrome, no way in to the rest of the product beyond the
 * marketing page. The banner is here for the same reason it is everywhere else: the person
 * opening this link may be the counterparty, and they should know exactly what they are
 * reading.
 */
export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await reportFromShareToken(token);
  if (!view || view.contract.status !== "ready") notFound();

  const rows: ClauseRowData[] = view.rows.map((row) => ({
    id: row.kind === "missing" ? `missing-${row.clauseType}` : `${row.clauseType}-${row.page ?? 0}`,
    kind: row.kind,
    label: row.label,
    citation: row.citation,
    severity: row.severity,
    summary: row.summary,
    quote: row.quote,
    confidence: row.confidence,
    flags: row.flags.map(({ flag, redline }) => ({
      id: flag.id,
      ruleKey: flag.ruleKey,
      title: flag.title,
      severity: flag.severity,
      firedBecause: flag.firedBecause,
      explanation: flag.explanation,
      forYou: flag.forYou,
      market: flag.market,
      lawyerPointer: flag.lawyerPointer,
      explanationSource: flag.explanationSource,
      redline: redline
        ? {
            id: redline.id,
            originalPhrase: redline.originalPhrase,
            suggestedText: redline.suggestedText,
            rationale: redline.rationale,
            emailSnippet: redline.emailSnippet,
            accepted: redline.accepted,
          }
        : null,
    })),
  }));

  const { contract, report, coverageCounts } = view;

  return (
    <main className="screen" style={{ paddingBottom: 64 }}>
      <div className="flex items-center gap-2 pt-6">
        <span style={{ color: "var(--color-oxblood)" }}>
          <IconCompass size={20} />
        </span>
        <span className="t-title">ClauseCompass</span>
        <span className="t-label" style={{ marginLeft: "auto" }}>
          Shared review · read only
        </span>
      </div>

      <header className="pt-8">
        <p className="t-label">{CONTRACT_TYPE_LABELS[contract.contractType]}</p>
        <h1 className="t-h2 mt-2">{contract.title}</h1>
        {contract.counterparty && <p className="t-secondary mt-1">Sent by {contract.counterparty}</p>}
      </header>

      <section className="report-page mt-6 p-5">
        <FlagSummary summary={view.summary} />
        <p className="t-data mt-3" style={{ color: "var(--color-text-2)" }}>
          {coverageCounts.sections} SECTIONS · {coverageCounts.analyzed} ANALYZED ·{" "}
          {coverageCounts.boilerplate} BOILERPLATE ·{" "}
          <span style={{ color: "var(--color-text-3)" }}>{coverageCounts.notAnalyzed} NOT ANALYZED</span>
        </p>
        <p className="t-label mt-4" style={{ letterSpacing: "0.06em" }}>
          Scored against {report?.playbookName} v{report?.playbookVersion} · extraction{" "}
          {report?.modelVersion}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="t-label mb-1">The clause map · worst first</h2>
        <ClauseMap rows={rows} lawyerPointerText={LAWYER_POINTER} />
      </section>

      {view.warnings.length > 0 && (
        <section className="hairline-t mt-8 pt-6">
          <p className="t-label">What was not read</p>
          <ul className="mt-2" style={{ listStyle: "none", padding: 0 }}>
            {view.warnings.map((warning) => (
              <li key={warning} className="t-secondary">
                {warning}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10">
        <Banner />
      </div>
    </main>
  );
}
