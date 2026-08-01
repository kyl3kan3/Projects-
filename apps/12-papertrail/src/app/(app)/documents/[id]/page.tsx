import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reminderSends } from "@/db/schema";
import { requireUser, reminderRuleFor } from "@/lib/auth";
import {
  DOCUMENT_NOUN,
  documentTimeline,
  loadBundle,
  statusLabel,
} from "@/lib/documents";
import { chainFor, chainMoney, recentlyChangedId } from "@/lib/chain";
import { paymentsFor, refreshOverdue } from "@/lib/invoices";
import { balanceDue, formatMoney, formatMoneyShort, splitDeposit } from "@/lib/money";
import { describeDue, formatAuditTimestamp, formatShortDate } from "@/lib/dates";
import { plan } from "@/lib/plans";
import { sequenceState } from "@/lib/reminders";
import { documentUrl } from "@/lib/delivery";
import { DocSheet } from "@/components/DocSheet";
import { SealChip } from "@/components/SealChip";
import { ChainThread } from "@/components/Chain";
import { IconChevronLeft, IconPencil } from "@/components/icons";
import { DocumentActions } from "./DocumentActions";
import {
  duplicateDocumentAction,
  issueBalanceAction,
  recordManualPaymentAction,
  remindNowAction,
  sendDocumentAction,
  voidDocumentAction,
} from "../actions";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const now = new Date();
  await refreshOverdue(user.id, now);

  const bundle = await loadBundle(id);
  if (!bundle || bundle.document.userId !== user.id) notFound();

  const { document, client, brand, blocks, totals, invoice, signature } = bundle;
  const limits = plan(user.plan);
  const nodes = await chainFor(document);
  const money = chainMoney(nodes);
  const timeline = await documentTimeline(document.id);
  const payments = invoice ? await paymentsFor(document.id) : [];
  const outstanding = invoice ? balanceDue(invoice) : 0;

  const db = getDb();
  const sends = invoice
    ? await db.select().from(reminderSends).where(eq(reminderSends.documentId, document.id))
    : [];
  const rule = await reminderRuleFor(user.id);
  const sequence =
    invoice && outstanding > 0
      ? sequenceState(
          { ...rule, enabled: rule.enabled && limits.autoReminders },
          { ...invoice, status: document.status },
          sends.map((s) => s.step),
          now,
        )
      : null;

  const deposit =
    document.type === "contract" && document.depositPercent > 0 && limits.depositInvoices
      ? splitDeposit(totals.total, document.depositPercent)
      : null;

  const isDraft = document.status === "draft";
  const canRemind = Boolean(invoice) && outstanding > 0 && document.status !== "draft";
  // What this contract has already been invoiced for. On the free plan the whole
  // amount goes out as one invoice, so "invoice the balance" must not be offered
  // afterwards — the service refuses it, and the UI should not ask.
  const alreadyInvoiced = nodes
    .filter((n) => n.invoice && n.document.status !== "void")
    .reduce((sum, n) => sum + n.invoice!.total, 0);
  const canBalance =
    document.type === "contract" &&
    document.status === "signed" &&
    alreadyInvoiced < totals.total &&
    !nodes.some((n) => n.invoice?.kind === "balance" && n.document.status !== "void");

  const primary: { label: string; kind: "send" | "remind" | "balance" | "none" } = isDraft
    ? { label: `Send ${DOCUMENT_NOUN[document.type].toLowerCase()}`, kind: "send" }
    : canBalance
      ? { label: "Invoice the balance", kind: "balance" }
      : document.status === "overdue"
        ? { label: "Send the next reminder", kind: "remind" }
        : { label: "", kind: "none" };

  return (
    <main className="screen pt-6">
      <Link href="/documents" className="btn-quiet mb-4 inline-flex items-center gap-1">
        <IconChevronLeft size={16} />
        Documents
      </Link>

      {/* Sticky-ish header: type, status, who it's for. */}
      <header className="hairline-b pb-4">
        <div className="flex items-center justify-between gap-3">
          <span className="t-label">{DOCUMENT_NOUN[document.type]}</span>
          <SealChip type={document.type} status={document.status} />
        </div>
        <h1 className="t-h2 mt-2">{document.title}</h1>
        <p className="t-secondary mt-1">
          {client.company ? `${client.company} · ${client.name}` : client.name} · {client.email}
        </p>
        <div className="t-money mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <span>{formatMoney(invoice?.total ?? totals.total, document.currency)}</span>
          {invoice ? (
            <>
              <span style={{ color: "var(--color-wax)" }}>
                {formatMoney(invoice.amountPaid, invoice.currency)} paid
              </span>
              {outstanding > 0 ? (
                <span
                  style={{
                    color:
                      document.status === "overdue" ? "var(--color-vermilion)" : "var(--color-text-2)",
                  }}
                >
                  {formatMoney(outstanding, invoice.currency)}{" "}
                  {invoice.dueAt ? describeDue(invoice.dueAt, now) : "outstanding"}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {/* What the chain will do next, stated plainly before it happens. */}
      {deposit && document.status !== "signed" ? (
        <p className="t-secondary mt-4">
          On signature, a {document.depositPercent}% deposit invoice for{" "}
          {formatMoney(deposit.deposit, document.currency)} is raised and emailed automatically. The
          balance of {formatMoney(deposit.balance, document.currency)} is invoiced when you mark the
          work complete.
        </p>
      ) : null}

      {document.type === "contract" && document.depositPercent > 0 && !limits.depositInvoices ? (
        <p className="t-secondary mt-4">
          Deposit invoices are a Solo feature. On the Free plan, signing raises one invoice for the
          full {formatMoney(totals.total, document.currency)}.{" "}
          <Link href="/settings/billing" style={{ color: "var(--color-fountain)" }}>
            See Solo
          </Link>
        </p>
      ) : null}

      {isDraft ? (
        <div className="mt-4 flex items-center gap-4">
          <Link
            href={`/documents/${document.id}/edit`}
            className="btn-quiet inline-flex items-center gap-1"
          >
            <IconPencil size={16} />
            Edit the draft
          </Link>
          {document.type !== "proposal" ? null : (
            <span className="t-secondary">Nothing is sent until you send it.</span>
          )}
        </div>
      ) : (
        <section className="mt-6">
          <h2 className="t-label">Client link</h2>
          <p className="t-meta mt-2 break-all">{documentUrl(document.publicToken)}</p>
        </section>
      )}

      {sequence ? (
        <section className="mt-6">
          <h2 className="t-label">Reminders</h2>
          <p className="t-secondary mt-1">
            {limits.autoReminders
              ? sequence.label
              : "Automatic reminders are a Solo feature — you can still send each notice by hand."}
            {sends.length ? ` · ${sends.length} of 3 sent` : ""}
          </p>
        </section>
      ) : null}

      {/* The document itself, as the client will see it. */}
      <section className="mt-8">
        <h2 className="t-label mb-3">The document</h2>
        <DocSheet
          document={document}
          client={client}
          brand={brand}
          blocks={blocks}
          totals={totals}
          invoice={invoice}
          signature={signature}
          badge={limits.badge}
        >
          {invoice && outstanding === 0 && invoice.amountPaid > 0 ? (
            <p className="mt-8">
              <span className="stamp">Paid {invoice.paidAt ? formatShortDate(invoice.paidAt) : ""}</span>
            </p>
          ) : null}
        </DocSheet>
      </section>

      {payments.length ? (
        <section className="mt-8">
          <h2 className="t-label">Payments</h2>
          <ul className="mt-2 list-none p-0">
            {payments.map((payment) => (
              <li key={payment.id} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block">
                    {formatMoney(payment.amount, invoice?.currency ?? "USD")}
                  </span>
                  <span className="t-meta mt-1 block">
                    {payment.method === "card"
                      ? "Card"
                      : payment.method === "ach"
                        ? "Bank debit (ACH)"
                        : payment.method === "bank_transfer"
                          ? "Bank transfer"
                          : "Other"}{" "}
                    · {formatAuditTimestamp(payment.paidAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The chain this document belongs to. */}
      {nodes.length > 1 ? (
        <section className="mt-10">
          <h2 className="t-label">The chain</h2>
          <p className="t-secondary mt-1 mb-4">
            {formatMoneyShort(money.collected, document.currency)} collected of{" "}
            {formatMoneyShort(money.engagement, document.currency)}
            {money.outstanding > 0
              ? ` · ${formatMoneyShort(money.outstanding, document.currency)} outstanding`
              : ""}
          </p>
          <ChainThread nodes={nodes} now={now} justChangedId={recentlyChangedId(nodes, now)} />
        </section>
      ) : null}

      {/* Timeline: every event, in order, with who did it. */}
      <section className="mt-10">
        <h2 className="t-label">Timeline</h2>
        <ul className="mt-2 list-none p-0">
          {timeline.map((event) => (
            <li key={event.id} className="row items-start">
              <span className="min-w-0 flex-1">
                <span className="t-title block">{eventTitle(event.type)}</span>
                {event.detail ? <span className="t-secondary block">{event.detail}</span> : null}
                <span className="t-meta mt-1 block">
                  {formatAuditTimestamp(event.createdAt)} · {event.actor}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="t-secondary mt-8">
        {statusLabel(document.type, document.status)} ·{" "}
        {document.sentAt ? `sent ${formatShortDate(document.sentAt)}` : "not sent"}
        {document.firstViewedAt ? ` · first opened ${formatShortDate(document.firstViewedAt)}` : ""}
      </p>

      <DocumentActions
        documentId={document.id}
        shareUrl={documentUrl(document.publicToken)}
        primary={primary}
        canSend={!isDraft && document.status !== "void"}
        canRemind={canRemind}
        canBalance={canBalance}
        canVoid={document.status !== "paid" && document.status !== "void"}
        canRecordPayment={Boolean(invoice) && outstanding > 0 && !isDraft}
        outstandingLabel={
          invoice && outstanding > 0 ? formatMoney(outstanding, invoice.currency) : undefined
        }
        actions={{
          send: sendDocumentAction,
          remind: remindNowAction,
          balance: issueBalanceAction,
          void: voidDocumentAction,
          duplicate: duplicateDocumentAction,
        }}
        recordPayment={recordManualPaymentAction}
      />
    </main>
  );
}

function eventTitle(type: string): string {
  switch (type) {
    case "created":
      return "Created";
    case "sent":
      return "Sent";
    case "viewed":
      return "Opened by the client";
    case "accepted":
      return "Accepted";
    case "signed":
      return "Signed";
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Part payment received";
    case "reminded":
      return "Reminder sent";
    case "voided":
      return "Voided";
    default:
      return "Chained";
  }
}
