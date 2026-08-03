import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";
import { getDb } from "@/db";
import { wasteFindings } from "@/db/schema";
import { resolveSelected } from "@/lib/accounts";
import { switcherAccounts } from "@/lib/dashboard";
import { kindLabel, rankFindings, recoverableMicros, recoveredMicros } from "@/lib/waste";
import { formatPerMonth, formatUsdWhole } from "@/lib/money";
import { DemoNotice, ScreenHeader } from "@/components/ScreenHeader";
import { WasteRowActions } from "./WasteActions";
import { IconBroom } from "@/components/icons";

export const metadata: Metadata = { title: "Waste" };
export const dynamic = "force-dynamic";

export default async function WastePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { org } = await requireOrg();
  const params = await searchParams;
  const { selected, accounts } = await resolveSelected(org.id, params.account);

  if (!selected) {
    return (
      <main className="gutter" style={{ paddingTop: 40 }}>
        <h1 className="t-h2">Nothing to sweep yet</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          Connect an AWS account and the first waste scan runs within the hour.
        </p>
        <Link className="btn btn-primary btn-full" href="/connect" style={{ marginTop: 24 }}>
          Add account
        </Link>
      </main>
    );
  }

  const db = getDb();
  const all = await db
    .select()
    .from(wasteFindings)
    .where(eq(wasteFindings.accountId, selected.id));

  const simple = all.map((f) => ({
    kind: f.kind,
    estMonthlySavingMicros: f.estMonthlySavingMicros,
    status: f.status,
  }));
  const top = rankFindings(all);
  const recoverable = recoverableMicros(simple);
  const recovered = recoveredMicros(simple);

  return (
    <main>
      <ScreenHeader
        accounts={switcherAccounts(accounts)}
        selectedId={selected.id}
        openAnomalies={0}
      />
      <DemoNotice show={selected.provider === "demo"} />

      <section className="gutter" style={{ paddingTop: 24, paddingBottom: 8 }}>
        <p className="t-label">Recoverable</p>
        <p className="t-display" style={{ color: "var(--color-paper)", marginTop: 8 }}>
          {formatUsdWhole(recoverable)}/MO
        </p>
        <p className="t-data" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          {top.length} FINDING{top.length === 1 ? "" : "S"} · DOLLAR-RANKED
          {recovered > 0 ? ` · ${formatUsdWhole(recovered)}/MO ALREADY RECOVERED` : ""}
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Estimates use on-demand list prices, so they are conservative. Tick a row
          off once you have dealt with it and the total above rolls down.
        </p>
      </section>

      <section className="gutter" style={{ paddingTop: 16 }}>
        {top.length === 0 ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "start", paddingTop: 16 }}>
            <span style={{ color: "var(--color-green)" }}>
              <IconBroom size={40} />
            </span>
            <p className="t-title" style={{ margin: 0 }}>
              {all.length === 0
                ? "The first waste scan has not run yet."
                : "Nothing left on the table."}
            </p>
            <p className="t-secondary" style={{ margin: 0 }}>
              {all.length === 0
                ? "Scans run once a day per account and look at idle instances, unattached volumes, aged snapshots and over-provisioned resources."
                : `Every finding has been actioned or dismissed — ${formatUsdWhole(recovered)}/mo recovered.`}
            </p>
          </div>
        ) : (
          /* No boxes: hairline rows, dollar figure first, remedy in Secondary. */
          <div>
            {top.map((finding) => (
              <div key={finding.id} className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <span
                  className="t-data"
                  style={{ minWidth: 78, flex: "none", paddingTop: 2, color: "var(--color-text)" }}
                >
                  {formatPerMonth(finding.estMonthlySavingMicros)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {finding.title}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {finding.remedy}
                  </span>
                  <span
                    className="t-data"
                    style={{ display: "block", color: "var(--color-text-3)", marginTop: 4 }}
                  >
                    {kindLabel(finding.kind).toUpperCase()} · {finding.region} ·{" "}
                    {finding.evidence}
                  </span>
                </span>
                <WasteRowActions findingId={finding.id} title={finding.title} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
