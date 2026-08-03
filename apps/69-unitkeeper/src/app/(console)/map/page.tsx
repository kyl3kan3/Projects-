/**
 * /map — the yard (DESIGN.md screen 1).
 *
 * The grid from `map_position`, filled by derived status; the occupancy line in the
 * header; filter chips for the three questions an owner asks at 8am (who is
 * overdue, which units are in a lien case, what is vacant in each size); and the
 * map editor behind a disclosure so it is available without being in the way.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { AddRowForm } from "@/app/(console)/map/MapEditor";
import { NewFacilityForm } from "@/app/(console)/map/NewFacilityForm";
import { MapLegend, UnitMap, type MapUnit } from "@/components/UnitMap";
import type { UnitStatus } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { formatMoney, isoDateOf } from "@/lib/money";
import { facilityReport, occupancyLine } from "@/lib/reports";
import { facilitiesFor, mapCards, UNIT_SIZES } from "@/lib/units";

export const metadata: Metadata = { title: "The yard" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "lien", label: "Lien" },
  { key: "vacant", label: "Vacant" },
  { key: "unsigned", label: "Unsigned lease" },
] as const;

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; filter?: string; size?: string; flipped?: string }>;
}) {
  const { owner } = await requireOwner();
  const params = await searchParams;
  const facilities = await facilitiesFor(owner.id);

  if (facilities.length === 0) {
    return (
      <main style={{ padding: "24px 20px 40px", maxWidth: 560 }}>
        <h1 className="t-display">Start with the facility</h1>
        <p className="t-body" style={{ marginTop: 8, marginBottom: 24, color: "var(--color-dim)" }}>
          Name it, tell UnitKeeper which state it is in — the state is what drives the lien clock —
          and then draw the rows. Ten minutes, once.
        </p>
        <NewFacilityForm />
      </main>
    );
  }

  const facility =
    facilities.find((f) => f.id === params.facility) ?? facilities[0];
  const asOf = isoDateOf(new Date());
  const cards = await mapCards(facility.id, asOf);
  const report = await facilityReport(facility, asOf);
  const line = occupancyLine(report);

  const counts: Record<UnitStatus, number> = {
    vacant: 0,
    occupied: 0,
    overdue: 0,
    lien: 0,
    maintenance: 0,
  };
  for (const card of cards) counts[card.status] += 1;

  const filter = (params.filter ?? "all") as (typeof FILTERS)[number]["key"];
  const sizeFilter = params.size ?? "";
  const filtered = cards.filter((card) => {
    if (sizeFilter && card.unit.size !== sizeFilter) return false;
    if (filter === "all") return true;
    if (filter === "unsigned") return card.awaitingSignature;
    return card.status === filter;
  });

  const mapUnits: MapUnit[] = filtered.map((card) => ({
    id: card.unit.id,
    label: card.unit.label,
    size: card.unit.size,
    status: card.status,
    position: card.position,
    tenantName: card.tenant?.name ?? null,
    balanceCents: card.delinquency
      ? card.delinquency.outstandingCents - card.delinquency.creditCents
      : 0,
    daysLate: card.delinquency?.daysLate ?? 0,
    awaitingSignature: card.awaitingSignature,
  }));

  const nextRow =
    cards.reduce((max, card) => Math.max(max, card.position.row), 0) + 1;
  const prefix = String.fromCharCode(64 + Math.min(26, nextRow));

  const query = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ facility: facility.id });
    if (filter !== "all") sp.set("filter", filter);
    if (sizeFilter) sp.set("size", sizeFilter);
    for (const [k, v] of Object.entries(patch)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    return `/map?${sp.toString()}`;
  };

  return (
    <main style={{ padding: "20px 20px 40px" }}>
      <div className="flex items-baseline justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <h1 className="t-h2">{facility.name}</h1>
        <p className="t-mono-lg">
          {line.left} — {line.right}
        </p>
      </div>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {facility.state} · {report.delinquentUnits} unit
        {report.delinquentUnits === 1 ? "" : "s"} past due, {formatMoney(report.delinquentCents)}{" "}
        outstanding · {formatMoney(report.vacantPotentialCents)}/mo sitting empty
      </p>

      {facilities.length > 1 ? (
        <div className="chip-row" style={{ marginTop: 16 }}>
          {facilities.map((f) => (
            <Link
              key={f.id}
              className="chip"
              data-active={f.id === facility.id}
              href={`/map?facility=${f.id}`}
            >
              {f.name}
            </Link>
          ))}
        </div>
      ) : null}

      {cards.length === 0 ? (
        <section style={{ marginTop: 32, maxWidth: 560 }}>
          <h2 className="t-h2">Draw your map — rows and unit sizes, ten minutes</h2>
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 20 }}>
            One form per row. A 160-unit yard is usually six rows: a letter, how many doors, the
            size, the street rate.
          </p>
          <AddRowForm facilityId={facility.id} nextRow={1} suggestedPrefix="A" />
        </section>
      ) : (
        <>
          <div className="chip-row" style={{ marginTop: 20 }}>
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                className="chip"
                data-active={filter === f.key}
                href={query({ filter: f.key === "all" ? "" : f.key })}
              >
                {f.label}
                {f.key === "overdue" && counts.overdue > 0 ? ` ${counts.overdue}` : ""}
                {f.key === "lien" && counts.lien > 0 ? ` ${counts.lien}` : ""}
                {f.key === "vacant" && counts.vacant > 0 ? ` ${counts.vacant}` : ""}
              </Link>
            ))}
          </div>
          <div className="chip-row" style={{ marginTop: 8 }}>
            <Link className="chip" data-active={!sizeFilter} href={query({ size: "" })}>
              Every size
            </Link>
            {UNIT_SIZES.filter((size) => cards.some((c) => c.unit.size === size)).map((size) => (
              <Link
                key={size}
                className="chip"
                data-active={sizeFilter === size}
                href={query({ size })}
              >
                {size}
              </Link>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            {mapUnits.length === 0 ? (
              <p className="t-secondary" style={{ padding: "24px 0" }}>
                Nothing matches that filter. {counts.overdue === 0 && filter === "overdue"
                  ? "Nobody is past due today — that is the good version of an empty screen."
                  : "Try another filter."}
              </p>
            ) : (
              <UnitMap units={mapUnits} flippedUnitId={params.flipped ?? null} />
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <MapLegend counts={counts} />
          </div>

          <details style={{ marginTop: 32 }}>
            <summary className="t-title" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
              Add another row
            </summary>
            <div style={{ marginTop: 16, maxWidth: 560 }}>
              <AddRowForm
                facilityId={facility.id}
                nextRow={nextRow}
                suggestedPrefix={prefix}
              />
            </div>
          </details>
        </>
      )}
    </main>
  );
}
