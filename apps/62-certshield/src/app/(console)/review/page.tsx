import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { lowConfidence, reviewQueue } from "@/lib/certificates";
import { env } from "@/lib/env";
import { formatStamp } from "@/lib/dates";
import { COVERAGE_LABELS } from "@/lib/format";
import { expectedHolder } from "@/lib/verdicts";
import { ReviewForm, type ReviewLineDraft } from "./ReviewForm";

export const metadata: Metadata = { title: "Review queue" };

const STATUS_NOTE: Record<string, string> = {
  needs_review: "Some fields came back below the confidence bar",
  failed: "The parser could not read this document",
  pending: "Waiting to be read",
};

/**
 * The review queue (DESIGN.md screen 4): the ACORD PDF on the left, the parsed
 * fields on the right with their confidence, low-confidence fields underlined in
 * `pending`. Confirming advances to evaluation.
 *
 * Oldest first, deliberately: the longest-waiting certificate is the one blocking
 * someone's work order.
 *
 * At 390px the PDF stacks above the form rather than shrinking to unreadability —
 * a phone can still confirm a certificate, which is the point of the queue being
 * reachable from the tab bar.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ cert?: string; confirmed?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;
  const queue = await reviewQueue(org.id);
  const selected = params.cert
    ? (queue.find((item) => item.certificate.id === params.cert) ?? queue[0])
    : queue[0];
  const threshold = env.reviewThreshold;

  if (!queue.length) {
    return (
      <main style={{ padding: "24px var(--gutter) 0" }}>
        <h1 className="t-h2">Review queue</h1>
        {params.confirmed && (
          <p className="t-secondary" role="status" style={{ marginTop: 8 }}>
            Confirmed. The vendor&apos;s engagements were re-evaluated.
          </p>
        )}
        <div className="panel" style={{ marginTop: 20, padding: 20 }}>
          <p className="t-title">Nothing is waiting on a human</p>
          <p className="t-secondary" style={{ marginTop: 8, maxWidth: "62ch" }}>
            Every certificate on file was read with every field above {threshold}% confidence, or has
            already been confirmed. Anything the parser is unsure about lands here — it never enters
            compliance on its own.
          </p>
          <Link href="/dashboard" className="btn btn-secondary" style={{ marginTop: 16 }}>
            Back to the dashboard
          </Link>
        </div>
      </main>
    );
  }

  const lines: ReviewLineDraft[] = (selected?.coverages ?? []).map((coverage) => ({
    id: coverage.id,
    kind: coverage.kind,
    label: coverage.label || COVERAGE_LABELS[coverage.kind],
    min: coverage.limitCents != null ? String(Math.round(coverage.limitCents / 100)) : "",
    policyNumber: coverage.policyNumber ?? "",
    effectiveOn: coverage.effectiveOn ?? "",
    expiresOn: coverage.expiresOn ?? "",
    additionalInsured:
      coverage.additionalInsured === null ? "unknown" : coverage.additionalInsured ? "yes" : "no",
    waiverOfSubrogation:
      coverage.waiverOfSubrogation === null
        ? "unknown"
        : coverage.waiverOfSubrogation
          ? "yes"
          : "no",
    lowConfidence: [...lowConfidence(coverage.fieldConfidence, threshold)],
    confidence: coverage.fieldConfidence ?? {},
  }));

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <h1 className="t-h2">Review queue</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {queue.length} certificate{queue.length === 1 ? "" : "s"} waiting · oldest first · confidence
        bar {threshold}%
      </p>
      {params.confirmed && (
        <p className="t-secondary" role="status" style={{ marginTop: 8 }}>
          Confirmed. The vendor&apos;s engagements were re-evaluated.
        </p>
      )}

      {queue.length > 1 && (
        <div className="chip-row" style={{ marginTop: 16 }}>
          {queue.map((item) => (
            <Link
              key={item.certificate.id}
              href={`/review?cert=${item.certificate.id}`}
              className="chip"
              data-active={item.certificate.id === selected?.certificate.id}
            >
              {item.vendor.name}
            </Link>
          ))}
        </div>
      )}

      {selected && (
        <div className="lg:flex lg:items-start lg:gap-8" style={{ marginTop: 20 }}>
          {/* The document. */}
          <div className="lg:w-1/2 lg:shrink-0">
            <p className="t-label">
              {STATUS_NOTE[selected.certificate.parsedStatus] ?? "On file"} ·{" "}
              {formatStamp(selected.certificate.uploadedAt, org.timezone)}
            </p>
            <object
              data={`/api/certificates/${selected.certificate.id}/pdf#view=FitH`}
              type="application/pdf"
              style={{
                width: "100%",
                height: "min(60vh, 560px)",
                marginTop: 8,
                border: "1px solid var(--color-line)",
                borderRadius: 8,
                background: "var(--color-sheet)",
              }}
              aria-label={`Certificate PDF for ${selected.vendor.name}`}
            >
              <div style={{ padding: 16 }}>
                <p className="t-secondary">
                  Your browser will not display the PDF inline.
                </p>
                <a
                  href={`/api/certificates/${selected.certificate.id}/pdf`}
                  className="btn btn-secondary"
                  style={{ marginTop: 12 }}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the certificate
                </a>
              </div>
            </object>
            <p
              className="t-mono"
              style={{ marginTop: 8, color: "var(--color-dim)", wordBreak: "break-all" }}
            >
              sha256 {selected.certificate.sha256}
            </p>
            <a
              href={`/api/certificates/${selected.certificate.id}/pdf`}
              className="btn-quiet"
              target="_blank"
              rel="noreferrer"
            >
              Open in a new tab
            </a>
          </div>

          {/* The parsed fields. */}
          <div className="lg:w-1/2 lg:min-w-0" style={{ marginTop: 24 }}>
            <ReviewForm
              certificateId={selected.certificate.id}
              vendorName={selected.vendor.name}
              carrier={selected.certificate.carrier ?? ""}
              producer={selected.certificate.producer ?? ""}
              holderName={selected.certificate.holderName ?? ""}
              holderOk={selected.certificate.holderOk ?? false}
              expectedHolder={expectedHolder(org)}
              certificateConfidence={selected.certificate.fieldConfidence ?? {}}
              certificateLowConfidence={[
                ...lowConfidence(selected.certificate.fieldConfidence, threshold),
              ]}
              initialLines={lines}
              parseError={selected.certificate.parseError}
            />
          </div>
        </div>
      )}
    </main>
  );
}
