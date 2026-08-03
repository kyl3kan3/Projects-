import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadInbox, type InboxFilter } from "@/lib/inbox";
import { splitCents } from "@/lib/money";
import { currentPeriod, forwardingAddress } from "@/lib/org";
import { isPeriod, periodLabel, previousPeriod } from "@/lib/dates";
import { signedDownloadUrl } from "@/lib/storage";
import { reviewProgress } from "@/lib/review";
import { DocumentRow } from "@/components/DocumentRow";
import { CopyField } from "@/components/CopyField";
import { StatusPoll } from "@/components/StatusPoll";
import { ReviewedCount } from "@/components/ReviewedCount";
import { IconCamera, IconFlagSmall, IconMailIn } from "@/components/icons";
import { plan } from "@/lib/plans";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs review" },
  { id: "confirmed", label: "Confirmed" },
];

function isFilter(value: string | undefined): value is InboxFilter {
  return value === "all" || value === "needs_review" || value === "confirmed";
}

/** Chips keep whichever month is on screen — a filter is not a month change. */
function buildFilterHref(filter: InboxFilter, period?: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (period) params.set("period", period);
  const query = params.toString();
  return query ? `/inbox?${query}` : "/inbox";
}

const IMAGE_MIME = /^image\//;

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; settled?: string; period?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;
  const filter: InboxFilter = isFilter(params.filter) ? params.filter : "all";
  const settledId = params.settled;
  // A confirm redirects here with the period the entry landed in, so the row the
  // operator just ruled off is the row they are looking at.
  const period = params.period && isPeriod(params.period) ? params.period : undefined;

  const view = await loadInbox(org, { filter, period });
  const progress = await reviewProgress(org.id);
  const address = forwardingAddress(org.forwardingSlug);
  const total = splitCents(view.totalCents, view.currency);
  const year = currentPeriod(org).slice(0, 4);

  if (view.firstRun) {
    return (
      <main className="screen">
        <header className="pt-8">
          <span className="t-label">First run</span>
          <h1 className="t-h2 mt-2">Two ways in. Pick either.</h1>
          <p className="t-secondary mt-2">
            Nothing else to set up. The first document you send replaces this screen with
            your inbox.
          </p>
        </header>

        <section className="panel mt-6 p-4">
          <div className="flex items-center gap-2">
            <IconMailIn size={18} style={{ color: "var(--color-ledger)" }} />
            <h2 className="t-title">Forward an email</h2>
          </div>
          <p className="t-secondary mt-2">
            Any invoice or receipt in your inbox — forward it here, attachment or not.
          </p>
          <div className="mt-3">
            <CopyField value={address} label="Your forwarding address" />
          </div>
        </section>

        <section className="panel mt-4 p-4">
          <div className="flex items-center gap-2">
            <IconCamera size={18} style={{ color: "var(--color-ledger)" }} />
            <h2 className="t-title">Photo a receipt</h2>
          </div>
          <p className="t-secondary mt-2">
            Thermal paper, crumpled, in a truck cab. That is the design case.
          </p>
          <Link href="/capture" className="btn btn-primary btn-full mt-4">
            Photo a receipt
          </Link>
        </section>

        <p className="t-secondary mt-8" style={{ color: "var(--color-fg-3)" }}>
          You are on the {plan(org.plan).name} plan: up to {plan(org.plan).documentCap}{" "}
          documents a month.
        </p>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="pt-8">
        <span className="t-label">{view.monthLabel}</span>
        <p className="t-stat mt-1">
          {total.whole}
          <span className="cents">.{total.frac}</span>
        </p>
        <p className="t-secondary mt-1 flex flex-wrap items-center gap-x-2">
          <span>
            {view.documentCount} {view.documentCount === 1 ? "document" : "documents"}
          </span>
          {view.needsReviewCount > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-flag)" }}>
                <span className="dot dot-flag" aria-hidden="true" />
                {view.needsReviewCount} need review
              </span>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <span>nothing needs review</span>
            </>
          )}
          {progress.confirmedToday > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                <ReviewedCount value={progress.confirmedToday} ticked={Boolean(settledId)} /> ruled
                off today
              </span>
            </>
          ) : null}
        </p>
      </header>

      {view.parkedCount > 0 ? (
        <section
          className="mt-5 rounded-[12px] border p-4"
          style={{ borderColor: "var(--color-flag)", background: "var(--color-surface)" }}
        >
          <p className="t-title" style={{ color: "var(--color-flag)" }}>
            {view.parkedCount} {view.parkedCount === 1 ? "document is" : "documents are"} parked
          </p>
          <p className="t-secondary mt-1">
            You have used all {view.capacity.cap} extractions on the {plan(org.plan).name} plan
            this month. Nothing is lost and you have not been charged extra — these process
            next cycle, or as soon as you upgrade.
          </p>
          <Link href="/settings/billing" className="btn-quiet mt-3 inline-flex">
            See plans
          </Link>
        </section>
      ) : null}

      {view.needsReviewCount > 0 ? (
        <Link
          href="/review"
          className="mt-5 flex items-center gap-3 rounded-[12px] border p-4"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        >
          <IconFlagSmall size={20} style={{ color: "var(--color-flag)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">
              {view.needsReviewCount} {view.needsReviewCount === 1 ? "entry" : "entries"} to check
            </span>
            <span className="t-secondary block">
              One tap each. {view.monthLabel} cannot close until they are clear.
            </span>
          </span>
        </Link>
      ) : null}

      {period && period !== currentPeriod(org) ? (
        <p className="t-secondary mt-4">
          Showing {view.monthLabel}.{" "}
          <Link href="/inbox">Back to {periodLabel(currentPeriod(org), currentPeriod(org))}</Link>
        </p>
      ) : (
        <p className="t-secondary mt-4">
          <Link href={`/inbox?period=${previousPeriod(currentPeriod(org))}`}>
            See {periodLabel(previousPeriod(currentPeriod(org)), currentPeriod(org))}
          </Link>
        </p>
      )}

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter documents">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={buildFilterHref(f.id, period)}
            className="chip"
            data-active={filter === f.id}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <StatusPoll pending={view.extractingCount} />

      <section className="mt-2 hairline-t">
        {view.rows.length === 0 ? (
          <p className="t-secondary py-8">
            {filter === "needs_review"
              ? "Inbox clear — nothing is flagged this month."
              : filter === "confirmed"
                ? "Nothing confirmed yet this month."
                : "No documents in this month yet."}
          </p>
        ) : (
          view.rows.map((row, index) => (
            <DocumentRow
              key={row.document.id}
              row={row}
              index={index}
              settled={settledId === row.document.id}
              currentYear={year}
              thumbUrl={
                IMAGE_MIME.test(row.document.mimeType)
                  ? signedDownloadUrl(row.document.storageKey, { ttlSeconds: 900 })
                  : null
              }
            />
          ))
        )}
      </section>

      <div className="mt-6">
        <CopyField value={address} label="Forward invoices to" />
      </div>

      <div className="thumb-cta">
        <Link href="/capture" className="btn btn-primary btn-full">
          <IconCamera size={18} />
          Add receipt
        </Link>
      </div>
    </main>
  );
}
