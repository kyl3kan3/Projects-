import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatIso, today } from "@/lib/dates";
import { agingBucket, daysPastDue } from "@/lib/dues";
import { enrollmentFor } from "@/lib/autopay";
import { householdInvoices, associationBalances, type InvoiceLedger } from "@/lib/invoicing";
import { householdWithMembers } from "@/lib/roster";
import { formatMoney } from "@/lib/money";
import { can, featureAllowed, planForFeature } from "@/lib/plans";
import { formatPhone } from "@/lib/text";
import { memberIssues } from "@/lib/issues";
import {
  DataRow,
  HeroAmount,
  InvoicePill,
  Money,
  Notice,
  PaidSeal,
} from "@/components/ledger";
import { IconBank, IconCard, IconChevronLeft, IconRepeat } from "@/components/icons";
import { RecordPaymentForm } from "../DuesActions";
import { HouseholdPowerActions } from "./PowerActions";

export const metadata: Metadata = { title: "Household" };
export const dynamic = "force-dynamic";

export default async function HouseholdPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { user, association } = await requireUser();
  const { householdId } = await params;
  const entry = await householdWithMembers(householdId);
  if (!entry || entry.household.associationId !== association.id) notFound();

  const { household, members } = entry;
  const ledgers = await householdInvoices(householdId);
  const balances = await associationBalances(association.id);
  const balance = balances.get(householdId);
  const enrollment = await enrollmentFor(householdId);
  const issues = await memberIssues(householdId);
  const canMove = can(user.role, "money");
  const asOf = today();

  const open = ledgers.filter(
    (l) => l.balanceCents > 0 && l.invoice.status !== "written_off",
  );
  const oldest = open.at(-1) ?? null;
  const primary = members.find((m) => m.isPrimary) ?? members[0] ?? null;

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/dues" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Dues
        </Link>
        <p className="t-label mt-6">
          {household.leftOn ? `Closed ${formatIso(household.leftOn)}` : "Unit"}
        </p>
        <h1 className="t-h2 mt-1">{household.unitLabel}</h1>
        <p className="t-secondary mt-1">
          {primary?.name ?? "No contact on file"} · joined {formatIso(household.joinedOn)}
        </p>
      </header>

      <section className="mt-6">
        <p className="t-label">Balance</p>
        <div className="mt-1">
          <HeroAmount cents={balance?.balanceCents ?? 0} />
        </div>
        <p className="t-secondary mt-1">
          {(balance?.balanceCents ?? 0) === 0
            ? "Nothing outstanding."
            : `${open.length} open invoice${open.length === 1 ? "" : "s"}${
                balance?.oldestDueOn
                  ? ` · oldest due ${formatIso(balance.oldestDueOn)} (${Math.max(0, daysPastDue(balance.oldestDueOn, asOf))} days)`
                  : ""
              }`}
          {balance && balance.pendingCents > 0
            ? ` · ${formatMoney(balance.pendingCents)} clearing by ACH`
            : ""}
        </p>
        {balance && balance.creditCents > 0 ? (
          <p className="t-secondary mt-2 green">
            {formatMoney(balance.creditCents)} credit on file from an overpayment.
          </p>
        ) : null}
      </section>

      {household.leftOn ? (
        <section className="mt-6">
          <Notice>
            This household closed on {formatIso(household.leftOn)}. Any balance stays here, with the
            people who owed it — it is never moved onto the new owner.
          </Notice>
        </section>
      ) : null}

      <section className="mt-8 split">
        <div>
          <h2 className="t-h2">Invoices</h2>
          <div className="mt-4 flex flex-col gap-4">
            {ledgers.length === 0 ? (
              <p className="t-secondary">
                No invoices yet. They appear here the moment an assessment run creates them.
              </p>
            ) : (
              ledgers.map((ledger) => (
                <InvoicePanel
                  key={ledger.invoice.id}
                  ledger={ledger}
                  associationName={association.name}
                  canMove={canMove}
                  lateFeesAllowed={featureAllowed(association.plan, "lateFeeRules")}
                />
              ))
            )}
          </div>
        </div>

        <div>
          {canMove && oldest ? (
            <div id="record" className="panel p-4">
              <p className="t-label">Record a check</p>
              <p className="t-secondary mt-2">
                Against {oldest.invoice.periodLabel}, {formatMoney(oldest.balanceCents)} outstanding.
              </p>
              <div className="mt-4">
                <RecordPaymentForm
                  invoiceId={oldest.invoice.id}
                  suggestedCents={oldest.balanceCents}
                  todayIso={asOf}
                />
              </div>
            </div>
          ) : null}

          <div className="panel mt-4 p-4">
            <div className="flex items-center gap-2">
              <IconRepeat size={18} className={enrollment?.status === "active" ? "green" : "ink-3"} />
              <p className="t-label">Autopay</p>
            </div>
            {enrollment ? (
              <>
                <p className="t-body mt-2 flex items-center gap-2">
                  {enrollment.method === "ach" ? <IconBank size={18} /> : <IconCard size={18} />}
                  {enrollment.method === "ach" ? "Bank transfer" : "Card"} ·{" "}
                  {enrollment.status === "active"
                    ? `enrolled ${formatIso(enrollment.enrolledAt.toISOString().slice(0, 10))}`
                    : enrollment.status}
                </p>
                {enrollment.lastError ? (
                  <p className="t-secondary mt-2 amber">Last attempt: {enrollment.lastError}</p>
                ) : null}
                <p className="t-secondary mt-2">
                  {enrollment.lastChargeAt
                    ? `Last charged ${formatIso(enrollment.lastChargeAt.toISOString().slice(0, 10))}.`
                    : "Not charged yet."}
                </p>
              </>
            ) : (
              <p className="t-secondary mt-2">
                Not enrolled. Only the household can enrol, from their own portal link, and only
                after an emailed step-up — a forwarded link is never enough to store a bank account.
              </p>
            )}
          </div>

          <div className="panel mt-4 p-4">
            <p className="t-label">Contacts</p>
            <div className="mt-2">
              {members.map((member) => (
                <div key={member.id} className="hairline-b py-2 last:border-0">
                  <p className="t-title">
                    {member.name}
                    {member.isPrimary ? <span className="t-label ml-2">Primary</span> : null}
                  </p>
                  <p className="t-secondary">{member.email ?? "no email on file"}</p>
                  <p className="t-data ink-3 mt-1">
                    {formatPhone(member.phone)}
                    {member.smsOptIn ? " · texts on" : " · texts off"}
                  </p>
                </div>
              ))}
            </div>
            <div className="hairline-t mt-3 pt-3">
              <Link href={`/roster/${household.id}`} className="btn-quiet">
                Manage this household
              </Link>
            </div>
          </div>

          {issues.length > 0 ? (
            <div className="panel mt-4 p-4">
              <p className="t-label">Issues</p>
              <div className="mt-2">
                {issues.slice(0, 4).map((issue) => (
                  <Link key={issue.id} href={`/issues/${issue.id}`} className="row">
                    <span className="min-w-0 flex-1">
                      <span className="t-number">{issue.number}</span>
                      <span className="t-secondary block truncate">{issue.title}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {canMove && (balance?.balanceCents ?? 0) > 0 ? (
            <div className="panel mt-4 p-4">
              <p className="t-label">Payment plan</p>
              {featureAllowed(association.plan, "paymentPlans") ? (
                <>
                  <p className="t-secondary mt-2">
                    Splits {formatMoney(balance?.balanceCents ?? 0)} into equal monthly instalments
                    that add back to the cent. The original invoices are written off with the plan
                    named as the reason, so the total owed never changes.
                  </p>
                  <div className="mt-4">
                    <HouseholdPowerActions
                      householdId={household.id}
                      balanceCents={balance?.balanceCents ?? 0}
                      todayIso={asOf}
                    />
                  </div>
                </>
              ) : (
                <p className="t-secondary mt-2">
                  Payment plans come with {planForFeature("paymentPlans").name}.{" "}
                  <Link href="/settings/billing">See plans</Link>.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

/** The statement panel: card, radius 12, hairline line items, the seal top-right. */
function InvoicePanel({
  ledger,
  associationName,
  canMove,
  lateFeesAllowed,
}: {
  ledger: InvoiceLedger;
  associationName: string;
  canMove: boolean;
  lateFeesAllowed: boolean;
}) {
  const { invoice, lines } = ledger;
  const asOf = today();
  const late = daysPastDue(invoice.dueOn, asOf);
  const bucket = agingBucket(invoice.dueOn, asOf);

  return (
    <article className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-label">{associationName}</p>
          <p className="t-title mt-1">{invoice.periodLabel}</p>
          <p className="t-data ink-3 mt-1">
            due {formatIso(invoice.dueOn)}
            {ledger.balanceCents > 0 && late > 0 ? ` · ${late} days late` : ""}
          </p>
        </div>
        {invoice.status === "paid" ? <PaidSeal /> : <InvoicePill status={invoice.status} />}
      </div>

      {invoice.prorationNote ? (
        <p className="t-secondary mt-3">{invoice.prorationNote}</p>
      ) : null}

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
        <DataRow label="Invoice total">{formatMoney(ledger.totalCents)}</DataRow>
        {ledger.settledCents > 0 ? (
          <DataRow label="Paid">{formatMoney(ledger.settledCents)}</DataRow>
        ) : null}
        {ledger.pendingCents > 0 ? (
          <DataRow label="Clearing by ACH">{formatMoney(ledger.pendingCents)}</DataRow>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="t-title">Balance</span>
          <span className="t-data" style={{ color: bucket === "90" && ledger.balanceCents > 0 ? "var(--color-red)" : undefined }}>
            {formatMoney(ledger.balanceCents)}
          </span>
        </div>
      </div>

      {ledger.payments.length > 0 ? (
        <div className="hairline-t mt-3 pt-3">
          <p className="t-label">Payments</p>
          {ledger.payments.map((payment) => (
            <div key={payment.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="t-secondary">
                {formatIso(payment.receivedOn)} · {payment.method}
                {payment.reference ? ` · ${payment.reference}` : ""}
                {payment.status !== "settled" ? ` · ${payment.status}` : ""}
              </span>
              <Money cents={payment.amountCents} />
            </div>
          ))}
        </div>
      ) : null}

      {canMove && invoice.status !== "written_off" ? (
        <div className="hairline-t mt-3 pt-3">
          <HouseholdPowerActions
            invoiceId={invoice.id}
            hasLateFee={ledger.lateFeeCents > 0}
            lateFeesAllowed={lateFeesAllowed}
            balanceCents={ledger.balanceCents}
            todayIso={asOf}
          />
        </div>
      ) : null}
    </article>
  );
}
