/**
 * /units/[id] — the unit file (DESIGN.md screen 2).
 *
 * Everything about one door, in the order an owner asks for it: who is in it and
 * what they owe, the ledger with a running balance, the gate code, the ladder that
 * has fired, the lien rail if a case is open, the documents, then the unit's own
 * settings. Hairline-divided sections, no boxes inside boxes.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LienRail } from "@/components/LienRail";
import {
  AdjustmentForm,
  GateCodeForm,
  RecordPaymentForm,
  RefundForm,
  StatementForm,
  UnitEditForm,
} from "@/app/(console)/units/[id]/UnitForms";
import { requireOwner } from "@/lib/auth";
import { documentUrl } from "@/lib/storage";
import { actionPlacard, nextRung } from "@/lib/ladder";
import { ladderHistory } from "@/lib/ladder-run";
import { delinquency, kindLabel } from "@/lib/ledger-core";
import { entriesFor, runningRowsFor, toCoreEntries } from "@/lib/ledger";
import { openCaseForTenancy } from "@/lib/lien";
import { manualModeSentence, packFor } from "@/lib/lien-rules";
import { addDays, formatDate, formatMoney, isoDateOf } from "@/lib/money";
import { noticesFor } from "@/lib/notices";
import { activeTenancyForUnit, ownedUnit, STATUS_LABEL } from "@/lib/units";
import { readSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Unit file" };

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { owner } = await requireOwner();
  const { id } = await params;
  const found = await ownedUnit(owner.id, id);
  if (!found) notFound();

  const { unit, facility } = found;
  const asOf = isoDateOf(new Date());
  const settings = readSettings(owner.settings);
  const live = await activeTenancyForUnit(unit.id);

  if (!live) {
    return (
      <main style={{ padding: "20px 20px 40px", maxWidth: 640 }}>
        <Link href={`/map?facility=${facility.id}`} className="t-secondary">
          ← {facility.name}
        </Link>
        <div className="flex items-baseline justify-between gap-3" style={{ marginTop: 8 }}>
          <h1 className="t-h2">
            <span className="t-mono-lg">{unit.label}</span> · {unit.size}
          </h1>
          <span className="placard" data-tone="dim">
            {STATUS_LABEL[unit.status === "maintenance" ? "maintenance" : "vacant"]}
          </span>
        </div>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          Street rate {formatMoney(unit.monthlyRateCents)}/mo
          {unit.notes ? ` · ${unit.notes}` : ""}
        </p>

        {unit.status === "maintenance" ? (
          <p className="t-body" style={{ marginTop: 24 }}>
            This unit is out of service. Clear the maintenance flag below to rent it again.
          </p>
        ) : (
          <div style={{ marginTop: 24 }}>
            <Link className="btn btn-primary btn-full" href={`/units/${unit.id}/move-in`}>
              Move a tenant in
            </Link>
            <p className="t-secondary" style={{ marginTop: 12 }}>
              Ten minutes: tenant details, the lease on their phone, a card on file, the prorated
              first month, the gate code.
            </p>
          </div>
        )}

        <section className="hairline-t" style={{ marginTop: 32, paddingTop: 24 }}>
          <h2 className="t-label">Unit</h2>
          <div style={{ marginTop: 12 }}>
            <UnitEditForm
              unitId={unit.id}
              size={unit.size}
              rateCents={unit.monthlyRateCents}
              notes={unit.notes ?? ""}
              maintenance={unit.status === "maintenance"}
              canMaintain
            />
          </div>
        </section>
      </main>
    );
  }

  const { tenancy, tenant } = live;
  const entries = await entriesFor(tenancy.id);
  const rows = await runningRowsFor(tenancy.id);
  const delq = delinquency(toCoreEntries(entries), asOf);
  const rungs = await ladderHistory(tenancy.id);
  const liveRungs = rungs.filter((r) => !r.reversedOn && r.cycleKey === delq.cycleKey);
  const next = nextRung(settings.lateLadder, delq.daysLate);
  const lienCase = await openCaseForTenancy(tenancy.id);
  const documents = await noticesFor(tenancy.id);
  const pack = packFor(facility.state);

  const status = lienCase
    ? "lien"
    : delq.since && delq.outstandingCents > 0
      ? "overdue"
      : "occupied";

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 720 }}>
      <Link href={`/map?facility=${facility.id}`} className="t-secondary">
        ← {facility.name}
      </Link>

      <div className="flex items-baseline justify-between gap-3" style={{ marginTop: 8 }}>
        <h1 className="t-h2">
          <span className="t-mono-lg">{unit.label}</span> · {unit.size}
        </h1>
        <span
          className="placard"
          data-tone={status === "lien" ? "lien" : status === "overdue" ? "overdue" : "ink"}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className="t-body" style={{ marginTop: 8 }}>
        {tenant.name}
        {tenant.phone ? ` · ${tenant.phone}` : ""}
      </p>
      <p className="t-secondary" style={{ marginTop: 2 }}>
        {tenant.email || "No email on file"} · notice address: {tenant.address || "none on file"}
      </p>
      <p className="t-mono" style={{ marginTop: 8 }}>
        {formatMoney(tenancy.rateCents)}/mo · since {formatDate(tenancy.startedOn, { year: true })}
        {tenancy.autopay ? " · autopay on" : " · autopay off"}
      </p>

      {!tenancy.signedAt ? (
        <p
          className="t-secondary"
          style={{ marginTop: 16, color: "var(--color-rolldoor-strong)" }}
          role="status"
        >
          The lease is not signed yet.{" "}
          <Link href={`/units/${unit.id}/move-in`}>Finish the move-in</Link>.
        </p>
      ) : null}

      {/* ---- the money ---- */}
      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-label">Balance</h2>
          <p className="t-stat">
            {formatMoney(delq.outstandingCents - delq.creditCents)}
          </p>
        </div>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {delq.since === null
            ? delq.creditCents > 0
              ? `${formatMoney(delq.creditCents)} in credit — nothing due.`
              : "Paid up."
            : `${delq.daysLate} day${delq.daysLate === 1 ? "" : "s"} late from ${formatDate(delq.since, { year: true })}.`}
        </p>

        {delq.since !== null && next ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Next automatic step: <strong>{actionPlacard(next.action)}</strong> on{" "}
            <span className="t-mono">{addDays(delq.since, next.day)}</span> (day {next.day}).
          </p>
        ) : null}

        {liveRungs.length > 0 ? (
          <ul style={{ marginTop: 12, listStyle: "none", padding: 0 }}>
            {liveRungs.map((rung) => (
              <li key={rung.id} className="t-mono" style={{ color: "var(--color-dim)" }}>
                {rung.firedOn} · day {rung.day} · {actionPlacard(rung.action)}
              </li>
            ))}
          </ul>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <RecordPaymentForm
            tenancyId={tenancy.id}
            suggestedCents={Math.max(0, delq.outstandingCents)}
            today={asOf}
          />
        </div>

        {delq.creditCents > 0 ? (
          <div style={{ marginTop: 20 }}>
            <RefundForm tenancyId={tenancy.id} creditCents={delq.creditCents} />
          </div>
        ) : null}
      </section>

      {/* ---- the ledger ---- */}
      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <div className="flex items-baseline justify-between gap-3" style={{ flexWrap: "wrap" }}>
          <h2 className="t-label">Ledger — append-only</h2>
          <a className="btn-quiet" href={`/api/exports/ledger/${tenancy.id}`}>
            CSV
          </a>
        </div>
        {rows.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Nothing posted yet. The first row lands when the move-in is completed.
          </p>
        ) : (
          <div className="ledger-wrap" style={{ marginTop: 12 }}>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th className="num">Amount</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, balanceAfterCents }) => (
                  <tr key={entry.id}>
                    <td className="t-mono">{entry.occurredOn}</td>
                    <td>
                      <span className="t-title">{kindLabel(entry.kind)}</span>
                      <br />
                      <span className="t-secondary">{entry.description}</span>
                    </td>
                    <td className="num">{formatMoney(entry.amountCents)}</td>
                    <td className="num">{formatMoney(balanceAfterCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details style={{ marginTop: 16 }}>
          <summary className="btn-quiet" style={{ minHeight: 44, display: "inline-flex" }}>
            Post a correction
          </summary>
          <div style={{ marginTop: 12 }}>
            <AdjustmentForm tenancyId={tenancy.id} />
          </div>
        </details>
      </section>

      {/* ---- the lien rail ---- */}
      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Lien</h2>
        {lienCase ? (
          <>
            <p className="t-secondary" style={{ marginTop: 8, marginBottom: 16 }}>
              Case open since {formatDate(lienCase.lienCase.delinquentSince, { year: true })} under{" "}
              {lienCase.rule.state} rule pack v{lienCase.rule.version}.
            </p>
            <LienRail steps={lienCase.timeline.steps} />
            <Link className="btn btn-secondary" href={`/liens/${lienCase.lienCase.id}`}>
              Open the lien file
            </Link>
          </>
        ) : pack ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No lien case. {delq.since === null
              ? "Nothing is owed, so nothing to run."
              : `Open one from the delinquency board once ${facility.state} allows it.`}
          </p>
        ) : (
          <p className="rail-stop" style={{ marginTop: 8 }}>
            {manualModeSentence(facility.state)}
          </p>
        )}
      </section>

      {/* ---- gate code ---- */}
      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-label">Gate code</h2>
          <span
            className="placard"
            data-tone={tenancy.gateCodeStatus === "active" ? "paid" : "overdue"}
          >
            {tenancy.gateCodeStatus}
          </span>
        </div>
        <p className="t-stat" style={{ marginTop: 8 }}>
          {tenancy.gateCode ?? "—"}
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {tenancy.gateCode
            ? `Tracked here and exported for ${facility.gateSystem ?? "your keypad"}. There is no hardware integration in v1 — the CSV is the handoff.`
            : "Issued when the first payment lands."}
        </p>
        <div style={{ marginTop: 16 }}>
          <GateCodeForm tenancyId={tenancy.id} status={tenancy.gateCodeStatus} />
        </div>
      </section>

      {/* ---- documents ---- */}
      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Documents</h2>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {tenancy.leaseR2Key ? (
            <li className="row">
              <span style={{ flex: 1 }}>
                <span className="t-title">Rental agreement</span>
                <br />
                <span className="t-secondary">
                  {tenancy.signedAt
                    ? `Signed ${tenancy.signedAt.toISOString().slice(0, 10)} · sha256 ${tenancy.leaseHash?.slice(0, 16)}…`
                    : "Unsigned draft"}
                </span>
              </span>
              <a className="btn-quiet" href={documentUrl(tenancy.leaseR2Key)}>
                Open
              </a>
            </li>
          ) : null}
          {documents.map((doc) => (
            <li className="row" key={doc.id}>
              <span style={{ flex: 1 }}>
                <span className="t-title">{doc.kind.replace(/_/g, " ")}</span>
                <br />
                <span className="t-secondary">
                  Generated {doc.generatedAt.toISOString().slice(0, 10)}
                </span>
              </span>
              <a className="btn-quiet" href={documentUrl(doc.r2Key)}>
                Open
              </a>
            </li>
          ))}
        </ul>
        {!tenancy.leaseR2Key && documents.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing generated yet.
          </p>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <StatementForm tenancyId={tenancy.id} />
        </div>
      </section>

      {/* ---- move out ---- */}
      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Move out</h2>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Final balance, the prorate credit if your rule is daily, the make-ready checklist, and the
          unit back to vacant.
        </p>
        <Link className="btn btn-secondary" style={{ marginTop: 12 }} href={`/units/${unit.id}/move-out`}>
          Start the move-out
        </Link>
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Unit</h2>
        <div style={{ marginTop: 12 }}>
          <UnitEditForm
            unitId={unit.id}
            size={unit.size}
            rateCents={unit.monthlyRateCents}
            notes={unit.notes ?? ""}
            maintenance={false}
            canMaintain={false}
          />
        </div>
      </section>
    </main>
  );
}
