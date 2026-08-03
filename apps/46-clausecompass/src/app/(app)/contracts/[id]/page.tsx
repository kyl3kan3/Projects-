import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assembleReport, getContract } from "@/lib/contracts";
import { shareUrlFor } from "@/lib/reports";
import { LAWYER_POINTER } from "@/lib/explain";
import { CONTRACT_TYPE_LABELS } from "@/lib/taxonomy";
import { FlagSummary } from "@/components/SeverityChip";
import { ClauseMap, type ClauseRowData } from "@/components/ClauseMap";
import { Processing } from "./Processing";
import { ReportActions } from "./ReportActions";
import { CoverageStrip } from "./CoverageStrip";
import { toggleRedlineAction } from "../actions";
import { IconMailDraft } from "@/components/icons";

export const metadata: Metadata = { title: "Review" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireUser();
  const contract = await getContract(account.id, id);
  if (!contract) notFound();

  const view = await assembleReport(contract);
  const inProgress = contract.status !== "ready";

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

  const shareUrl = contract.status === "ready" ? await shareUrlFor(contract.id) : null;

  return (
    <main className="screen">
      <header className="pt-8">
        <p className="t-label">
          {CONTRACT_TYPE_LABELS[contract.contractType]}
          {contract.typeConfirmed ? "" : " · detected"}
        </p>
        <h1 className="t-h2 mt-2">{contract.title}</h1>
        {contract.counterparty && (
          <p className="t-secondary mt-1">Sent by {contract.counterparty}</p>
        )}
        <p className="t-data mt-3" style={{ color: "var(--color-text-3)" }}>
          {contract.pageCount} {contract.pageCount === 1 ? "PAGE" : "PAGES"} ·{" "}
          {contract.sourceKind.toUpperCase()} · UPLOADED{" "}
          {contract.createdAt.toISOString().slice(0, 10)}
        </p>
      </header>

      {inProgress ? (
        <Processing
          contractId={contract.id}
          initialStatus={contract.status}
          pageCount={contract.pageCount}
          sections={view.sectionCount}
          failureReason={contract.failureReason}
        />
      ) : (
        <>
          <section className="report-page mt-6 p-5">
            <FlagSummary summary={view.summary} />
            <div className="mt-3">
              <CoverageStrip
                counts={view.coverageCounts}
                coverage={view.coverage}
                warnings={view.warnings}
              />
            </div>
            <p className="t-label mt-4" style={{ letterSpacing: "0.06em" }}>
              Scored against {view.report?.playbookName ?? "the default playbook"} v
              {view.report?.playbookVersion ?? 1} · extraction {view.report?.modelVersion ?? "—"}
            </p>
          </section>

          <section className="mt-8">
            <h2 className="t-label mb-1">The clause map · worst first</h2>
            <ClauseMap
              rows={rows}
              lawyerPointerText={LAWYER_POINTER}
              onToggleRedline={toggleRedlineAction}
            />
          </section>

          <ReportActions
            contractId={contract.id}
            pdfPath={`/api/reports/${contract.id}/pdf`}
            emailPath={`/contracts/${contract.id}/email`}
            initialShareUrl={shareUrl}
            retentionDays={account.retentionDays}
            retentionDate={contract.retentionExpiresAt.toISOString().slice(0, 10)}
          />

          <div className="sticky-action no-print">
            <div className="flex items-center gap-4">
              <a
                className="btn btn-primary"
                style={{ flex: 1 }}
                href={`/api/reports/${contract.id}/pdf`}
                download
              >
                Export report
              </a>
              <Link className="btn-quiet" href={`/contracts/${contract.id}/email`}>
                <IconMailDraft size={18} />
                Draft the email
              </Link>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
