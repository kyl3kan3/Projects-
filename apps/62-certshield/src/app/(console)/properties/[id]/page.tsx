import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeDays } from "@/lib/dates";
import { formatCents } from "@/lib/format";
import { engagementViews, rollup } from "@/lib/verdicts";
import { propertyById } from "@/lib/vendors";
import { DeficiencyList } from "@/components/DeficiencyList";
import { VerdictPlacard } from "@/components/VerdictPlacard";
import { IconDownload } from "@/components/icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { org } = await requireUser();
  const property = await propertyById(org.id, (await params).id);
  return { title: property?.name ?? "Property" };
}

/**
 * The compliance matrix for one property, ruled both axes like a filing form, and
 * the one-click binder export (README MVP item 9).
 *
 * The matrix scrolls inside its own container at 390px rather than making the page
 * scroll sideways.
 */
export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUser();
  const { id } = await params;
  const property = await propertyById(org.id, id);
  if (!property) notFound();

  const views = await engagementViews(org, { propertyId: property.id });
  const counts = rollup(views);

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <Link href="/properties" className="btn-quiet">
        All properties
      </Link>
      <h1 className="t-display" style={{ marginTop: 12 }}>
        {property.name}
      </h1>
      <p className="t-secondary" style={{ marginTop: 6 }}>
        {property.kind === "project" ? "Project" : "Property"}
        {property.address ? ` · ${property.address}` : ""}
      </p>

      <div className="flex" style={{ gap: 8, marginTop: 20, flexWrap: "wrap" }}>
        <a
          href={`/api/binders/${property.id}`}
          className="btn btn-primary"
          target="_blank"
          rel="noreferrer"
        >
          <IconDownload size={18} />
          Export audit binder
        </a>
        <a href={`/api/binders/${property.id}?format=csv`} className="btn btn-secondary">
          Matrix as CSV
        </a>
      </div>
      <p className="field-help" style={{ maxWidth: "62ch" }}>
        The binder is one PDF: the compliance matrix, every deficiency sentence in full, and the
        current certificate for each vendor with its sha256 — the audit answer in one object.
      </p>

      <p className="t-secondary" style={{ marginTop: 24 }}>
        {counts.total} engagement{counts.total === 1 ? "" : "s"} ·{" "}
        {counts.compliant} compliant · {counts.expiring} expiring ·{" "}
        <span style={{ color: counts.blocked ? "var(--color-claim)" : undefined }}>
          {counts.blocked} would fail an audit
        </span>
      </p>

      {views.length === 0 ? (
        <div className="panel" style={{ marginTop: 20, padding: 20 }}>
          <p className="t-title">No vendors engaged here yet</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Attach vendors to this {property.kind} from their vendor page, or import a CSV with a
            Properties column naming it.
          </p>
          <Link href="/vendors" className="btn btn-secondary" style={{ marginTop: 16 }}>
            Go to vendors
          </Link>
        </div>
      ) : (
        <>
          <div className="matrix-wrap" style={{ marginTop: 20 }}>
            <table className="matrix">
              <caption className="t-label" style={{ textAlign: "left", paddingBottom: 8 }}>
                Compliance matrix — {formatDate(formatToday(org.timezone))}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Vendor</th>
                  <th scope="col">Trade</th>
                  <th scope="col">Requirement</th>
                  <th scope="col">Verdict</th>
                  <th scope="col">Coverage to</th>
                  <th scope="col">GL each occ.</th>
                </tr>
              </thead>
              <tbody>
                {views.map((view) => {
                  const gl = view.coverages.find((c) => c.kind === "gl_each_occurrence");
                  return (
                    <tr key={view.engagement.id}>
                      <td>
                        <Link
                          href={`/vendors/${view.vendor.id}`}
                          className="no-underline"
                          style={{ color: "var(--color-ink)", fontWeight: 500 }}
                        >
                          {view.vendor.name}
                        </Link>
                      </td>
                      <td>{view.vendor.trade ?? "—"}</td>
                      <td>{view.template.name}</td>
                      <td>
                        <VerdictPlacard status={view.verdict.status} sealSize={16} />
                      </td>
                      <td className="num">
                        {view.verdict.soonestExpiry
                          ? `${formatDate(view.verdict.soonestExpiry)} (${relativeDays(
                              view.verdict.daysToExpiry ?? 0,
                            )})`
                          : "—"}
                      </td>
                      <td className="num">{formatCents(gl?.limitCents ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section style={{ marginTop: 32 }}>
            <h2 className="t-h2">Named deficiencies</h2>
            {views.every((v) => v.verdict.deficiencies.length === 0) ? (
              <p className="t-secondary" style={{ marginTop: 8 }}>
                Nothing is deficient at this {property.kind}. Every required line is evidenced, within
                its window, and at or above its minimum.
              </p>
            ) : (
              views
                .filter((v) => v.verdict.deficiencies.length > 0)
                .map((view) => (
                  <div key={view.engagement.id} className="hairline-b" style={{ padding: "16px 0" }}>
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
                    <DeficiencyList deficiencies={view.verdict.deficiencies} className="mt-2" />
                  </div>
                ))
            )}
          </section>
        </>
      )}
    </main>
  );
}

function formatToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
