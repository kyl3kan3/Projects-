import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  buildPeriodSummary,
  closeGate,
  getPeriod,
  listPeriods,
} from "@/lib/close-package";
import { documentPeriods } from "@/lib/inbox";
import { currentPeriod } from "@/lib/org";
import { isPeriod, monthName, periodLabel, previousPeriod } from "@/lib/dates";
import { formatCents, percentOf, splitCents } from "@/lib/money";
import { plan, planRequiredFor, PLANS } from "@/lib/plans";
import { listShareLinks, shareState } from "@/lib/share";
import { CloseButton, RevokeShareLink, ShareLinkForm } from "./CloseControls";
import { PeriodPill } from "@/components/StatusPill";
import { IconChevronRight, IconDownload, IconFlagSmall } from "@/components/icons";

export const metadata: Metadata = { title: "Close" };
export const dynamic = "force-dynamic";

const DOWNLOADS = [
  { kind: "pdf", label: "PDF summary", hint: "Category totals, flagged items, missing receipts" },
  { kind: "zip", label: "Full package (ZIP)", hint: "PDF, all three CSVs, and every source image" },
  { kind: "csv", label: "CSV — every field", hint: "One row per entry, for a spreadsheet" },
  { kind: "qbo", label: "CSV — QuickBooks Online", hint: "Date, Description, Amount, Category" },
  { kind: "xero", label: "CSV — Xero", hint: "Precoded statement import" },
] as const;

