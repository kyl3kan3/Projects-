import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { engagementViews } from "@/lib/verdicts";
import { listVendors } from "@/lib/vendors";
import { vendorCap } from "@/lib/plans";
import { verdictSummary } from "@/lib/compliance";
import { VerdictPlacard } from "@/components/VerdictPlacard";
import { IconChevron, IconPlus } from "@/components/icons";
import type { VerdictStatus } from "@/db/schema";

export const metadata: Metadata = { title: "Vendors" };

/**
 * The registry (DESIGN.md screen 2): name, trade, engagement count, the verdict
 * placard with the seal where it is earned. Filters by status and trade are plain
 * links, so a filtered view is a URL a coordinator can bookmark or send.
 *
 * A vendor's row verdict is the **worst** of its engagements: the same roofer can
 * be compliant at one property and deficient at another, and the row that shows the
 * better of the two is the row that lets a claim through.
 */
const RANK: Record<VerdictStatus, number> = {
  expired: 0,
  missing: 1,
  deficient: 2,
  expiring: 3,
  compliant: 4,
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; trade?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;
  const vendors = await listVendors(org.id);
  const views = await engagementViews(org);
  const cap = vendorCap(org.plan, vendors.length);

  const byVendor = new Map<string, typeof views>();
  for (const view of views) {
    const list = byVendor.get(view.vendor.id) ?? [];
    list.push(view);
    byVendor.set(view.vendor.id, list);
  }

  const rows = vendors.map((vendor) => {
    const engagements = byVendor.get(vendor.id) ?? [];
    const worst = engagements
      .slice()
      .sort((a, b) => RANK[a.verdict.status] - RANK[b.verdict.status])[0];
    return { vendor, engagements, worst };
  });

  const trades = [...new Set(vendors.map((v) => v.trade).filter((t): t is string => !!t))].sort();

  const filtered = rows.filter((row) => {
    if (params.trade && row.vendor.trade !== params.trade) return false;
    if (!params.status) return true;
    if (params.status === "untracked") return row.engagements.length === 0;
    if (params.status === "failing") {
      return (
        row.worst &&
        row.worst.verdict.status !== "compliant" &&
        row.worst.verdict.status !== "expiring"
      );
    }
    return row.worst?.verdict.status === params.status;
  });

  const filterHref = (next: Record<string, string | undefined>) => {
    const merged = { ...params, ...next };
    const query = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return query ? `/vendors?${query}` : "/vendors";
  };

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <div>
          <h1 className="t-h2">Vendors</h1>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {vendors.length} in the registry
            {cap.limit != null ? ` of ${cap.limit} on the ${org.plan} plan` : ""}
          </p>
        </div>
        <div className="flex" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link href="/vendors/import" className="btn btn-secondary">
            Import CSV
          </Link>
          <Link href="/vendors/new" className="btn btn-primary">
            <IconPlus size={18} />
            Add vendor
          </Link>
        </div>
      </div>

      <div className="chip-row" style={{ marginTop: 20 }}>
        <Link href={filterHref({ status: undefined })} className="chip" data-active={!params.status}>
          All
        </Link>
        <Link
          href={filterHref({ status: "failing" })}
          className="chip"
          data-active={params.status === "failing"}
        >
          Not compliant
        </Link>
        <Link
          href={filterHref({ status: "expiring" })}
          className="chip"
          data-active={params.status === "expiring"}
        >
          Expiring
        </Link>
        <Link
          href={filterHref({ status: "compliant" })}
          className="chip"
          data-active={params.status === "compliant"}
        >
          Compliant
        </Link>
        <Link
          href={filterHref({ status: "untracked" })}
          className="chip"
          data-active={params.status === "untracked"}
        >
          No engagement
        </Link>
      </div>

      {trades.length > 1 && (
        <div className="chip-row" style={{ marginTop: 8 }}>
          <Link href={filterHref({ trade: undefined })} className="chip" data-active={!params.trade}>
            Every trade
          </Link>
          {trades.map((trade) => (
            <Link
              key={trade}
              href={filterHref({ trade })}
              className="chip"
              data-active={params.trade === trade}
            >
              {trade}
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        {filtered.length === 0 ? (
          <div className="panel" style={{ padding: 20 }}>
            <p className="t-title">
              {vendors.length === 0 ? "No vendors yet" : "Nothing matches that filter"}
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              {vendors.length === 0
                ? "Import vendors from CSV, then send upload links. A vendor with no certificate still shows on the dashboard — as missing, which is the point."
                : "Clear the filter to see the whole registry."}
            </p>
            {vendors.length === 0 && (
              <Link href="/vendors/import" className="btn btn-primary" style={{ marginTop: 16 }}>
                Import vendors from CSV
              </Link>
            )}
          </div>
        ) : (
          filtered.map(({ vendor, engagements, worst }) => (
            <Link key={vendor.id} href={`/vendors/${vendor.id}`} className="row no-underline">
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {vendor.name}
                </span>
                <span className="t-secondary">
                  {[
                    vendor.trade ?? "No trade",
                    engagements.length
                      ? `${engagements.length} engagement${engagements.length === 1 ? "" : "s"}`
                      : "No engagement",
                  ].join(" · ")}
                </span>
                {worst && (
                  <span
                    className="t-secondary"
                    style={{
                      display: "block",
                      marginTop: 2,
                      color:
                        worst.verdict.status === "compliant"
                          ? "var(--color-dim)"
                          : "var(--color-claim)",
                    }}
                  >
                    {verdictSummary(worst.verdict)}
                  </span>
                )}
              </span>
              {worst ? (
                <VerdictPlacard status={worst.verdict.status} />
              ) : (
                <span className="placard" data-tone="dim">
                  Untracked
                </span>
              )}
              <IconChevron size={18} />
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
