/**
 * /liens — every case, with where its clock is.
 *
 * The one number that matters on this screen is the sale date, and it is stated as a
 * date rather than a countdown: "not before June 28, 2026" is what a court reads.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { facilities, lienCases, lienRules, tenancies, tenants, units } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { buildTimeline, type StepsState } from "@/lib/lien-engine";
import { manualModeSentence, REVIEWED_STATES, type RuleStep } from "@/lib/lien-rules";
import { formatDateLong, isoDateOf } from "@/lib/money";
import { canUseLienEngine } from "@/lib/plans";
import { facilitiesFor } from "@/lib/units";

export const metadata: Metadata = { title: "Lien files" };

export default async function LiensPage() {
  const { owner, ent } = await requireOwner();
  const gate = canUseLienEngine(ent);
  const asOf = isoDateOf(new Date());

  const rows = await getDb()
    .select({
      lienCase: lienCases,
      rule: lienRules,
      unit: units,
      tenant: tenants,
      facility: facilities,
    })
    .from(lienCases)
    .innerJoin(lienRules, eq(lienCases.ruleVersionId, lienRules.id))
    .innerJoin(tenancies, eq(lienCases.tenancyId, tenancies.id))
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .innerJoin(tenants, eq(tenancies.tenantId, tenants.id))
    .where(
      and(
        eq(facilities.ownerId, owner.id),
        inArray(lienCases.status, ["open", "paused", "sale_eligible", "resolved", "closed"]),
      ),
    )
    .orderBy(lienCases.createdAt);

  const ownerFacilities = await facilitiesFor(owner.id);
  const unreviewed = ownerFacilities.filter((f) => !REVIEWED_STATES.includes(f.state));

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 760 }}>
      <h1 className="t-h2">Lien files</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        UnitKeeper computes the statutory dates from the day the tenant went delinquent, prints the
        notices, and refuses steps that are not lawful yet. It never takes a step for you, and it is
        not your lawyer.
      </p>

      {!gate.allowed ? (
        <p className="rail-stop" style={{ marginTop: 20 }}>
          {gate.reason} <Link href="/settings/billing">See plans</Link>
        </p>
      ) : null}

      {unreviewed.map((facility) => (
        <p className="rail-stop" style={{ marginTop: 20 }} key={facility.id}>
          {facility.name}: {manualModeSentence(facility.state)}
        </p>
      ))}

      {rows.length === 0 ? (
        <p className="t-body" style={{ marginTop: 32 }}>
          No cases. They open from the <Link href="/delinquency">delinquency board</Link>, and only
          once the ladder says the account is lien-eligible.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 24 }}>
          {rows.map((row) => {
            const timeline = buildTimeline(
              { steps: (row.rule.steps ?? []) as RuleStep[] },
              row.lienCase.delinquentSince,
              (row.lienCase.stepsState ?? {}) as StepsState,
              asOf,
            );
            const done = timeline.steps.filter((s) => s.completedOn).length;
            return (
              <li key={row.lienCase.id} className="hairline-b" style={{ padding: "16px 0" }}>
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/liens/${row.lienCase.id}`}
                    className="t-title"
                    style={{ textDecoration: "none" }}
                  >
                    <span className="t-mono-lg">{row.unit.label}</span> · {row.tenant.name}
                  </Link>
                  <span
                    className="placard"
                    data-tone={
                      row.lienCase.status === "sale_eligible"
                        ? "lien"
                        : row.lienCase.status === "resolved" || row.lienCase.status === "closed"
                          ? "paid"
                          : "overdue"
                    }
                  >
                    {row.lienCase.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  {row.rule.state} rule pack v{row.rule.version} · delinquent since{" "}
                  {row.lienCase.delinquentSince} · {done} of {timeline.steps.length} steps recorded
                </p>
                <p className="t-mono" style={{ marginTop: 6 }}>
                  Sale not before {formatDateLong(timeline.saleEligibleOn)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
