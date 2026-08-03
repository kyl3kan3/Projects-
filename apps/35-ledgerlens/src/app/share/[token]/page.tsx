import type { Metadata } from "next";
import { recordShareAccess, resolveShareToken } from "@/lib/share";
import { formatCents, percentOf, splitCents } from "@/lib/money";
import { monthName } from "@/lib/dates";
import { plan } from "@/lib/plans";
import { IconDownload } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Not indexable, and the token must never reach a referrer or a search engine. */
export const metadata: Metadata = {
  title: "Close packages",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const DOWNLOADS = [
  { kind: "pdf", label: "PDF summary" },
  { kind: "zip", label: "Full package (ZIP)" },
  { kind: "csv", label: "CSV — every field" },
  { kind: "qbo", label: "CSV — QuickBooks Online" },
  { kind: "xero", label: "CSV — Xero" },
] as const;

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolution = await resolveShareToken(token);

  if (!resolution.ok) {
    const copy =
      resolution.reason === "expired"
        ? "This link has expired. Links last 90 days; ask your client for a new one."
        : resolution.reason === "revoked"
          ? "This link was revoked by the business that shared it."
          : "This link is not valid.";
    return (
      <main className="screen-plain pt-16">
        <span className="t-label">LedgerLens</span>
        <h1 className="t-h2 mt-4">No access</h1>
        <p className="t-secondary mt-2">{copy}</p>
      </main>
    );
  }

  const { link, org, periods } = resolution;
  await recordShareAccess(link, "share.accessed", { periods: periods.length });
  const exportsAllowed = plan(org.plan).accountingExports;

  return (
    <main className="screen-plain pt-12" style={{ maxWidth: 720 }}>
      <header>
        <span className="t-label">Prepared with LedgerLens</span>
        <h1 className="t-h2 mt-3">{org.name}</h1>
        <p className="t-secondary mt-2">
          Read-only close packages shared with {link.label}. Totals include confirmed
          entries only; anything unreviewed is named in each PDF and excluded.
        </p>
      </header>

      {periods.length === 0 ? (
        <p className="t-secondary mt-8">
          No months have been closed yet. This page will fill in as they are.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {periods.map((period) => {
            const summary = period.summary;
            const total = splitCents(summary?.totalCents ?? 0, summary?.currency ?? "USD");
            return (
              <section key={period.id} className="panel p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-label">
                    {monthName(period.period)} {period.period.slice(0, 4)}
                  </span>
                  <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                    closed {period.closedAt?.toISOString().slice(0, 10)}
                    {summary ? ` · v${summary.version}` : ""}
                  </span>
                </div>
                <p className="t-stat mt-1" style={{ color: "var(--color-ledger)" }}>
                  {total.whole}
                  <span className="cents">.{total.frac}</span>
                </p>
                {summary ? (
                  <>
                    <p className="t-secondary mt-1">
                      {summary.confirmedCount} confirmed{" "}
                      {summary.confirmedCount === 1 ? "entry" : "entries"} ·{" "}
                      {formatCents(summary.taxCents, summary.currency)} tax
                      {summary.unreviewedCount > 0
                        ? ` · ${summary.unreviewedCount} unreviewed and excluded`
                        : ""}
                    </p>

                    <div className="mt-4 hairline-t">
                      {summary.totalsByCategory.map((category) => (
                        <div
                          key={category.slug}
                          className="flex items-baseline justify-between gap-3 border-b py-3"
                          style={{ borderColor: "var(--color-line)" }}
                        >
                          <span className="min-w-0">
                            <span className="t-body block truncate">{category.name}</span>
                            <span className="t-data block" style={{ color: "var(--color-fg-3)" }}>
                              Schedule C {category.scheduleCLine} ·{" "}
                              {percentOf(category.amountCents, summary.totalCents)}%
                            </span>
                          </span>
                          <span className="t-mono shrink-0 text-[15px]">
                            {formatCents(category.amountCents, summary.currency)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <span className="t-label">Downloads</span>
                      <div className="mt-2 hairline-t">
                        {DOWNLOADS.filter(
                          (d) => exportsAllowed || (d.kind !== "qbo" && d.kind !== "xero"),
                        ).map((download) => (
                          <a
                            key={download.kind}
                            href={`/api/share/${token}/${period.period}/${download.kind}`}
                            className="flex min-h-[52px] items-center gap-3 border-b py-3"
                            style={{ borderColor: "var(--color-line)", color: "var(--color-fg)" }}
                          >
                            <IconDownload size={18} style={{ color: "var(--color-ledger)" }} />
                            <span className="t-body">{download.label}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="t-secondary mt-2">This package is still being built.</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="t-secondary mt-10" style={{ color: "var(--color-fg-3)" }}>
        Categories follow IRS Schedule C line numbers. Every download on this page is
        logged and visible to {org.name}. This link expires{" "}
        {link.expiresAt.toISOString().slice(0, 10)}.
      </p>
    </main>
  );
}
