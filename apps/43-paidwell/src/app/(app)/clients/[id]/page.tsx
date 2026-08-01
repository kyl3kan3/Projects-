import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { clientBehaviour, describeBehaviour } from "@/lib/analytics";
import { daysOverdue, today } from "@/lib/dates";
import { daysLabel } from "@/lib/display";
import { describeInvoiceState, OPEN_STATUSES } from "@/lib/invoices";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { firmSettings } from "@/lib/settings";
import { ClientForm } from "../ClientForm";

export const metadata: Metadata = { title: "Client" };
export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { firm } = await requireFirm();
  const db = getDb();
  const asOf = today();

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.firmId, firm.id), eq(clients.id, id)));
  if (!client) notFound();

  const list = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, firm.id), eq(invoices.clientId, client.id)))
    .orderBy(invoices.dueAt);

  const open = list.filter((i) => OPEN_STATUSES.includes(i.status) && i.balanceCents > 0);
  const settled = list.filter((i) => i.status === "paid" && i.paidAt);
  const behaviour = clientBehaviour(
    settled.map((i) => ({ issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt! })),
  );
  const outstanding = open.reduce((sum, i) => sum + i.balanceCents, 0);

  return (
    <main>
      <ScreenHeader firmName={client.name} meta={client.contactName ?? "no named contact"} />

      <section className="gutter">
        <p className="t-label">Outstanding</p>
        <p className="t-stat">{formatMoneyShort(outstanding)}</p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {describeBehaviour(behaviour)}
          {open.length > 0 ? ` · ${open.length} open` : " · nothing open"}
        </p>
        {client.vip ? (
          <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-amber)" }}>
            Excluded from automatic follow-up.
          </p>
        ) : null}
      </section>

      {open.length > 0 ? (
        <section className="gutter" style={{ marginTop: 32 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>
            Open invoices
          </p>
          {open.map((invoice) => (
            <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {invoice.number}
                </span>
                <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                  {describeInvoiceState(invoice, asOf)}
                </span>
              </span>
              <span style={{ textAlign: "right", flex: "none" }}>
                <span className="t-data" style={{ display: "block", fontSize: 14 }}>
                  {formatMoney(invoice.balanceCents, invoice.currency)}
                </span>
                <span className="t-data" style={{ display: "block", color: "var(--color-text-3)", marginTop: 2 }}>
                  {daysLabel(daysOverdue(invoice.dueAt, asOf))}
                </span>
              </span>
              <IconChevronRight size={18} style={{ color: "var(--color-text-3)", flex: "none" }} />
            </Link>
          ))}
        </section>
      ) : null}

      <section className="gutter" style={{ marginTop: 40, marginBottom: 40 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          How PaidWell treats them
        </p>
        <ClientForm
          clientId={client.id}
          vip={client.vip}
          termsDaysOverride={client.termsDaysOverride}
          emails={client.emails}
          notes={client.notes}
          defaultTermsDays={firmSettings(firm).defaultTermsDays}
        />
      </section>
    </main>
  );
}
