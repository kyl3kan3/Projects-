import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { getPortfolioFeed } from "@/lib/file-events";
import { landlordTenancies } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { IconDownload } from "@/components/icons";

export const metadata: Metadata = { title: "The File" };
export const dynamic = "force-dynamic";

export default async function FilePage() {
  const { landlord } = await requireLandlord();
  const [feed, tenancies] = await Promise.all([getPortfolioFeed(landlord.id, 60), landlordTenancies(landlord.id)]);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">The File</p>
        <h1 className="t-h2 mt-1">Everything, as it happened</h1>
        <p className="t-secondary mt-1">
          {feed.length === 0
            ? "Nothing on file yet."
            : "Newest first, across every tenancy. Nothing here has been edited since it was written."}
        </p>
      </header>

      {tenancies.length > 0 ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">Export a tenancy</h2>
          {tenancies.map(({ tenancy, unit, property }) => (
            <div key={tenancy.id} className="row">
              <span className="min-w-0 flex-1">
                <Link href={`/tenancies/${tenancy.id}`} className="t-title block truncate no-underline" style={{ color: "inherit" }}>
                  {property.address} <span className="t-data">{unit.label}</span>
                </Link>
                <span className="t-secondary block truncate">{tenancy.tenantNames.join(", ") || "Tenant"}</span>
              </span>
              <a
                className="btn-quiet flex items-center gap-2 no-underline"
                href={`/api/tenancies/${tenancy.id}/export`}
              >
                <IconDownload size={18} />
                PDF
              </a>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <h2 className="t-label mb-3">Recent</h2>
        {feed.length === 0 ? (
          <div className="card p-4">
            <p className="t-title">The file writes itself.</p>
            <p className="t-secondary mt-2">
              Applications, screening authorisations, signatures, every charge, every payment, every reminder sent, every
              repair thread — each one lands here with its date the moment it happens. On the day you need records, they
              exist.
            </p>
          </div>
        ) : (
          <ol className="fileline m-0 list-none p-0">
            {feed.map(({ event, unitLabel, address, tenancyId }, i) => (
              <li
                key={event.id}
                className="file-node"
                data-stitch={i < 4 ? "true" : undefined}
                style={{ "--stitch-delay": `${Math.min(i, 4) * 200}ms` } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-data" style={{ color: "var(--color-text-3)" }}>
                      {event.occurredAt.toISOString().slice(0, 10)} · {address} {unitLabel}
                    </p>
                    <Link href={`/tenancies/${tenancyId}`} className="t-body mt-1 block no-underline" style={{ color: "inherit" }}>
                      {event.summary}
                    </Link>
                    {event.detail ? <p className="t-secondary mt-1">{event.detail}</p> : null}
                  </div>
                  {event.amountCents != null ? <span className="t-data pt-1">{formatMoney(event.amountCents)}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
