/**
 * /units/[id]/move-out — the final maths, then the door goes back to vacant.
 *
 * The page shows the arithmetic *before* the owner commits to it: what the last
 * month was billed, what the tenant actually used, the credit that follows, and
 * what the final balance will be. A move-out that surprises the owner is a
 * move-out they argue about with the tenant in the office.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoveOutForm } from "@/app/(console)/units/[id]/UnitForms";
import { MAKE_READY_ITEMS } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { balance } from "@/lib/ledger";
import { formatMoney, isoDateOf, periodOf, prorateLastMonth } from "@/lib/money";
import { readSettings } from "@/lib/settings";
import { activeTenancyForUnit, ownedUnit } from "@/lib/units";

export const metadata: Metadata = { title: "Move-out" };

export default async function MoveOutPage({ params }: { params: Promise<{ id: string }> }) {
  const { owner } = await requireOwner();
  const { id } = await params;
  const found = await ownedUnit(owner.id, id);
  if (!found) notFound();

  const live = await activeTenancyForUnit(found.unit.id);
  if (!live) {
    return (
      <main style={{ padding: "20px 20px 40px", maxWidth: 560 }}>
        <Link href={`/units/${found.unit.id}`} className="t-secondary">
          ← Unit {found.unit.label}
        </Link>
        <h1 className="t-h2" style={{ marginTop: 8 }}>
          Nothing to move out
        </h1>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Unit {found.unit.label} has no live tenancy.
        </p>
      </main>
    );
  }

  const { tenancy, tenant } = live;
  const settings = readSettings(owner.settings);
  const asOf = isoDateOf(new Date());
  const currentBalance = await balance(tenancy.id);
  const used = prorateLastMonth(tenancy.rateCents, asOf, settings.prorateRule);
  const credit = settings.prorateRule === "daily" ? Math.max(0, tenancy.rateCents - used) : 0;
  const projected = currentBalance - credit;

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 560 }}>
      <Link href={`/units/${found.unit.id}`} className="t-secondary">
        ← Unit {found.unit.label}
      </Link>
      <h1 className="t-h2" style={{ marginTop: 8 }}>
        Move {tenant.name} out of {found.unit.label}
      </h1>

      <section className="hairline-t" style={{ marginTop: 20, paddingTop: 20 }}>
        <h2 className="t-label">If they leave today</h2>
        <table className="ledger" style={{ marginTop: 12 }}>
          <tbody>
            <tr>
              <td>Balance right now</td>
              <td className="num">{formatMoney(currentBalance)}</td>
            </tr>
            <tr>
              <td>
                {periodOf(asOf)} billed at {formatMoney(tenancy.rateCents)}, used{" "}
                {formatMoney(used)}
              </td>
              <td className="num">{credit > 0 ? `-${formatMoney(credit)}` : formatMoney(0)}</td>
            </tr>
            <tr>
              <td className="t-title">
                {projected > 0 ? "Owed on move-out" : projected < 0 ? "To refund" : "Square"}
              </td>
              <td className="num t-mono-lg">{formatMoney(Math.abs(projected))}</td>
            </tr>
          </tbody>
        </table>
        <p className="t-secondary" style={{ marginTop: 12 }}>
          {settings.prorateRule === "daily"
            ? "Your prorate rule is daily, so the unused days of this month are credited as a ledger row."
            : "Your prorate rule is full-month, so the last month is not prorated — that is what the lease says, and no credit is posted."}
        </p>
      </section>

      <section className="hairline-t" style={{ marginTop: 20, paddingTop: 20 }}>
        <h2 className="t-label">Make-ready and confirm</h2>
        <div style={{ marginTop: 12 }}>
          <MoveOutForm tenancyId={tenancy.id} today={asOf} items={MAKE_READY_ITEMS} />
        </div>
      </section>
    </main>
  );
}
