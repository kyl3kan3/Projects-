import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { landlordUnits, loadLedger } from "@/lib/ledger";
import { collectedForPeriod } from "@/lib/ledger-core";
import { landlordRequests } from "@/lib/maintenance";
import { landlordPipeline } from "@/lib/applications";
import { formatMoney, formatMoneyShort, formatPeriod, isoDateOf, periodOf } from "@/lib/money";
import { IconBell, IconChevronRight, IconPlus } from "@/components/icons";
import { plan } from "@/lib/plans";

export const metadata: Metadata = { title: "Units" };
export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const { landlord } = await requireLandlord();
  const today = isoDateOf(new Date());
  const period = periodOf(today);

  const [units, requests, pipeline] = await Promise.all([
    landlordUnits(landlord.id),
    landlordRequests(landlord.id),
    landlordPipeline(landlord.id),
  ]);

  const tenancyIds = units.map((u) => u.tenancyId).filter((id): id is string => Boolean(id));
  const ledgers = await Promise.all(tenancyIds.map((id) => loadLedger(id, today)));
  const byTenancy = new Map(tenancyIds.map((id, i) => [id, ledgers[i]]));
  const { collectedCents, billedCents } = collectedForPeriod(ledgers, period);

  const openRequests = requests.filter((r) => r.request.status !== "closed" && r.request.status !== "done");
  const newApplications = pipeline.filter((p) => p.application.status === "new");
  const limits = plan(landlord.plan);

  return (
    <main className="screen">
      <header className="flex items-center justify-between pt-8 pb-6">
        <div>
          <p className="t-label">Portfolio</p>
          <h1 className="t-h2 mt-1">{landlord.name}</h1>
        </div>
        <Link
          href="/requests"
          aria-label={`Notifications: ${openRequests.length} open request${openRequests.length === 1 ? "" : "s"}`}
          className="relative flex h-11 w-11 items-center justify-center no-underline"
          style={{ color: "var(--color-ink)" }}
        >
          <IconBell size={22} />
          {openRequests.length > 0 ? (
            <span className="dot absolute right-2 top-2.5" data-state="open" aria-hidden="true" />
          ) : null}
        </Link>
      </header>

      {/* Hero band: collected this month, beside the open-request count. */}
      <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-label">Collected · {formatPeriod(period)}</p>
          <p
            className="t-stat mt-2"
            style={{
              color: billedCents > 0 && collectedCents >= billedCents ? "var(--color-rent-green)" : "var(--color-ink)",
            }}
          >
            {formatMoneyShort(collectedCents)}
          </p>
          <p className="t-secondary mt-1">
            of {formatMoney(billedCents)} charged{billedCents === 0 ? " — nothing billed this month yet" : ""}
          </p>
        </div>
        <p className="t-secondary pb-2">
          {openRequests.length === 0 ? "No open requests" : `${openRequests.length} request${openRequests.length === 1 ? "" : "s"} open`}
        </p>
      </section>

      {newApplications.length > 0 ? (
        <Link href="/applications" className="btn btn-primary btn-full mb-8">
          Review {newApplications.length} application{newApplications.length === 1 ? "" : "s"}
        </Link>
      ) : null}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="t-label">Units</h2>
          <span className="t-data" style={{ color: "var(--color-text-3)" }}>
            {units.length} / {limits.units}
          </span>
        </div>

        {units.length === 0 ? (
          <div className="card mb-6 p-4">
            <p className="t-title">No units yet.</p>
            <p className="t-secondary mt-2">
              Add the first one and you immediately get a listing page you can paste into Craigslist, an application
              form that fills itself in, and a ledger that starts the day the lease is signed.
            </p>
            <Link href="/units/new" className="btn btn-primary btn-full mt-4">
              Add your first unit
            </Link>
          </div>
        ) : (
          <div className="stagger">
            {units.map((unit, i) => {
              const ledger = unit.tenancyId ? byTenancy.get(unit.tenancyId) : null;
              const late = ledger?.oldestDue;
              const state = !unit.tenancyId
                ? unit.listingStatus === "live"
                  ? "listed"
                  : "vacant"
                : late
                  ? "late"
                  : "paid";

              const secondary = unit.tenancyId
                ? late
                  ? `${unit.tenantNames[0] ?? "Tenant"} · ${formatMoney(late.outstandingCents)} owing since ${late.charge.dueOn}`
                  : `${unit.tenantNames[0] ?? "Tenant"} · paid to date`
                : unit.listingStatus === "live"
                  ? `VACANT · ${unit.applicationCount} application${unit.applicationCount === 1 ? "" : "s"}`
                  : "VACANT · not listed";

              return (
                <Link
                  key={unit.unitId}
                  href={unit.tenancyId ? `/tenancies/${unit.tenancyId}` : `/units/${unit.unitId}`}
                  className="row"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <span className="dot" data-state={state} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">
                      {unit.address} <span className="t-data">{unit.label}</span>
                    </span>
                    <span className="t-secondary block truncate" style={{ color: "var(--color-text-3)" }}>
                      {secondary}
                    </span>
                  </span>
                  <span className="t-data">{formatMoneyShort(unit.rentCents)}</span>
                  <IconChevronRight size={18} className="shrink-0" />
                </Link>
              );
            })}
          </div>
        )}

        {units.length > 0 ? (
          <Link href="/units/new" className="btn btn-secondary btn-full mt-6">
            <IconPlus size={18} />
            Add a unit
          </Link>
        ) : null}
      </section>
    </main>
  );
}
