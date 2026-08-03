/**
 * /delinquency — the ladder board (DESIGN.md screen 5).
 *
 * Tenancies ordered by how late they are, each with the rungs that have fired, the
 * next automatic step and the date it fires, and — where the state has a reviewed
 * rule pack and the ladder says the account is lien-eligible — a hold-to-confirm
 * button to open a case. Nothing on this screen fires by itself; the nightly pass
 * does that, and the button here runs the pass on demand.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { OpenLienCaseForm, RunPassForm } from "@/app/(console)/delinquency/BoardForms";
import { requireOwner } from "@/lib/auth";
import { actionPlacard } from "@/lib/ladder";
import { delinquentRows } from "@/lib/ladder-run";
import { canUseLienEngine } from "@/lib/plans";
import { packFor } from "@/lib/lien-rules";
import { formatDate, formatMoney, isoDateOf } from "@/lib/money";

export const metadata: Metadata = { title: "Delinquency" };

export default async function DelinquencyPage() {
  const { owner, ent } = await requireOwner();
  const asOf = isoDateOf(new Date());
  const rows = await delinquentRows(owner.id, asOf);
  const lienGate = canUseLienEngine(ent);

  const total = rows.reduce((sum, r) => sum + r.delinquency.outstandingCents, 0);

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 760 }}>
      <div className="flex items-baseline justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <h1 className="t-h2">Past due</h1>
        <p className="t-mono-lg">{formatMoney(total)}</p>
      </div>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {rows.length === 0
          ? "Nobody owes anything today."
          : `${rows.length} unit${rows.length === 1 ? "" : "s"} · every step below is pinned to a fixed number of days from the day the tenant went late, and each one fires exactly once.`}
      </p>

      <div style={{ marginTop: 16 }}>
        <RunPassForm />
      </div>

      {rows.length === 0 ? (
        <p className="t-body" style={{ marginTop: 32 }}>
          The ladder has nothing to climb. When a payment fails, this board fills in by itself and
          tells you what happens next and when.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 24 }}>
          {rows.map((row) => {
            const pack = packFor(row.facility.state);
            const eligible = row.lienEligible && Boolean(pack) && lienGate.allowed;
            const reason = !pack
              ? `${row.facility.state} has no reviewed rule pack — run the manual checklist.`
              : !lienGate.allowed
                ? lienGate.reason
                : !row.lienEligible
                  ? "Not lien-eligible yet — the ladder's lien-eligible day has not passed."
                  : undefined;
            return (
              <li
                key={row.tenancy.id}
                className="hairline-b"
                style={{ padding: "16px 0" }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/units/${row.unit.id}`} className="t-title" style={{ textDecoration: "none" }}>
                    <span className="t-mono-lg">{row.unit.label}</span> · {row.tenant.name}
                  </Link>
                  <span className="t-mono-lg">{formatMoney(row.delinquency.outstandingCents)}</span>
                </div>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  {row.delinquency.daysLate} day{row.delinquency.daysLate === 1 ? "" : "s"} late
                  {row.delinquency.since ? ` from ${formatDate(row.delinquency.since, { year: true })}` : ""}
                  {" · "}
                  {row.facility.name}
                  {row.tenancy.gateCodeStatus === "overlocked" ? " · overlocked" : ""}
                </p>

                <p className="t-mono" style={{ marginTop: 8, color: "var(--color-dim)" }}>
                  {row.firedRungs.length === 0
                    ? "no steps fired yet"
                    : row.firedRungs
                        .map((r) => `${r.firedOn} day ${r.day} ${actionPlacard(r.action)}`)
                        .join("  ·  ")}
                </p>

                {row.nextRung && row.nextRungOn ? (
                  <p className="t-secondary" style={{ marginTop: 6 }}>
                    Next: <strong>{actionPlacard(row.nextRung.action)}</strong> on{" "}
                    <span className="t-mono">{row.nextRungOn}</span> (day {row.nextRung.day})
                  </p>
                ) : (
                  <p className="t-secondary" style={{ marginTop: 6 }}>
                    The ladder is finished. Nothing else fires automatically.
                  </p>
                )}

                <div style={{ marginTop: 12 }}>
                  {row.lienCaseId ? (
                    <Link className="btn btn-secondary" href={`/liens/${row.lienCaseId}`}>
                      Open the lien file
                    </Link>
                  ) : (
                    <OpenLienCaseForm
                      tenancyId={row.tenancy.id}
                      disabled={!eligible}
                      disabledReason={reason}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
