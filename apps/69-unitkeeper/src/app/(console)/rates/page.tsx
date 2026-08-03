/**
 * /rates — street rates by size, and existing-tenant increases with their letters
 * (DESIGN.md screen 7).
 *
 * The two halves are deliberately different in weight. A street rate is one number
 * and one button. An existing tenant's increase is a notice with a legal minimum,
 * so it shows the earliest lawful date, generates the letter, and schedules the
 * change for the nightly pass to apply on the day.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull, ne } from "drizzle-orm";
import { CancelChangeForm, RateChangeForm, StreetRateForm } from "@/app/(console)/rates/RateForms";
import { getDb } from "@/db";
import { facilities, tenancies, tenants, units } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { rateChangeNoticeDays } from "@/lib/lien-rules";
import { formatMoney, isoDateOf } from "@/lib/money";
import { earliestEffectiveOn, rateChangesFor, streetRateRows } from "@/lib/rates";
import { facilitiesFor } from "@/lib/units";

export const metadata: Metadata = { title: "Rates" };

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string }>;
}) {
  const { owner } = await requireOwner();
  const params = await searchParams;
  const ownerFacilities = await facilitiesFor(owner.id);

  if (ownerFacilities.length === 0) {
    return (
      <main style={{ padding: "20px 20px 40px", maxWidth: 560 }}>
        <h1 className="t-h2">Rates</h1>
        <p className="t-body" style={{ marginTop: 12 }}>
          Create a facility first — <Link href="/map">start on the map</Link>.
        </p>
      </main>
    );
  }

  const facility = ownerFacilities.find((f) => f.id === params.facility) ?? ownerFacilities[0];
  const asOf = isoDateOf(new Date());
  const sizes = await streetRateRows(facility.id);
  const noticeDays = rateChangeNoticeDays(facility.state);
  const earliest = earliestEffectiveOn(facility.state, asOf);
  const changes = await rateChangesFor(owner.id);

  const liveTenancies = await getDb()
    .select({ tenancy: tenancies, tenant: tenants, unit: units })
    .from(tenancies)
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .innerJoin(tenants, eq(tenancies.tenantId, tenants.id))
    .where(
      and(eq(facilities.id, facility.id), isNull(tenancies.endedOn), ne(tenancies.status, "ended")),
    )
    .orderBy(units.label);

  const scheduled = new Set(
    changes.filter((c) => c.change.status === "noticed").map((c) => c.change.tenancyId),
  );

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 760 }}>
      <h1 className="t-h2">Rates</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {facility.name} · {facility.state} requires {noticeDays} days&rsquo; notice before an
        existing tenant&rsquo;s rent goes up.
      </p>

      {ownerFacilities.length > 1 ? (
        <div className="chip-row" style={{ marginTop: 16 }}>
          {ownerFacilities.map((f) => (
            <Link
              key={f.id}
              className="chip"
              data-active={f.id === facility.id}
              href={`/rates?facility=${f.id}`}
            >
              {f.name}
            </Link>
          ))}
        </div>
      ) : null}

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Street rates by size</h2>
        {sizes.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No units yet. <Link href="/map">Draw the map</Link> first.
          </p>
        ) : (
          <div className="ledger-wrap" style={{ marginTop: 12 }}>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Size</th>
                  <th className="num">Units</th>
                  <th className="num">Vacant</th>
                  <th className="num">Paying now</th>
                  <th>Street rate</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((row) => (
                  <tr key={row.size}>
                    <td className="t-mono">
                      {row.size}
                      <br />
                      <span className="t-secondary">{row.squareFeet} sq ft</span>
                    </td>
                    <td className="num">{row.unitCount}</td>
                    <td className="num">{row.vacantCount}</td>
                    <td className="num">
                      {row.occupiedLowCents === null
                        ? "—"
                        : row.occupiedLowCents === row.occupiedHighCents
                          ? formatMoney(row.occupiedLowCents)
                          : `${formatMoney(row.occupiedLowCents)}–${formatMoney(row.occupiedHighCents ?? 0)}`}
                    </td>
                    <td>
                      <StreetRateForm
                        facilityId={facility.id}
                        size={row.size}
                        rateCents={row.streetRateCents}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-help" style={{ marginTop: 12 }}>
          Setting a street rate changes what a new move-in is quoted. It never touches a signed
          tenancy — that rate is a term of their agreement.
        </p>
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Scheduled changes</h2>
        {changes.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            None. Increases show here from the day the letter is generated until the day they apply.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
            {changes.map(({ change, unitLabel }) => (
              <li className="row" key={change.id}>
                <span style={{ flex: 1 }}>
                  <span className="t-mono">{unitLabel}</span>{" "}
                  <span className="t-secondary">
                    {formatMoney(change.oldCents)} → {formatMoney(change.newCents)} on{" "}
                    {change.effectiveOn}
                  </span>
                </span>
                <span className="placard" data-tone={change.status === "applied" ? "paid" : "overdue"}>
                  {change.status}
                </span>
                {change.status === "noticed" ? <CancelChangeForm changeId={change.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Existing tenants</h2>
        {liveTenancies.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nobody is renting yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
            {liveTenancies.map(({ tenancy, tenant, unit }) => (
              <li className="hairline-b" key={tenancy.id} style={{ padding: "16px 0" }}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-title">
                    <span className="t-mono">{unit.label}</span> · {tenant.name}
                  </p>
                  <span className="t-mono-lg">{formatMoney(tenancy.rateCents)}</span>
                </div>
                {scheduled.has(tenancy.id) ? (
                  <p className="t-secondary" style={{ marginTop: 6 }}>
                    A change is already scheduled — cancel it above before writing another.
                  </p>
                ) : (
                  <details style={{ marginTop: 8 }}>
                    <summary className="btn-quiet" style={{ minHeight: 44, display: "inline-flex" }}>
                      Raise this rent
                    </summary>
                    <div style={{ marginTop: 12, maxWidth: 420 }}>
                      <RateChangeForm
                        tenancyId={tenancy.id}
                        currentCents={tenancy.rateCents}
                        earliest={earliest}
                        noticeDays={noticeDays}
                        state={facility.state}
                      />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