export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; closed?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;

  const thisPeriod = currentPeriod(org);
  const activity = await documentPeriods(org.id);
  const closes = await listPeriods(org.id);
  const closeByPeriod = new Map(closes.map((c) => [c.period, c]));

  const known = [...new Set([...activity, ...closes.map((c) => c.period), previousPeriod(thisPeriod), thisPeriod])]
    .filter(isPeriod)
    .sort()
    .reverse();

  const selected =
    params.period && isPeriod(params.period) && known.includes(params.period)
      ? params.period
      : (known.find((p) => p !== thisPeriod) ?? thisPeriod);

  const record = closeByPeriod.get(selected) ?? (await getPeriod(org.id, selected));
  const gate = await closeGate(org.id, selected);
  const summary = record?.summary ?? (await buildPeriodSummary(org.id, selected));
  const total = splitCents(summary.totalCents, summary.currency);
  const closed = record?.status === "closed";
  const label = periodLabel(selected, thisPeriod);
  const shareLinks = await listShareLinks(org.id);
  const sharingEnabled = plan(org.plan).accountantSharing;

  return (
    <main className="screen">
      <header className="pt-8">
        <span className="t-label">Close packages</span>
        <h1 className="t-h2 mt-2">The shoebox, closed</h1>
        <p className="t-secondary mt-2">
          One deliverable a month: the totals, the exports, and every original image.
        </p>
      </header>

      <section className="mt-6 hairline-t">
        {known.map((period) => {
          const row = closeByPeriod.get(period);
          const isSelected = period === selected;
          return (
            <Link
              key={period}
              href={`/close?period=${period}`}
              className="flex min-h-[64px] items-center gap-3 border-b py-3"
              style={{
                borderColor: "var(--color-line)",
                background: isSelected ? "var(--color-surface)" : "transparent",
              }}
            >
              <span className="t-mono w-[76px] shrink-0 text-[15px]">{period}</span>
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">
                  {monthName(period)} {period.slice(0, 4)}
                </span>
                <span className="t-secondary block" style={{ color: "var(--color-fg-3)" }}>
                  {row?.summary
                    ? `${row.summary.confirmedCount} entries · ${formatCents(row.summary.totalCents, row.summary.currency)}`
                    : period === thisPeriod
                      ? "still open — closes after the month ends"
                      : "not closed yet"}
                </span>
              </span>
              <PeriodPill status={row?.status ?? "open"} />
              <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
            </Link>
          );
        })}
      </section>

      {!gate.clean ? (
        <section
          className="mt-6 rounded-[12px] border p-4"
          style={{ borderColor: "var(--color-flag)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center gap-2">
            <IconFlagSmall size={18} style={{ color: "var(--color-flag)" }} />
            <h2 className="t-title" style={{ color: "var(--color-flag)" }}>
              {gate.blockingDocuments}{" "}
              {gate.blockingDocuments === 1 ? "item needs" : "items need"} review before {label}{" "}
              closes
            </h2>
          </div>
          <p className="t-secondary mt-2">
            The package is held back on purpose. A guess in a tax export is worse than a
            late export.
          </p>
          <Link href="/review" className="btn btn-primary btn-full mt-4">
            Review them now
          </Link>
        </section>
      ) : null}

      {/* The close-package panel. */}
      <section className="panel mt-6 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-label">{label} close</span>
          {closed ? (
            <span className="t-data" style={{ color: "var(--color-ledger)" }}>
              v{record?.version} · {record?.closedAt?.toISOString().slice(0, 10)}
            </span>
          ) : null}
        </div>

        <p className="t-stat mt-1" style={{ color: closed ? "var(--color-ledger)" : "var(--color-fg)" }}>
          {total.whole}
          <span className="cents">.{total.frac}</span>
        </p>
        <p className="t-secondary mt-1">
          {summary.confirmedCount} confirmed{" "}
          {summary.confirmedCount === 1 ? "entry" : "entries"} ·{" "}
          {formatCents(summary.taxCents, summary.currency)} tax
          {summary.previousTotalCents !== null
            ? ` · ${monthName(previousPeriod(selected))} was ${formatCents(summary.previousTotalCents, summary.currency)}`
            : ""}
        </p>

        <div className="mt-4 hairline-t">
          {summary.totalsByCategory.length === 0 ? (
            <p className="t-secondary py-4">Nothing confirmed in this month yet.</p>
          ) : (
            summary.totalsByCategory.map((category) => (
              <div
                key={category.slug}
                className="flex items-baseline justify-between gap-3 border-b py-3"
                style={{ borderColor: "var(--color-line)" }}
              >
                <span className="min-w-0">
                  <span className="t-body block truncate">{category.name}</span>
                  <span className="t-data block" style={{ color: "var(--color-fg-3)" }}>
                    Schedule C {category.scheduleCLine} · {category.documentCount}{" "}
                    {category.documentCount === 1 ? "entry" : "entries"} ·{" "}
                    {percentOf(category.amountCents, summary.totalCents)}%
                  </span>
                </span>
                <span className="t-mono shrink-0 text-[15px]">
                  {formatCents(category.amountCents, summary.currency)}
                </span>
              </div>
            ))
          )}
          <div className="flex items-baseline justify-between gap-3 py-3">
            <span className="t-title">Total</span>
            <span className="t-mono text-[17px]" style={{ color: "var(--color-ledger)" }}>
              {formatCents(summary.totalCents, summary.currency)}
            </span>
          </div>
          <span style={{ display: "block", height: 1.5, background: "var(--color-ledger)" }} aria-hidden="true" />
        </div>

        {summary.flagged.length > 0 ? (
          <div className="mt-5">
            <span className="t-label">Not in these totals</span>
            <div className="mt-2 hairline-t">
              {summary.flagged.map((entry) => (
                <Link
                  key={entry.documentId}
                  href={`/inbox/${entry.documentId}`}
                  className="flex items-baseline justify-between gap-3 border-b py-3"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <span className="min-w-0">
                    <span className="t-body block truncate" style={{ color: "var(--color-flag)" }}>
                      {entry.vendor}
                    </span>
                    <span className="t-secondary block" style={{ color: "var(--color-fg-3)" }}>
                      {entry.reason}
                    </span>
                  </span>
                  <span className="t-mono shrink-0" style={{ color: "var(--color-flag)" }}>
                    {entry.amountCents > 0 ? formatCents(entry.amountCents, summary.currency) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {summary.missingReceipts.length > 0 ? (
          <div className="mt-5">
            <span className="t-label">Recurring vendors with no document this month</span>
            <div className="mt-2 hairline-t">
              {summary.missingReceipts.map((gapRow) => (
                <div
                  key={gapRow.vendor}
                  className="flex items-baseline justify-between gap-3 border-b py-3"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <span className="min-w-0">
                    <span className="t-body block truncate">{gapRow.vendor}</span>
                    <span className="t-data block" style={{ color: "var(--color-fg-3)" }}>
                      seen {gapRow.seenInPeriods.join(", ")}
                    </span>
                  </span>
                  <span className="t-mono shrink-0" style={{ color: "var(--color-fg-2)" }}>
                    ~{formatCents(gapRow.typicalAmountCents, summary.currency)}
                  </span>
                </div>
              ))}
            </div>
            <p className="t-secondary mt-2" style={{ color: "var(--color-fg-3)" }}>
              A missing receipt is a missing deduction. Forward it and re-close.
            </p>
          </div>
        ) : null}

        {closed ? (
          <div className="mt-5">
            <span className="t-label">Downloads</span>
            <div className="mt-2 hairline-t">
              {DOWNLOADS.filter(
                (d) => plan(org.plan).accountingExports || (d.kind !== "qbo" && d.kind !== "xero"),
              ).map((download) => (
                <a
                  key={download.kind}
                  href={`/api/close/${selected}/${download.kind}`}
                  className="flex min-h-[56px] items-center gap-3 border-b py-3"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-fg)" }}
                >
                  <IconDownload size={18} style={{ color: "var(--color-ledger)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="t-body block truncate">{download.label}</span>
                    <span className="t-secondary block truncate" style={{ color: "var(--color-fg-3)" }}>
                      {download.hint}
                    </span>
                  </span>
                </a>
              ))}
            </div>
            {!plan(org.plan).accountingExports ? (
              <p className="t-secondary mt-2" style={{ color: "var(--color-fg-3)" }}>
                QuickBooks and Xero formats are on {PLANS[planRequiredFor("accountingExports")].name}{" "}
                and above. The generic CSV imports into both with a mapping step.
              </p>
            ) : null}
          </div>
        ) : null}

        <CloseButton
          period={selected}
          monthLabel={`${monthName(selected)} ${selected.slice(0, 4)}`}
          blocking={gate.blockingDocuments}
          alreadyClosed={closed}
        />
      </section>

      <section className="mt-8">
        <span className="t-label">Accountant access</span>
        <h2 className="t-title mt-2">A read-only link, no login</h2>
        <p className="t-secondary mt-1">
          Your accountant sees the closed packages and can download them. They cannot see
          your inbox, and you can revoke the link at any time. Links expire after 90 days.
        </p>

        <ShareLinkForm
          enabled={sharingEnabled}
          requiredPlan={PLANS[planRequiredFor("accountantSharing")].name}
        />

        {shareLinks.length > 0 ? (
          <div className="mt-6 hairline-t">
            {shareLinks.map((link) => {
              const state = shareState(link);
              return (
                <div
                  key={link.id}
                  className="border-b py-4"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="t-title">{link.label}</span>
                    <span
                      className="t-data"
                      style={{
                        color:
                          state === "active" ? "var(--color-ledger)" : "var(--color-fg-3)",
                      }}
                    >
                      {state}
                    </span>
                  </div>
                  <p className="t-secondary mt-1" style={{ color: "var(--color-fg-3)" }}>
                    {link.accessCount === 0
                      ? "Not opened yet"
                      : `Opened ${link.accessCount} ${link.accessCount === 1 ? "time" : "times"} · last ${link.lastAccessedAt?.toISOString().slice(0, 10)}`}{" "}
                    · expires {link.expiresAt.toISOString().slice(0, 10)}
                  </p>
                  {state === "active" ? (
                    <div className="mt-3">
                      <RevokeShareLink shareLinkId={link.id} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <p className="t-secondary mt-8" style={{ color: "var(--color-fg-3)" }}>
        Categories follow IRS Schedule C line numbers. LedgerLens prepares the file; a
        professional files the return.
      </p>
    </main>
  );
}
