import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { flaggedQueue, loadReviewSheet, reviewProgress } from "@/lib/review";
import { buildFieldModels } from "@/lib/review-fields";
import { currentPeriod, listCategories, usageFor } from "@/lib/org";
import { documentCapacity } from "@/lib/plans";
import { loadInbox } from "@/lib/inbox";
import { splitCents } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { signedDownloadUrl } from "@/lib/storage";
import { sourceLabel } from "@/lib/documents";
import { ReviewSheet } from "../inbox/[id]/ReviewSheet";
import { StatusPill } from "@/components/StatusPill";
import { ReviewedCount } from "@/components/ReviewedCount";
import { IconArrowRight, IconCamera, IconDocument } from "@/components/icons";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

/**
 * The review queue: one sheet per screen, the next flagged document after each confirm.
 *
 * When the queue empties this becomes the "Inbox clear" state with the month total and a
 * quiet ledger rule beneath it — the reward for the work, and the only place in the
 * product where a total is celebrated at all.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ settled?: string; doc?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;

  const queue = await flaggedQueue(org.id);
  const progress = await reviewProgress(org.id);

  if (queue.length === 0) {
    const view = await loadInbox(org);
    const total = splitCents(view.totalCents, view.currency);
    return (
      <main className="screen">
        <header className="pt-8">
          <span className="t-label">Inbox clear</span>
          <h1 className="t-h2 mt-2">Nothing is flagged.</h1>
          <p className="t-secondary mt-2">
            Every entry in {view.monthLabel} has been read and confirmed.{" "}
            {progress.confirmedToday > 0 ? (
              <>
                <ReviewedCount value={progress.confirmedToday} ticked={Boolean(params.settled)} />{" "}
                ruled off today.
              </>
            ) : null}
          </p>
        </header>

        <section className="mt-8">
          <span className="t-label">{view.monthLabel} confirmed</span>
          <p className="t-stat mt-1" style={{ color: "var(--color-ledger)" }}>
            {total.whole}
            <span className="cents">.{total.frac}</span>
          </p>
          <span
            className="mt-3 block"
            style={{ height: 1.5, background: "var(--color-ledger)" }}
            aria-hidden="true"
          />
          <p className="t-secondary mt-3">
            {view.confirmedCount} confirmed {view.confirmedCount === 1 ? "entry" : "entries"} · this
            month closes on its own.
          </p>
        </section>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/close" className="btn btn-primary btn-full">
            See the close package
          </Link>
          <Link href="/capture" className="btn btn-secondary btn-full">
            <IconCamera size={18} />
            Photo another receipt
          </Link>
        </div>
      </main>
    );
  }

  const currentId = params.doc && queue.includes(params.doc) ? params.doc : queue[0];
  const usage = await usageFor(org.id, currentPeriod(org));
  const capacity = documentCapacity(org.plan, usage.documentsExtracted);
  const sheet = await loadReviewSheet(org.id, currentId, { atCap: capacity.atCap });
  if (!sheet) redirect("/review");

  const categories = await listCategories();
  const fields = buildFieldModels(sheet, categories);
  const position = queue.indexOf(currentId) + 1;
  const nextId = queue[position] ?? null;
  const isImage = sheet.document.mimeType.startsWith("image/");
  const sourceUrl = signedDownloadUrl(sheet.document.storageKey, { ttlSeconds: 900 });

  return (
    <main className="screen">
      <header className="pt-8">
        <div className="flex items-center justify-between gap-3">
          <span className="t-label">
            Review · {position} of {queue.length}
          </span>
          <StatusPill status={sheet.status} />
        </div>
        <h1 className="t-h2 mt-2">{sheet.vendor?.displayName ?? sheet.document.originalFilename}</h1>
        <p className="t-secondary mt-1">
          {sourceLabel(sheet.document.source)} ·{" "}
          {shortDate(sheet.document.receivedAt.toISOString().slice(0, 10))} ·{" "}
          {sheet.open.length} {sheet.open.length === 1 ? "field" : "fields"} to check
        </p>
      </header>

      <div
        className="mt-4 overflow-auto rounded-[20px] border"
        style={{
          borderColor: "var(--color-line)",
          background: "var(--color-surface)",
          maxHeight: 340,
          touchAction: "pan-x pan-y pinch-zoom",
        }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL
          <img src={sourceUrl} alt="Source document" className="block w-full" />
        ) : sheet.document.sourceText ? (
          <pre className="t-data m-0 whitespace-pre-wrap p-4" style={{ color: "var(--color-fg-2)" }}>
            {sheet.document.sourceText.slice(0, 2400)}
          </pre>
        ) : (
          <div className="flex items-center justify-center p-8" style={{ color: "var(--color-fg-3)" }}>
            <IconDocument size={28} />
          </div>
        )}
      </div>

      <ReviewSheet
        documentId={sheet.document.id}
        fields={fields}
        categories={categories.map((c) => ({
          slug: c.slug,
          name: c.name,
          scheduleCLine: c.scheduleCLine,
        }))}
        categorySlug={sheet.category?.slug ?? null}
        returnTo="review"
        canConfirm
      />

      <nav className="mt-6 flex items-center justify-between gap-3">
        <Link href={`/inbox/${sheet.document.id}?from=review`} className="btn-quiet">
          Open the full document
        </Link>
        {nextId ? (
          <Link href={`/review?doc=${nextId}`} className="btn-quiet inline-flex items-center gap-1.5">
            Skip for now
            <IconArrowRight size={18} />
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
