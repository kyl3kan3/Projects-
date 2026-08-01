import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { associations } from "@/db/schema";
import { verifyPortalToken, type PortalFailure } from "@/lib/portal";
import { associationBalances, householdInvoices, type InvoiceLedger } from "@/lib/invoicing";
import { enrollmentFor } from "@/lib/autopay";
import { listDocuments, documentUrl, CATEGORY_LABELS } from "@/lib/documents";
import { memberIssues, signPhotos, threadForMember, ISSUE_KIND_LABELS } from "@/lib/issues";
import { formatIso, today } from "@/lib/dates";
import { daysPastDue } from "@/lib/dues";
import { formatMoney } from "@/lib/money";
import { featureAllowed } from "@/lib/plans";
import {
  DataRow,
  HeroAmount,
  InvoicePill,
  IssuePill,
  Money,
  Notice,
  PaidSeal,
} from "@/components/ledger";
import { IconBank, IconCard, IconDownload, IconRepeat } from "@/components/icons";
import { AutopayInvite, NewLinkForm, RequestForm, SmsPreference } from "./PortalForms";
import { PayButton } from "./PayButton";

export const metadata: Metadata = {
  title: "Your household",
  // A payment link in an inbox must never be indexed or previewed.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const FAILURE_COPY: Record<PortalFailure, { title: string; body: string }> = {
  expired: {
    title: "This link has expired.",
    body:
      "Payment links roll over every 90 days so an old email cannot open your household's page forever. Ask for a new one and it will be in your inbox in a moment.",
  },
  revoked: {
    title: "This link has been replaced.",
    body:
      "A newer link was issued for you, which retires the old one. Check your inbox for the most recent email from your association, or ask for a fresh link below.",
  },
  invalid: {
    title: "We could not read that link.",
    body:
      "It may have been broken across two lines by an email client. Try copying the whole address, or ask for a new link below.",
  },
};

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const result = await verifyPortalToken(token);

  if (!result.ok) {
    const copy = FAILURE_COPY[result.reason];
    return (
      <main className="screen-plain pt-12" style={{ maxWidth: 480 }}>
        <p className="t-label">DuesDesk</p>
        <h1 className="t-h2 mt-4">{copy.title}</h1>
        <p className="t-body mt-3">{copy.body}</p>
        <div className="panel mt-8 p-5">
          <NewLinkForm />
        </div>
        <p className="t-secondary mt-6">
          You never need a password or an account here. Your association&apos;s board can also read
          the link out to you over the phone.
        </p>
      </main>
    );
  }

  const { member, household } = result.session;
  const db = getDb();
  const [association] = await db
    .select()
    .from(associations)
    .where(eq(associations.id, household.associationId));

  const ledgers = await householdInvoices(household.id);
  const balances = await associationBalances(household.associationId);
  const balance = balances.get(household.id);
  const enrollment = await enrollmentFor(household.id);
  const issues = await memberIssues(household.id);
  const documents = featureAllowed(association.plan, "documentLibrary")
    ? await listDocuments(household.associationId, { memberVisibleOnly: true })
    : [];
  const docUrls = new Map<string, string>();
  for (const doc of documents) {
    try {
      docUrls.set(doc.id, await documentUrl(doc));
    } catch {
      // A signing failure loses a download link, not the page.
    }
  }

  const asOf = today();
  const payable = ledgers.filter((l) => l.dueNowCents > 0);
  const clearing = ledgers.filter((l) => l.pendingCents > 0);

  return (
    <main className="screen-plain pt-10" style={{ maxWidth: 560 }}>
      <header>
        <p className="t-label">{association.name}</p>
        <h1 className="t-h2 mt-2">{household.unitLabel}</h1>
        <p className="t-secondary mt-1">
          {member.name} · member since {formatIso(household.joinedOn)}
        </p>
      </header>

      {query.paid ? (
        <section className="mt-6">
          <Notice>
            {clearing.length > 0
              ? "Thank you. A bank transfer takes a few business days to clear — your invoice will say “processing” until it does, and then it is done. Nothing more is needed from you."
              : "Thank you. Your payment is recorded and your balance below is up to date."}
          </Notice>
        </section>
      ) : null}

      <section className="mt-8">
        <p className="t-label">Balance</p>
        <div className="mt-1">
          <HeroAmount cents={balance?.balanceCents ?? 0} />
        </div>
        <p className="t-secondary mt-1">
          {(balance?.balanceCents ?? 0) === 0
            ? "You are all square. Thank you."
            : `${payable.length} invoice${payable.length === 1 ? "" : "s"} to pay`}
          {balance && balance.pendingCents > 0
            ? ` · ${formatMoney(balance.pendingCents)} clearing`
            : ""}
        </p>
        {balance && balance.creditCents > 0 ? (
          <p className="t-secondary mt-2 green">
            {formatMoney(balance.creditCents)} credit on file from an earlier overpayment. The board
            will apply it to your next invoice.
          </p>
        ) : null}
      </section>

      {/* The wedge: this block is first, every visit, until autopay is on. */}
      <section className="mt-8">
        {enrollment?.status === "active" ? (
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <IconRepeat size={20} className="green" />
              <p className="t-title">Autopay is on.</p>
            </div>
            <p className="t-secondary mt-2 flex items-center gap-2">
              {enrollment.method === "ach" ? <IconBank size={18} /> : <IconCard size={18} />}
              {enrollment.method === "ach" ? "Bank transfer" : "Card"} · enrolled{" "}
              {formatIso(enrollment.enrolledAt.toISOString().slice(0, 10))}
            </p>
            <p className="t-secondary mt-2">
              Your dues are paid on the due date and you get a receipt each time. To change or stop
              it, reply to any DuesDesk email and the board will help.
            </p>
          </div>
        ) : (
          <div className="panel p-5">
            <p className="t-label">The easy way</p>
            <h2 className="t-h2 mt-1">Never think about dues again.</h2>
            <div className="mt-4">
              <AutopayInvite token={token} unitLabel={household.unitLabel} />
            </div>
            {enrollment?.status === "failed" ? (
              <p className="t-secondary mt-3 amber">
                An earlier autopay attempt failed{enrollment.lastError ? `: ${enrollment.lastError}` : ""}.
                Setting it up again replaces the old details.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Invoices</h2>
        <div className="mt-4 flex flex-col gap-4">
          {ledgers.length === 0 ? (
            <p className="t-secondary">
              No invoices yet. The first one arrives by email when your board runs the next
              assessment.
            </p>
          ) : (
            ledgers.map((ledger) => (
              <PortalInvoice
                key={ledger.invoice.id}
                ledger={ledger}
                token={token}
                associationName={association.name}
                asOf={asOf}
              />
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Your requests</h2>
        <p className="t-secondary mt-2">
          Anything you file, and everything the board posts about it. Dated, in order, never edited.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {issues.length === 0 ? (
            <p className="t-secondary">Nothing open.</p>
          ) : (
            await Promise.all(
              issues.map(async (issue) => {
                const thread = await threadForMember(household.id, issue.id);
                const photos = await signPhotos(
                  (thread?.events ?? []).flatMap((e) => e.photoKeys),
                );
                return (
                  <article key={issue.id} className="panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="t-number">{issue.number}</span>
                          <span className="t-label">{ISSUE_KIND_LABELS[issue.kind]}</span>
                        </span>
                        <p className="t-title mt-1">{issue.title}</p>
                      </div>
                      <IssuePill status={issue.status} />
                    </div>
                    <div className="mt-3">
                      {(thread?.events ?? []).map((event) => (
                        <div key={event.id} className="hairline-t py-3 first:border-0 first:pt-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                              {event.authorLabel}
                            </span>
                            <span className="t-data ink-3">
                              {formatIso(event.createdAt.toISOString().slice(0, 10))}
                            </span>
                          </div>
                          <p className="t-body mt-1 whitespace-pre-wrap">{event.body}</p>
                          {event.photoKeys.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {event.photoKeys.map((key) =>
                                photos.get(key) ? (
                                  <a key={key} href={photos.get(key)} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="thumb" src={photos.get(key)} alt="Attached photo" />
                                  </a>
                                ) : null,
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              }),
            )
          )}
        </div>
        <div className="mt-4">
          <RequestForm token={token} />
        </div>
      </section>

      {documents.length > 0 ? (
        <section className="mt-10">
          <h2 className="t-h2">Association documents</h2>
          <div className="mt-2">
            {documents.map((doc) => (
              <div key={doc.id} className="hairline-b flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="t-title truncate">{doc.title}</p>
                  <p className="t-data ink-3 mt-1">
                    {CATEGORY_LABELS[doc.category]} · {doc.versionLabel}
                  </p>
                </div>
                {docUrls.get(doc.id) ? (
                  <a
                    className="btn-quiet inline-flex items-center gap-1"
                    href={docUrls.get(doc.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconDownload size={18} />
                    Open
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="t-h2">How we reach you</h2>
        <div className="panel mt-4 p-5">
          <DataRow label="Email">{member.email ?? "none on file"}</DataRow>
          <DataRow label="Mobile">{member.phone ?? "none on file"}</DataRow>
          <div className="hairline-t mt-3 pt-3">
            <SmsPreference token={token} optIn={member.smsOptIn} hasPhone={Boolean(member.phone)} />
          </div>
        </div>
      </section>

      <footer className="mt-12 hairline-t pt-6">
        <p className="t-secondary">
          This page is yours through the link in your association&apos;s emails — no account, no
          password. It rolls over every 90 days, and your board can retire it at any time.
        </p>
        <p className="t-secondary mt-2">
          {association.name} runs on DuesDesk. Questions about a charge go to your board, who can see
          everything you see here.
        </p>
      </footer>
    </main>
  );
}

function PortalInvoice({
  ledger,
  token,
  associationName,
  asOf,
}: {
  ledger: InvoiceLedger;
  token: string;
  associationName: string;
  asOf: string;
}) {
  const { invoice, lines } = ledger;
  const late = daysPastDue(invoice.dueOn, asOf);

  return (
    <article className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-label">{associationName}</p>
          <p className="t-title mt-1">{invoice.periodLabel}</p>
          <p className="t-data ink-3 mt-1">
            due {formatIso(invoice.dueOn)}
            {ledger.balanceCents > 0 && late > 0 ? ` · ${late} days ago` : ""}
          </p>
        </div>
        {invoice.status === "paid" ? <PaidSeal /> : <InvoicePill status={invoice.status} />}
      </div>

      {invoice.prorationNote ? <p className="t-secondary mt-3">{invoice.prorationNote}</p> : null}

      <div className="mt-4">
        {lines.map((line) => (
          <div key={line.id} className="hairline-b flex items-baseline justify-between gap-3 py-2">
            <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
              {line.description}
            </span>
            <Money cents={line.amountCents} />
          </div>
        ))}
      </div>

      <div className="rule-ink mt-3 pt-3">
        <DataRow label="Total">{formatMoney(ledger.totalCents)}</DataRow>
        {ledger.settledCents > 0 ? (
          <DataRow label="Paid">{formatMoney(ledger.settledCents)}</DataRow>
        ) : null}
        {ledger.pendingCents > 0 ? (
          <DataRow label="Clearing">{formatMoney(ledger.pendingCents)}</DataRow>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="t-title">Balance</span>
          <span className="t-data">{formatMoney(ledger.balanceCents)}</span>
        </div>
      </div>

      {ledger.pendingCents > 0 ? (
        <p className="t-secondary mt-3 amber">
          A bank transfer of {formatMoney(ledger.pendingCents)} is clearing. It takes a few business
          days. Please do not pay again — this invoice will settle itself.
        </p>
      ) : null}

      {ledger.dueNowCents > 0 ? (
        <div className="mt-4">
          <PayButton
            token={token}
            invoiceId={invoice.id}
            amountCents={ledger.dueNowCents}
          />
        </div>
      ) : null}
    </article>
  );
}
