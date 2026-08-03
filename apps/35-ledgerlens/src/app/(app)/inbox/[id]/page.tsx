import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadReviewSheet } from "@/lib/review";
import { listCategories, currentPeriod, usageFor, forwardingAddress } from "@/lib/org";
import { documentCapacity } from "@/lib/plans";
import { buildFieldModels } from "@/lib/review-fields";
import { rejectionCopy } from "@/lib/confidence";
import { formatCents } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { signedDownloadUrl } from "@/lib/storage";
import { sourceLabel } from "@/lib/documents";
import { extractorIsLive } from "@/lib/extraction";
import { ReviewSheet } from "./ReviewSheet";
import { DocumentControls } from "./DocumentControls";
import { StatusPill } from "@/components/StatusPill";
import { IconArrowLeft, IconCopyTwo, IconDocument } from "@/components/icons";

export const metadata: Metadata = { title: "Document" };
export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { org } = await requireUser();
  const { id } = await params;
  const { from } = await searchParams;

  const usage = await usageFor(org.id, currentPeriod(org));
  const capacity = documentCapacity(org.plan, usage.documentsExtracted);
  const sheet = await loadReviewSheet(org.id, id, { atCap: capacity.atCap });
  if (!sheet) notFound();

  const categories = await listCategories();
  const fields = buildFieldModels(sheet, categories);
  const isImage = sheet.document.mimeType.startsWith("image/");
  const isText = sheet.document.mimeType.startsWith("text/");
  const sourceUrl = signedDownloadUrl(sheet.document.storageKey, {
    ttlSeconds: 900,
    filename: sheet.document.originalFilename,
  });
  const returnTo = from === "review" ? "review" : "inbox";

  return (
    <main className="screen">
      <header className="flex items-center justify-between gap-3 pt-8">
        <Link
          href={returnTo === "review" ? "/review" : "/inbox"}
          className="btn-quiet inline-flex items-center gap-1.5"
          style={{ color: "var(--color-fg-2)" }}
        >
          <IconArrowLeft size={18} />
          {returnTo === "review" ? "Review queue" : "Inbox"}
        </Link>
        <StatusPill status={sheet.status} />
      </header>

      <h1 className="t-h2 mt-4">
        {sheet.vendor?.displayName ?? sheet.document.originalFilename}
      </h1>
      <p className="t-secondary mt-1">
        {sourceLabel(sheet.document.source)} ·{" "}
        {shortDate(sheet.document.receivedAt.toISOString().slice(0, 10))} ·{" "}
        {sheet.document.originalFilename}
      </p>

      {/* The source viewer. Its own overflow container so a tall receipt scrolls
          inside itself and the page body never scrolls sideways. */}
      <div
        className="mt-4 overflow-auto rounded-[20px] border"
        style={{
          borderColor: "var(--color-line)",
          background: "var(--color-surface)",
          maxHeight: 420,
          touchAction: "pan-x pan-y pinch-zoom",
        }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL
          <img
            src={sourceUrl}
            alt={`Source document from ${sheet.vendor?.displayName ?? "this vendor"}`}
            className="block w-full"
            style={{ objectFit: "contain" }}
          />
        ) : isText ? (
          <pre
            className="t-data m-0 whitespace-pre-wrap p-4"
            style={{ color: "var(--color-fg-2)" }}
          >
            {(sheet.document.sourceText ?? "").slice(0, 4000) || "No text captured."}
          </pre>
        ) : (
          <div className="flex flex-col items-center gap-3 p-8" style={{ color: "var(--color-fg-3)" }}>
            <IconDocument size={28} />
            <p className="t-secondary">{sheet.document.mimeType}</p>
            <a href={sourceUrl} className="btn-quiet" target="_blank" rel="noreferrer">
              Open the original
            </a>
          </div>
        )}
      </div>

      {sheet.status === "duplicate" ? (
        <section
          className="mt-5 rounded-[12px] border p-4"
          style={{ borderColor: "var(--color-red)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center gap-2">
            <IconCopyTwo size={18} style={{ color: "var(--color-red)" }} />
            <h2 className="t-title" style={{ color: "var(--color-red)" }}>
              Duplicate forward
            </h2>
          </div>
          <p className="t-secondary mt-2">
            This is byte-identical to a document already in your books, so no second entry
            was created. The forward is kept on record.
          </p>
          {sheet.duplicateCandidate ? (
            <Link href={`/inbox/${sheet.duplicateCandidate.document.id}`} className="btn-quiet mt-3 inline-flex">
              Open the entry it duplicates
            </Link>
          ) : null}
        </section>
      ) : null}

      {sheet.status === "rejected" ? (
        <section
          className="mt-5 rounded-[12px] border p-4"
          style={{ borderColor: "var(--color-red)", background: "var(--color-surface)" }}
        >
          <h2 className="t-title" style={{ color: "var(--color-red)" }}>
            Not extracted
          </h2>
          <p className="t-secondary mt-2">{rejectionCopy(sheet.document.failureReason)}</p>
          <p className="t-secondary mt-2" style={{ color: "var(--color-fg-3)" }}>
            Nothing was written to your books. Re-run extraction below, or photograph it
            again in better light.
          </p>
        </section>
      ) : null}

      {sheet.document.duplicateCandidateOfId && sheet.status !== "duplicate" ? (
        <section
          className="mt-5 rounded-[12px] border p-4"
          style={{ borderColor: "var(--color-flag)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center gap-2">
            <IconCopyTwo size={18} style={{ color: "var(--color-flag)" }} />
            <h2 className="t-title" style={{ color: "var(--color-flag)" }}>
              Possible duplicate
            </h2>
          </div>
          <p className="t-secondary mt-2">
            {sheet.duplicateCandidate?.lineItem
              ? `Same vendor and the same ${formatCents(
                  sheet.duplicateCandidate.lineItem.amountCents,
                  sheet.duplicateCandidate.lineItem.currency,
                )} within three days (${shortDate(sheet.duplicateCandidate.lineItem.docDate)}).`
              : "Same vendor and total as another document within three days."}{" "}
            Two identical fills on consecutive days are normal — you decide.
          </p>
        </section>
      ) : null}

      {sheet.lineItem ? (
        <ReviewSheet
          documentId={sheet.document.id}
          fields={fields}
          categories={categories.map((c) => ({
            slug: c.slug,
            name: c.name,
            scheduleCLine: c.scheduleCLine,
          }))}
          categorySlug={sheet.category?.slug ?? null}
          returnTo={returnTo}
          canConfirm={sheet.status !== "duplicate"}
        />
      ) : (
        <p className="t-secondary mt-5">
          {sheet.status === "extracting" || sheet.status === "queued"
            ? "This document is waiting to be read. It will appear here in a moment."
            : "There is no reading for this document yet."}
        </p>
      )}

      <DocumentControls
        documentId={sheet.document.id}
        canMerge={Boolean(sheet.document.duplicateCandidateOfId) && sheet.status !== "duplicate"}
        canReject={sheet.status !== "rejected" && sheet.status !== "duplicate"}
      />

      {sheet.extraction ? (
        <p className="t-secondary mt-6" style={{ color: "var(--color-fg-3)" }}>
          Read by {sheet.extraction.model}
          {sheet.extraction.escalated ? " (escalated)" : ""} in {sheet.extraction.durationMs}ms
          {extractorIsLive() ? "" : " — no model key is configured on this deployment, so a stand-in reader was used"}
          . Forward more to {forwardingAddress(org.forwardingSlug)}.
        </p>
      ) : null}
    </main>
  );
}
