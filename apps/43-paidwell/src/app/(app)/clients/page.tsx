import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight, IconUsers } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { loadClientRows } from "@/lib/dashboard";
import { describeBehaviour } from "@/lib/analytics";
import { daysLabel } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { plan } from "@/lib/plans";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { firm } = await requireFirm();
  const rows = await loadClientRows(firm);
  const features = plan(firm.plan);
  const withBalance = rows.filter((row) => row.outstandingCents > 0);

  return (
    <main>
      <ScreenHeader firmName={firm.name} meta="clients · payment behaviour" />

      <section className="gutter">
        <h1 className="t-h2">Who actually pays</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          {features.clientRiskProfiles
            ? "Average days to pay and how often they hit the agreed date — computed from their own history with you, not a credit bureau."
            : "Balances and term overrides. Behaviour scoring arrives on the Firm plan."}
        </p>
      </section>

      {rows.length === 0 ? (
        <section className="gutter" style={{ marginTop: 32 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <IconUsers size={20} style={{ color: "var(--color-text-aa)", marginTop: 2 }} />
            <div>
              <p className="t-title">No clients yet</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                They arrive with your invoices, from QuickBooks, Xero or a CSV.
              </p>
              <Link href="/connect" className="btn-quiet" style={{ paddingLeft: 0, marginTop: 8 }}>
                Connect a source
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="gutter" style={{ marginTop: 32, marginBottom: 40 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>
            {withBalance.length} of {rows.length} owe you something
          </p>
          {rows
            .slice()
            .sort((a, b) => b.outstandingCents - a.outstandingCents)
            .map((row) => (
              <Link key={row.client.id} href={`/clients/${row.client.id}`} className="row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {row.client.name}
                    {row.client.vip ? (
                      <span className="t-label" style={{ color: "var(--color-amber)", marginLeft: 8 }}>
                        VIP
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="t-secondary"
                    style={{ display: "block", marginTop: 2, color: "var(--color-text-aa)" }}
                  >
                    {features.clientRiskProfiles
                      ? describeBehaviour(row.behaviour)
                      : `${row.openCount} open`}
                    {row.oldestDaysLate > 0 ? ` · oldest ${daysLabel(row.oldestDaysLate)} late` : ""}
                  </span>
                </span>
                <span className="t-data" style={{ fontSize: 14, flex: "none" }}>
                  {formatMoney(row.outstandingCents)}
                </span>
                <IconChevronRight size={18} style={{ color: "var(--color-text-aa)", flex: "none" }} />
              </Link>
            ))}
        </section>
      )}
    </main>
  );
}
