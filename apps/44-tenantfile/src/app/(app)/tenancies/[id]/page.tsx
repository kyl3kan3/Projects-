import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLandlord } from "@/lib/auth";
import { landlordTenancy, loadLedgerView } from "@/lib/ledger";
import { getTimeline } from "@/lib/file-events";
import { leaseForTenancy, leaseStatusLabel } from "@/lib/leases";
import { remindersForCharges } from "@/lib/reminders";
import { templateLabel } from "@/lib/reminder-copy";
import { checkLateFeeRule, LEGAL_DISCLAIMER, stateRule } from "@/lib/state-rules";
import { tenantPortalUrl } from "@/lib/links";
import { formatDate, formatMoney, formatMoneyShort, formatPeriod, isoDateOf } from "@/lib/money";
import { LedgerStrip } from "@/components/LedgerStrip";
import { FileTimeline } from "@/components/FileTimeline";
import { CopyField } from "@/components/ActionForm";
import { IconDownload } from "@/components/icons";
import { TenancyActions } from "./TenancyActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { landlord } = await requireLandlord();
  const owned = await landlordTenancy(landlord.id, (await params).id);
  return { title: owned ? `${owned.property.address} ${owned.unit.label}` : "Tenancy" };
}

export default async function TenancyPage({ params }: { params: Promise<{ id: string }> }) {
  const { landlord } = await requireLandlord();
  const { id } = await params;
  const owned = await landlordTenancy(landlord.id, id);
  if (!owned) notFound();

  const { tenancy, unit, property } = owned;
  const today = isoDateOf(new Date());
  const year = Number(today.slice(0, 4));

  const [view, timeline, lease] = await Promise.all([
    loadLedgerView(tenancy.id, year, today),
    getTimeline(tenancy.id, 60),
    leaseForTenancy(tenancy.id),
  ]);
  const { ledger, strip, rule, ruleSummary } = view;

  const openCharges = ledger.charges.filter((c) => c.outstandingCents > 0);
  const nextCharge = openCharges[0] ?? null;
  const scheduled = await remindersForCharges(openCharges.map((c) => c.charge.id));
  const upcomingReminders = scheduled.filter((r) => r.status === "scheduled").slice(0, 4);

  const guardrail = rule
    ? checkLateFeeRule(
        property.state,
        { kind: rule.kind, amount: rule.amount, graceDays: rule.graceDays, maxPerMonthCents: rule.maxPerMonthCents },
        tenancy.rentCents,
      )
    : null;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/units" className="btn-quiet no-underline">
          Units
        </Link>
        <h1 className="t-h2 mt-4">{tenancy.tenantNames.join(", ") || "Tenancy"}</h1>
        <p className="t-data mt-2">
          {property.address} · {unit.label} · {formatPeriod((tenancy.startsOn as string).slice(0, 7))} –{" "}
          {tenancy.endsOn ? formatPeriod((tenancy.endsOn as string).slice(0, 7)) : "OPEN"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pill" data-tone={tenancy.status === "active" ? "green" : undefined}>
            {tenancy.status === "active" ? "Active" : tenancy.status === "draft" ? "Draft" : "Ended"}
          </span>
          {lease ? (
            <Link href={`/tenancies/${tenancy.id}/lease`} className="pill no-underline" data-tone={lease.status === "signed" ? "green" : "amber"}>
              {leaseStatusLabel(lease.status)}
            </Link>
          ) : (
            <Link href={`/tenancies/${tenancy.id}/lease`} className="pill no-underline">
              No lease yet
            </Link>
          )}
        </div>
      </header>

      {/* The number the landlord came for. */}
      <section className="mb-8">
        <p className="t-label">{ledger.creditCents > 0 ? "Credit on account" : "Balance owed"}</p>
        <p
          className="t-stat mt-2"
          style={{
            color:
              ledger.balanceCents === 0
                ? "var(--color-rent-green)"
                : nextCharge && nextCharge.charge.dueOn < today
                  ? "var(--color-red)"
                  : "var(--color-ink)",
          }}
        >
          {formatMoney(ledger.creditCents > 0 ? ledger.creditCents : ledger.balanceCents)}
        </p>
        <p className="t-secondary mt-1">
          {ledger.balanceCents === 0 && ledger.creditCents === 0
            ? "Paid up to date."
            : ledger.creditCents > 0
              ? "Paid ahead — this will be applied to the next charge."
              : nextCharge
                ? `${formatMoney(nextCharge.outstandingCents)} of ${nextCharge.charge.kind === "late_fee" ? "a late fee" : "rent"} due ${formatDate(nextCharge.charge.dueOn, { year: true })}`
                : ""}
        </p>
        {ledger.processingCents > 0 ? (
          <p className="t-secondary mt-2" style={{ color: "var(--color-amber)" }}>
            {formatMoney(ledger.processingCents)} is clearing from their bank and is not counted above.
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="t-label">Rent · {year}</h2>
          <span className="t-data" style={{ color: "var(--color-text-3)" }}>
            {formatMoneyShort(tenancy.rentCents)}/mo · day {tenancy.rentDueDay}
          </span>
        </div>
        <LedgerStrip cells={strip} year={year} />
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">The ledger</h2>
        {ledger.lines.length === 0 ? (
          <p className="t-secondary">
            Nothing charged yet. Charges appear when the lease is signed, or straight away for an imported tenancy.
          </p>
        ) : (
          <div className="scroll-x">
            <table className="w-full border-collapse" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th className="t-label hairline-b py-2 text-left">Date</th>
                  <th className="t-label hairline-b py-2 text-left">Line</th>
                  <th className="t-label hairline-b py-2 text-right">Amount</th>
                  <th className="t-label hairline-b py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {[...ledger.lines].reverse().map((line) => (
                  <tr key={`${line.kind}-${line.id}`}>
                    <td className="t-data hairline-b py-3 align-top" style={{ color: "var(--color-text-3)" }}>
                      {line.date}
                    </td>
                    <td className="hairline-b py-3 align-top">
                      <span className="t-body">{line.label}</span>
                      {line.detail ? (
                        <span className="t-secondary block" style={{ color: "var(--color-text-3)" }}>
                          {line.detail}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="t-data hairline-b py-3 text-right align-top"
                      style={{ color: line.kind === "payment" ? "var(--color-rent-green)" : undefined }}
                    >
                      {line.kind === "payment" ? "-" : ""}
                      {formatMoney(Math.abs(line.deltaCents))}
                    </td>
                    <td className="t-data hairline-b py-3 text-right align-top">{formatMoney(line.balanceCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="t-label py-3">
                    Charged {formatMoney(ledger.chargedCents)} · paid {formatMoney(ledger.paidCents)}
                  </td>
                  <td colSpan={2} className="t-data py-3 text-right">
                    {formatMoney(ledger.balanceCents - ledger.creditCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {upcomingReminders.length > 0 ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">Reminders queued</h2>
          <ul className="m-0 list-none p-0">
            {upcomingReminders.map((reminder) => (
              <li key={reminder.id} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-body block">{templateLabel(reminder.template)}</span>
                  <span className="t-secondary block">by {reminder.channel}</span>
                </span>
                <span className="t-data">{reminder.sendAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
          <p className="t-secondary mt-3">
            Every one of these is checked against the ledger the moment before it goes out. A charge that has been paid or
            waived cancels its own reminders.
          </p>
        </section>
      ) : null}

      <TenancyActions
        tenancyId={tenancy.id}
        openCharges={openCharges.map((c) => ({
          id: c.charge.id,
          label: `${c.charge.memo || c.charge.kind} · ${c.charge.period ? formatPeriod(c.charge.period) : c.charge.dueOn}`,
          outstandingCents: c.outstandingCents,
          amountCents: c.charge.amountCents,
          dueOn: c.charge.dueOn,
        }))}
        rule={
          rule
            ? {
                graceDays: rule.graceDays,
                kind: rule.kind,
                amount: rule.amount,
                maxPerMonthCents: rule.maxPerMonthCents,
                enabled: rule.enabled,
                stateCapAck: rule.stateCapAck,
              }
            : null
        }
        ruleSummary={ruleSummary}
        stateWarnings={guardrail?.warnings ?? []}
        stateName={stateRule(property.state)?.name ?? property.state}
        legalDisclaimer={LEGAL_DISCLAIMER}
        rentCents={tenancy.rentCents}
        tenantEmails={tenancy.tenantEmails.join(", ")}
        tenantPhones={tenancy.tenantPhones.join(", ")}
        canEnd={tenancy.status === "active"}
      />

      <section className="mt-8 mb-8">
        <h2 className="t-label mb-3">Their rent page</h2>
        <CopyField label="Send this to the tenant" value={tenantPortalUrl(tenancy.portalToken)} />
        <p className="t-secondary mt-2">
          No login, no app. It shows their balance, every payment you have recorded, and it is where they report repairs.
        </p>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="t-label">The File</h2>
          <a className="btn-quiet flex items-center gap-2 no-underline" href={`/api/tenancies/${tenancy.id}/export`}>
            <IconDownload size={18} />
            Export as PDF
          </a>
        </div>
        <FileTimeline events={timeline} />
      </section>
    </main>
  );
}
