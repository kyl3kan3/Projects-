import type { Metadata } from "next";
import { invoiceLabel, isOverdue, listInvoices, outstandingCents } from "@/lib/invoices";
import { money, moneyShort, stampDate } from "@/lib/format";
import { MODULE_COPY } from "@/components/module-copy";
import { SignageChip } from "@/components/SignageChip";
import { PortalTheme } from "../PortalTheme";
import { PortalFooter, PortalTopBar } from "../PortalChrome";
import { requirePortalModule } from "../guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoices", robots: { index: false } };

export default async function PortalInvoices({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requirePortalModule(slug, "invoices");
  const invoices = await listInvoices(viewer.portalId);
  const outstanding = outstandingCents(invoices);

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main className="screen screen-portal">
        <PortalTopBar
          branding={viewer.workspace.branding}
          agencyName={viewer.workspace.name}
          backHref={`/p/${slug}`}
        />
        <header className="pt-8 pb-6">
          <h1 className="t-h2">Invoices</h1>
          <p className="t-data mt-2" style={{ color: "var(--color-ink-2)" }}>
            {outstanding > 0 ? `${moneyShort(outstanding)} OUTSTANDING` : "NOTHING OUTSTANDING"}
          </p>
        </header>

        {invoices.length === 0 ? (
          <p className="t-secondary">{MODULE_COPY.invoices.empty}</p>
        ) : (
          invoices.map((invoice) => {
            const overdue = isOverdue(invoice);
            return (
              <article key={invoice.id} className="hairline-b py-4">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="t-title block">Invoice {invoice.number}</span>
                    <span className="t-data mt-1 block" style={{ color: "var(--color-ink-2)" }}>
                      {money(invoice.amountCents, invoice.currency)}
                      {invoice.dueAt ? ` · DUE ${stampDate(invoice.dueAt)}` : ""}
                      {invoice.paidAt ? ` · PAID ${stampDate(invoice.paidAt)}` : ""}
                    </span>
                  </span>
                  <SignageChip tone={invoice.status === "paid" ? "green" : overdue ? "amber" : "neutral"}>
                    {overdue ? "overdue" : invoiceLabel(invoice.status)}
                  </SignageChip>
                </div>

                {invoice.status === "open" ? (
                  invoice.hostedInvoiceUrl ? (
                    <a
                      href={invoice.hostedInvoiceUrl}
                      className="btn btn-primary btn-full mt-4"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Pay {moneyShort(invoice.amountCents, invoice.currency)}
                    </a>
                  ) : (
                    // No dead button: an invoice with no payment link says so plainly.
                    <p className="t-secondary mt-3">
                      {viewer.workspace.name} will send the payment link for this one.
                    </p>
                  )
                ) : null}
              </article>
            );
          })
        )}

        <p className="t-secondary mt-6">
          Payments go straight to {viewer.workspace.name}&apos;s own account.
        </p>

        <PortalFooter show={viewer.showBadge} />
      </main>
    </PortalTheme>
  );
}
