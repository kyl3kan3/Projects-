import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { loadBundleByToken, recordView } from "@/lib/documents";
import { acceptanceState, explainLinkState, isWellFormedToken, linkViewState, signingState } from "@/lib/esign";
import { balanceDue, formatMoney, splitDeposit } from "@/lib/money";
import { describeDue, formatShortDate } from "@/lib/dates";
import { plan } from "@/lib/plans";
import { pricingLines } from "@/lib/documents";
import { DocSheet, SignatureBlock } from "@/components/DocSheet";
import { AcceptPanel } from "./AcceptPanel";
import { SignPanel } from "./SignPanel";
import { PayPanel } from "./PayPanel";
import { PrintButton } from "@/components/PrintButton";
import { acceptProposalAction, signContractAction, startPaymentAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your document",
  robots: { index: false, follow: false },
};

/**
 * The client-facing page. No account, no cookie: the token in the URL is the
 * capability, and every access rule it has to satisfy lives in src/lib/esign.ts.
 */
export default async function PublicDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;
  const now = new Date();

  const bundle = isWellFormedToken(token) ? await loadBundleByToken(token) : null;
  const view = linkViewState(token, bundle?.document ?? null, now);
  if (view !== "ok" || !bundle) {
    return (
      <main className="screen mx-auto max-w-[560px] pt-16">
        <p className="t-label">PaperTrail</p>
        <h1 className="t-h2 mt-4">{view === "voided" ? "This document was replaced." : "This link isn't open."}</h1>
        <p className="t-body mt-2">{explainLinkState(view)}</p>
      </main>
    );
  }

  const { document, client, brand, blocks, totals, invoice, signature } = bundle;

  // Log the first open. Deliberately not awaited into the render path's
  // correctness: a failed write must not stop the client reading the document.
  try {
    await recordView(document, client.email);
  } catch (err) {
    console.error("[public] could not record the view", err);
  }

  const db = getDb();
  const [owner] = await db.select().from(users).where(eq(users.id, document.userId));
  const limits = plan(owner?.plan ?? "free");
  const freelancerName = owner?.name?.trim() || owner?.email || "your contractor";
  const freelancerEmail = owner?.email ?? "";

  const canAccept = acceptanceState(token, document, now) === "ok";
  const canSign = signingState(token, document, now) === "ok";
  const outstanding = invoice ? balanceDue(invoice) : 0;
  const deposit =
    document.type === "contract" && document.depositPercent > 0 && limits.depositInvoices
      ? splitDeposit(totals.total, document.depositPercent)
      : null;

  return (
    <main className="screen mx-auto max-w-[720px] pt-6" style={{ paddingBottom: 48 }}>
      <div className="flex items-center justify-between gap-4">
        <p className="t-label">
          {document.type === "proposal" ? "Proposal" : document.type === "contract" ? "Agreement" : "Invoice"}{" "}
          from {freelancerName}
        </p>
        {document.status === "paid" ? <span className="seal" data-variant="paid">Paid</span> : null}
      </div>

      {paid && outstanding === 0 ? (
        <p className="t-body mt-4" style={{ color: "var(--color-wax)" }}>
          Payment received — thank you. A receipt is on its way.
        </p>
      ) : null}
      {paid && outstanding > 0 ? (
        <p className="t-secondary mt-4">
          Thanks — your payment is being confirmed by the bank. This page updates the moment it
          clears, usually within a minute for cards.
        </p>
      ) : null}

      <div className="mt-4">
        <DocSheet
          document={document}
          client={client}
          brand={brand}
          blocks={blocks}
          totals={totals}
          invoice={invoice}
          signature={signature}
          badge={limits.badge}
          pricingSlot={
            canAccept ? (
              <AcceptPanel
                token={token}
                caption={pricingCaption(blocks)}
                lines={pricingLines(blocks)}
                currency={document.currency}
                taxRateBps={document.taxRateBps}
                taxLabel={document.taxLabel}
                action={acceptProposalAction}
              />
            ) : undefined
          }
        >
          {invoice && outstanding === 0 && invoice.amountPaid > 0 ? (
            <p className="mt-8">
              <span className="stamp">
                Paid {invoice.paidAt ? formatShortDate(invoice.paidAt) : ""}
              </span>
            </p>
          ) : null}
        </DocSheet>
      </div>

      {/* Acceptance already happened: say what comes next, plainly. */}
      {document.type === "proposal" && document.status === "accepted" ? (
        <section className="mt-8">
          <h2 className="t-h2">Accepted{document.acceptedAt ? ` ${formatShortDate(document.acceptedAt)}` : ""}.</h2>
          <p className="t-body mt-2">
            {freelancerName} is preparing the agreement from exactly these terms. You'll get a link to
            read and sign it — nothing has been retyped, so there is nothing new to check.
          </p>
        </section>
      ) : null}

      {canSign ? (
        <section className="mt-10">
          <SignPanel
            token={token}
            clientName={client.name}
            clientEmail={client.email}
            depositLine={
              deposit
                ? `Signing invoices the ${document.depositPercent}% deposit of ${formatMoney(
                    deposit.deposit,
                    document.currency,
                  )} straight away. The balance of ${formatMoney(deposit.balance, document.currency)} is invoiced when the work is complete.`
                : null
            }
            action={signContractAction}
          />
        </section>
      ) : null}

      {document.type === "contract" && signature ? (
        <section className="mt-10">
          <h2 className="t-h2">Signed record</h2>
          <p className="t-secondary mt-1">
            This is your copy. It cannot be edited — a change means a new agreement.
          </p>
          <div className="mt-4">
            <SignatureBlock
              label="Signature of the Client"
              signature={signature}
              // Replay the stroke once for the person who just signed it.
              replay={now.getTime() - signature.signedAt.getTime() < 60_000}
            />
          </div>
        </section>
      ) : null}

      {invoice && outstanding > 0 && document.status !== "void" ? (
        <section className="mt-10">
          <h2 className="t-h2">
            {formatMoney(outstanding, invoice.currency)} due
            {invoice.dueAt ? ` — ${describeDue(invoice.dueAt, now)}` : ""}
          </h2>
          {invoice.amountPaid > 0 ? (
            <p className="t-secondary mt-1">
              {formatMoney(invoice.amountPaid, invoice.currency)} already received against{" "}
              {formatMoney(invoice.total, invoice.currency)}.
            </p>
          ) : null}
          <div className="mt-4">
            <PayPanel
              token={token}
              balance={outstanding}
              currency={invoice.currency}
              acceptsAch={invoice.currency.toUpperCase() === "USD"}
              freelancerEmail={freelancerEmail}
              start={startPaymentAction}
            />
          </div>
        </section>
      ) : null}

      <footer className="hairline-t mt-12 pt-4">
        <p className="t-secondary">
          Questions about this document? Reply to {freelancerEmail || freelancerName} directly.
        </p>
        <PrintButton />
      </footer>
    </main>
  );
}

function pricingCaption(blocks: { content: { kind: string; caption?: string } }[]): string {
  const table = blocks.find((b) => b.content.kind === "pricing_table");
  return (table?.content as { caption?: string } | undefined)?.caption ?? "Fees";
}
