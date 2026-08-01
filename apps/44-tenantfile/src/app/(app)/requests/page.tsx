import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { costByUnit, landlordRequests, priorityLabel, requestStatusLabel } from "@/lib/maintenance";
import { formatMoney } from "@/lib/money";
import { IconChevronRight } from "@/components/icons";

export const metadata: Metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const { landlord } = await requireLandlord();
  const [rows, spend] = await Promise.all([landlordRequests(landlord.id), costByUnit(landlord.id)]);

  const open = rows.filter((r) => r.request.status === "open" || r.request.status === "scheduled");
  const done = rows.filter((r) => r.request.status === "done" || r.request.status === "closed");
  const totalSpend = spend.reduce((s, u) => s + u.totalCents, 0);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Maintenance</p>
        <h1 className="t-h2 mt-1">
          {open.length === 0 ? "Nothing open" : `${open.length} open`}
        </h1>
        <p className="t-secondary mt-1">
          {rows.length === 0
            ? "Requests your tenants open from their rent page land here, with the photos."
            : `${rows.length} in total · ${formatMoney(totalSpend)} recorded spend`}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="card p-4">
          <p className="t-title">No requests yet.</p>
          <p className="t-secondary mt-2">
            Every tenant&apos;s rent page has a &quot;something needs fixing&quot; form. What they send — words and
            photographs — becomes a thread here and a line in that tenancy&apos;s file.
          </p>
        </div>
      ) : null}

      {open.length > 0 ? <RequestList title="Open" rows={open} /> : null}
      {done.length > 0 ? <RequestList title="Finished" rows={done} /> : null}

      {spend.filter((s) => s.requests > 0).length > 0 ? (
        <section className="mt-8">
          <h2 className="t-label mb-3">Spend by unit</h2>
          {spend
            .filter((s) => s.requests > 0)
            .map((unit) => (
              <div key={unit.unitId} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">
                    {unit.address} <span className="t-data">{unit.label}</span>
                  </span>
                  <span className="t-secondary block">
                    {unit.requests} request{unit.requests === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="t-data">{formatMoney(unit.totalCents)}</span>
              </div>
            ))}
        </section>
      ) : null}
    </main>
  );
}

function RequestList({
  title,
  rows,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof landlordRequests>>;
}) {
  return (
    <section className="mb-8">
      <h2 className="t-label mb-3">
        {title} · {rows.length}
      </h2>
      <div className="stagger">
        {rows.map(({ request, unit, property, tenancy }, i) => (
          <Link
            key={request.id}
            href={`/requests/${request.id}`}
            className="row no-underline"
            style={{ "--i": i } as React.CSSProperties}
          >
            <span
              className="dot"
              data-state={request.status === "open" ? (request.priority === "emergency" ? "broken" : "open") : "paid"}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="t-title block truncate">{request.title}</span>
              <span className="t-secondary block truncate" style={{ color: "var(--color-text-3)" }}>
                {property.address} <span className="t-data">{unit.label}</span> · {tenancy.tenantNames[0] ?? "Tenant"} ·{" "}
                {requestStatusLabel(request.status)}
                {request.priority !== "routine" ? ` · ${priorityLabel(request.priority)}` : ""}
              </span>
            </span>
            {request.landlordUnread > 0 ? <span className="dot" data-state="accent" aria-label="Unread messages" /> : null}
            {request.costCents != null ? <span className="t-data">{formatMoney(request.costCents)}</span> : null}
            <IconChevronRight size={18} />
          </Link>
        ))}
      </div>
    </section>
  );
}
