import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconHourglass } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { pendingApprovals } from "@/lib/sequences";
import { formatMoney } from "@/lib/money";
import { ApprovalTray, type TrayItem } from "./ApprovalTray";

export const metadata: Metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const { firm } = await requireFirm();
  const pending = await pendingApprovals(firm.id);

  const items: TrayItem[] = pending.map(({ message, invoice, client, daysLate }) => ({
    messageId: message.id,
    invoiceId: invoice.id,
    clientName: client.name,
    invoiceNumber: invoice.number,
    amount: formatMoney(invoice.balanceCents, invoice.currency),
    daysLate,
    level: message.escalationLevel,
    promiseAware: message.promiseAware,
    toEmails: message.toEmails,
    subject: message.subject,
    body: message.bodySnapshot,
  }));

  return (
    <main>
      <ScreenHeader
        firmName={firm.name}
        meta={firm.sendMode === "approval" ? "approval mode · nothing sends itself" : "autopilot · sends without asking"}
        metaHref="/settings"
      />

      <section className="gutter">
        <h1 className="t-h2">Queued sends</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          {firm.sendMode === "approval"
            ? "Every follow-up waits here for a tap. Read it, send it, or skip the rung entirely."
            : "This firm is on autopilot, so sends do not queue. Anything here was queued before you switched over."}
        </p>
      </section>

      {items.length === 0 ? (
        <section className="gutter" style={{ marginTop: 32 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <IconHourglass size={20} style={{ color: "var(--color-text-aa)", marginTop: 2 }} />
            <div>
              <p className="t-title">Nothing waiting</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                The next rung appears here on the day it falls due — a fixed number of days
                from each invoice&rsquo;s due date, never &ldquo;every day while overdue&rdquo;.
              </p>
              <Link href="/sequences" className="btn-quiet" style={{ paddingLeft: 0, marginTop: 8 }}>
                See the ladder
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section style={{ marginTop: 24 }}>
          <ApprovalTray items={items} />
        </section>
      )}
    </main>
  );
}
