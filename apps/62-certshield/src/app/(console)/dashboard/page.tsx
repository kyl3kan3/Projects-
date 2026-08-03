import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { reviewQueueCount } from "@/lib/certificates";
import { engagementViews, lapsingWithin, orgToday, rollup } from "@/lib/verdicts";
import { listProperties, vendorsWithoutEngagements } from "@/lib/vendors";
import { formatDate, relativeDays } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/compliance";
import { VerdictPlacard } from "@/components/VerdictPlacard";
import { DeficiencyList } from "@/components/DeficiencyList";
import { IconChevron } from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The portfolio rollup. Plain numbers, a this-month lapse list, and the review
 * queue — files, not dashboards (DESIGN.md screen 1). No donut charts.
 *
 * Every count here is derived at request time from the current templates and
 * coverages, not read from a stored status column, so "expired" means expired as of
 * this page load rather than as of whenever a job last ran.
 */
export default async function DashboardPage() {
  const { org } = await requireUser();
  const views = await engagementViews(org);
  const counts = rollup(views);
  const lapsing = lapsingWithin(views, 30);
  const reviewCount = await reviewQueueCount(org.id);
  const properties = await listProperties(org.id);
  const untracked = await vendorsWithoutEngagements(org.id);
  const today = orgToday(org);

  const failing = views
    .filter((v) => v.verdict.status !== "compliant" && v.verdict.status !== "expiring")
    .sort((a, b) => {
      const rank = { expired: 0, missing: 1, deficient: 2 } as Record<string, number>;
      return (rank[a.verdict.status] ?? 3) - (rank[b.verdict.status] ?? 3);
    });

  const stats: Array<{ label: string; value: number; href?: string; tone?: string }> = [
    { label: STATUS_LABEL.compliant, value: counts.compliant },
    { label: STATUS_LABEL.expiring, value: counts.expiring, tone: "var(--color-pending)" },
    { label: STATUS_LABEL.deficient, value: counts.deficient, tone: "var(--color-claim)" },
    { label: STATUS_LABEL.expired, value: counts.expired, tone: "var(--color-claim)" },
    { label: "No certificate", value: counts.missing, tone: "var(--color-claim)" },
    { label: "In review", value: reviewCount, href: "/review", tone: "var(--color-pending)" },
  ];

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <p className="t-label">Portfolio as of {formatDate(today)}</p>
      <h1 className="t-display" style={{ marginTop: 4 }}>
        {counts.blocked === 0
          ? "Every engagement is covered."
          : `${counts.blocked} engagement${counts.blocked === 1 ? "" : "s"} would fail an audit today.`}
      </h1>
      <p className="t-secondary" style={{ marginTop: 8, maxWidth: "62ch" }}>
        {counts.total} active engagement{counts.total === 1 ? "" : "s"} across {properties.length}{" "}
        {properties.length === 1 ? "property or project" : "properties and projects"}. Verdicts are
        computed now, from the certificates on file against the requirement each engagement is held
        to.
      </p>

      {/* The rollup. Plain numbers on hairline-divided cells, not cards in cards. */}
      <section
        className="panel"
        style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(2, 1fr)" }}
      >
        {stats.map((stat, i) => {
          const cell = (
            <>
              {/* A zero is not a warning: the semantic tone only applies to a
                  count that is actually non-zero. */}
              <span
                className="t-stat"
                style={{ color: stat.value > 0 ? (stat.tone ?? "var(--color-ink)") : "var(--color-dim)" }}
              >
                {stat.value}
              </span>
              <span className="t-label" style={{ marginTop: 6, display: "block" }}>
                {stat.label}
              </span>
            </>
          );
          const style: React.CSSProperties = {
            padding: 16,
            borderTop: i > 1 ? "1px solid var(--color-line)" : undefined,
            borderLeft: i % 2 === 1 ? "1px solid var(--color-line)" : undefined,
          };
          return stat.href ? (
            <Link
              key={stat.label}
              href={stat.href}
              className="no-underline"
              style={{ ...style, color: "inherit" }}
            >
              {cell}
            </Link>
          ) : (
            <div key={stat.label} style={style}>
              {cell}
            </div>
          );
        })}
      </section>

      {/* Lapsing this month — the list that stops a claim. */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-h2">Lapses in the next 30 days</h2>
        {lapsing.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing lapses in the next 30 days. The renewal ladder fires at 30, 14, 7 and 1 day
            before each expiry, so this list fills itself in.
          </p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {lapsing.map((view) => (
              <Link
                key={view.engagement.id}
                href={`/vendors/${view.vendor.id}`}
                className="row no-underline"
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {view.vendor.name}
                  </span>
                  <span className="t-secondary">
                    {view.property.name}
                    {view.vendor.trade ? ` · ${view.vendor.trade}` : ""}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span
                    className="t-mono"
                    style={{
                      display: "block",
                      color:
                        (view.verdict.daysToExpiry ?? 99) <= 7
                          ? "var(--color-claim)"
                          : "var(--color-pending)",
                    }}
                  >
                    {relativeDays(view.verdict.daysToExpiry ?? 0)}
                  </span>
                  <span className="t-secondary">{formatDate(view.verdict.soonestExpiry)}</span>
                </span>
                <IconChevron size={18} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Who is failing, and the sentence that says why. */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-h2">Not compliant</h2>
        {failing.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No engagement is deficient, expired, or missing a certificate. Every vendor on every
            property has coverage that meets its requirement.
          </p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {failing.map((view) => (
              <div
                key={view.engagement.id}
                className="hairline-b"
                style={{ padding: "16px 0" }}
              >
                <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
                  <Link
                    href={`/vendors/${view.vendor.id}`}
                    className="t-title no-underline"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {view.vendor.name}
                  </Link>
                  <VerdictPlacard status={view.verdict.status} />
                </div>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  {view.property.name} · held to {view.template.name}
                </p>
                <DeficiencyList
                  deficiencies={view.verdict.deficiencies}
                  grouped={false}
                  className="mt-2"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {untracked.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-h2">Not tracked anywhere</h2>
          <p className="t-secondary" style={{ marginTop: 8, maxWidth: "62ch" }}>
            {untracked.length} vendor{untracked.length === 1 ? " is" : "s are"} in the registry with
            no engagement, so nothing is being checked for them. Attach each one to the property or
            project it works on.
          </p>
          <div style={{ marginTop: 8 }}>
            {untracked.slice(0, 6).map((vendor) => (
              <Link key={vendor.id} href={`/vendors/${vendor.id}`} className="row no-underline">
                <span className="t-title" style={{ flex: 1 }}>
                  {vendor.name}
                </span>
                <span className="t-secondary">{vendor.trade ?? "No trade"}</span>
                <IconChevron size={18} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {counts.total === 0 && (
        <section className="panel" style={{ marginTop: 32, padding: 20 }}>
          <h2 className="t-h2">Nothing is being tracked yet</h2>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Import your vendors from CSV, add the properties or projects they work on, then send
            upload links. The first verdict lands as soon as a certificate is parsed.
          </p>
          <div className="flex" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <Link href="/vendors/import" className="btn btn-primary">
              Import vendors from CSV
            </Link>
            <Link href="/properties" className="btn btn-secondary">
              Add a property
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
