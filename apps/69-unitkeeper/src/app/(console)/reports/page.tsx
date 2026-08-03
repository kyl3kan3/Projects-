/**
 * /reports — occupancy and revenue. "Plain numbers; no dashboard theater" (README),
 * so: three figures at the top, one table by size, and the CSV that a spreadsheet
 * will do the rest with.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { formatMoney, isoDateOf } from "@/lib/money";
import { reportsFor } from "@/lib/reports";

export const metadata: Metadata = { title: "Numbers" };

export default async function ReportsPage() {
  const { owner } = await requireOwner();
  const asOf = isoDateOf(new Date());
  const reports = await reportsFor(owner.id, asOf);

  if (reports.length === 0) {
    return (
      <main style={{ padding: "20px 20px 40px", maxWidth: 560 }}>
        <h1 className="t-h2">Numbers</h1>
        <p className="t-body" style={{ marginTop: 12 }}>
          Nothing to count yet. <Link href="/map">Draw the map</Link> and the numbers follow.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 760 }}>
      <h1 className="t-h2">Numbers</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        As of {asOf}. Monthly revenue is the agreed rate on every live tenancy — what should land this
        month, which is the number the past-due total comes off.
      </p>

      {reports.map((report) => (
        <section
          className="hairline-t"
          style={{ marginTop: 24, paddingTop: 20 }}
          key={report.facility.id}
        >
          <div className="flex items-baseline justify-between gap-3" style={{ flexWrap: "wrap" }}>
            <h2 className="t-title">{report.facility.name}</h2>
            <a className="btn-quiet" href={`/api/exports/units?facility=${report.facility.id}`}>
              Units CSV
            </a>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 16,
              marginTop: 16,
            }}
          >
            <div>
              <p className="t-label">Occupancy</p>
              <p className="t-stat">{report.occupancyPct}%</p>
              <p className="t-secondary">
                {report.occupiedUnits} of {report.totalUnits - report.maintenanceUnits} rentable
                {report.maintenanceUnits > 0 ? ` · ${report.maintenanceUnits} out of service` : ""}
              </p>
            </div>
            <div>
              <p className="t-label">Monthly revenue</p>
              <p className="t-stat">{formatMoney(report.monthlyRevenueCents)}</p>
              <p className="t-secondary">
                {formatMoney(report.vacantPotentialCents)} more if the vacant units filled at street
                rate
              </p>
            </div>
            <div>
              <p className="t-label">Past due</p>
              <p className="t-stat">{formatMoney(report.delinquentCents)}</p>
              <p className="t-secondary">
                across {report.delinquentUnits} unit{report.delinquentUnits === 1 ? "" : "s"} ·{" "}
                <Link href="/delinquency">the board</Link>
              </p>
            </div>
          </div>

          <div className="ledger-wrap" style={{ marginTop: 24 }}>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Size</th>
                  <th className="num">Units</th>
                  <th className="num">Occupied</th>
                  <th className="num">Occupancy</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {report.sizes.map((size) => (
                  <tr key={size.size}>
                    <td className="t-mono">{size.size}</td>
                    <td className="num">{size.total}</td>
                    <td className="num">{size.occupied}</td>
                    <td className="num">{size.occupancyPct}%</td>
                    <td className="num">{formatMoney(size.monthlyRevenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="field-help" style={{ marginTop: 12 }}>
            <a className="btn-quiet" href={`/api/exports/gate-codes?facility=${report.facility.id}`}>
              Gate codes CSV
            </a>
          </p>
        </section>
      ))}
    </main>
  );
}
