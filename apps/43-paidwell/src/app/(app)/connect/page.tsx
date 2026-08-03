import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconAlert, IconBuilding } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { connectionsFor, providerFor, PROVIDER_LABELS } from "@/lib/accounting";
import { openInvoiceCount } from "@/lib/invoices";
import { invoiceCapacity, plan } from "@/lib/plans";
import { timeAgo } from "@/lib/display";
import { ConnectionActions, CsvImportForm, ProviderButtons } from "./ConnectForms";

export const metadata: Metadata = { title: "Accounting" };
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const { firm } = await requireFirm();
  const connections = await connectionsFor(firm.id);
  const openCount = await openInvoiceCount(firm.id);
  const capacity = invoiceCapacity(firm.plan, openCount);
  const features = plan(firm.plan);

  return (
    <main>
      <ScreenHeader firmName={firm.name} meta="accounting · imports" />

      <section className="gutter">
        <h1 className="t-h2">Where your invoices come from</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          PaidWell reads invoices, contacts and payments, and writes payments back when a
          client pays through the portal. It never changes an invoice.
        </p>
      </section>

      {connections.length > 0 ? (
        <section className="gutter" style={{ marginTop: 32 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>
            Connected
          </p>
          {connections.map((connection) => {
            const api = providerFor(connection.provider);
            return (
              <div key={connection.id} className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                <IconBuilding size={18} style={{ color: "var(--color-text-2)", marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p className="t-title">{PROVIDER_LABELS[connection.provider]}</p>
                  <p className="t-data" style={{ color: "var(--color-text-3)", marginTop: 4 }}>
                    {timeAgo(connection.lastSyncedAt)}
                    {connection.syncStatus === "error" ? " · sync failed" : ""}
                  </p>
                  {connection.syncError ? (
                    <p className="t-secondary" style={{ color: "var(--color-red)", marginTop: 4 }}>
                      {connection.syncError}
                    </p>
                  ) : null}
                  {!api.live && connection.provider !== "csv" ? (
                    <p className="t-secondary" style={{ marginTop: 4 }}>
                      Demo data — {PROVIDER_LABELS[connection.provider]} credentials are not
                      configured on this deployment, so this book is a realistic stand-in, not
                      your own.
                    </p>
                  ) : null}
                </div>
                <div style={{ width: "100%", marginTop: 8 }}>
                  <ConnectionActions
                    connectionId={connection.id}
                    canResync={connection.provider !== "csv"}
                  />
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="gutter" style={{ marginTop: 32 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          Add a source
        </p>
        <ProviderButtons />
      </section>

      <section className="gutter" style={{ marginTop: 32 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          Or import a file
        </p>
        <CsvImportForm />
      </section>

      <section className="gutter" style={{ marginTop: 32, marginBottom: 40 }}>
        <div className="panel" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <IconAlert size={20} style={{ color: "var(--color-text-3)", flex: "none" }} />
          <div>
            <p className="t-title">
              {capacity.limit === Number.MAX_SAFE_INTEGER
                ? `${openCount} open invoices · unlimited on ${features.name}`
                : `${openCount} of ${capacity.limit} open invoices on ${features.name}`}
            </p>
            <p className="t-secondary" style={{ marginTop: 4 }}>
              {capacity.atLimit
                ? "New invoices are being skipped rather than silently dropped. A partial aging report would be worse than a refused import."
                : "A sync will never quietly exceed your plan — anything skipped is reported."}{" "}
              <Link href="/settings/billing" style={{ color: "var(--color-banker)", fontWeight: 600 }}>
                Plans
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
