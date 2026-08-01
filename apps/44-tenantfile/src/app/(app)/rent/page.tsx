import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { landlordTenancies, loadLedger } from "@/lib/ledger";
import { collectedForPeriod, ledgerStrip } from "@/lib/ledger-core";
import { LedgerStrip } from "@/components/LedgerStrip";
import { formatMoney, formatMoneyShort, formatPeriod, isoDateOf, periodOf } from "@/lib/money";
import { IconChevronRight } from "@/components/icons";

export const metadata: Metadata = { title: "Rent" };
export const dynamic = "force-dynamic";

export default async function RentPage() {
  const { landlord } = await requireLandlord();
  const today = isoDateOf(new Date());
  const period = periodOf(today);
  const year = Number(today.slice(0, 4));

  const rows = await landlordTenancies(landlord.id);
  const ledgers = await Promise.all(rows.map((r) => loadLedger(r.tenancy.id, today)));
  const { collectedCents, billedCents } = collectedForPeriod(ledgers, period);
  const owedCents = ledgers.reduce((s, l) => s + l.balanceCents, 0);
  const lateCount = ledgers.filter((l) => l.oldestDue != null).length;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Rent · {formatPeriod(period)}</p>
        <h1 className="t-stat mt-2" style={{ color: billedCents > 0 && collectedCents >= billedCents ? "var(--color-rent-green)" : "var(--color-ink)" }}>
          {formatMoneyShort(collectedCents)}
        </h1>
        <p className="t-secondary mt-1">
          of {formatMoney(billedCents)} charged this month · {formatMoney(owedCents)} outstanding across all tenancies
        </p>
        {lateCount > 0 ? (
          <p className="t-secondary mt-2" style={{ color: "var(--color-red)" }}>
            {lateCount} tenanc{lateCount === 1 ? "y is" : "ies are"} behind.
          </p>
        ) : null}
      </header>

      {rows.length === 0 ? (
        <div className="card p-4">
          <p className="t-title">No tenancies yet.</p>
          <p className="t-secondary mt-2">
            Sign a lease or bring an existing tenancy in and the ledger starts here — charges, payments, running balance,
            and a reminder ladder you never have to think about again.
          </p>
          <Link href="/units" className="btn btn-primary btn-full mt-4">
            Go to your units
          </Link>
        </div>
      ) : (
        <div className="stagger flex flex-col gap-8">
          {rows.map(({ tenancy, unit, property }, i) => {
            const ledger = ledgers[i];
            const strip = ledgerStrip(ledger, year, today);
            const late = ledger.oldestDue;
            return (
              <section key={tenancy.id} style={{ "--i": i } as React.CSSProperties}>
                <Link href={`/tenancies/${tenancy.id}`} className="row no-underline">
                  <span className="dot" data-state={late ? "late" : ledger.balanceCents === 0 ? "paid" : "due"} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">
                      {property.address} <span className="t-data">{unit.label}</span>
                    </span>
                    <span className="t-secondary block truncate">
                      {tenancy.tenantNames.join(", ") || "Tenant"} ·{" "}
                      {ledger.balanceCents === 0
                        ? ledger.creditCents > 0
                          ? `${formatMoney(ledger.creditCents)} in credit`
                          : "paid to date"
                        : `${formatMoney(ledger.balanceCents)} owing`}
                    </span>
                  </span>
                  <IconChevronRight size={18} />
                </Link>
                <div className="mt-4">
                  <LedgerStrip cells={strip} year={year} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
