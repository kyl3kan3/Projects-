import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalByToken } from "@/lib/portal";
import { LedgerStrip } from "@/components/LedgerStrip";
import { formatDate, formatMoney, formatPeriod, isoDateOf } from "@/lib/money";
import { requestStatusLabel } from "@/lib/maintenance";
import { IconChevronRight } from "@/components/icons";
import { PayPanel } from "./PayPanel";
import { NewRequestForm } from "./NewRequestForm";

export const dynamic = "force-dynamic";

/**
 * The tenant's page. A receipt, not an app: the landlord's name is the header,
 * there is no TenantFile chrome above the fold, and everything they need — what is
 * owed, what they have paid, and how to report a problem — is on one screen.
 */
export const metadata: Metadata = {
  title: "Your rent",
  robots: { index: false, follow: false },
};

export default async function TenantPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await portalByToken(token);
  if (!view) notFound();

  const { tenancy, landlord, unitLabel, address, city, state, ledger, strip, requests, year } = view;
  const today = isoDateOf(new Date());
  const next = ledger.charges.find((c) => c.outstandingCents > 0) ?? null;
  const late = next != null && next.charge.dueOn < today;
  const openRequests = requests.filter((r) => r.status !== "closed");

  return (
    <main className="screen mx-auto max-w-[560px]" style={{ paddingBottom: 56 }}>
      <header className="pt-10 pb-6">
        <p className="t-label">{landlord.name}</p>
        <h1 className="t-data mt-3" style={{ fontSize: 18 }}>
          {address} · {unitLabel}
        </h1>
        <p className="t-secondary mt-1">
          {city}
          {state ? `, ${state}` : ""}
        </p>
      </header>

      <section className="card mb-8 p-4">
        <p className="t-label">{ledger.creditCents > 0 ? "You are paid ahead" : "Balance"}</p>
        <p
          className="t-stat mt-2"
          style={{
            color:
              ledger.balanceCents === 0 ? "var(--color-rent-green)" : late ? "var(--color-red)" : "var(--color-ink)",
          }}
        >
          {formatMoney(ledger.creditCents > 0 ? ledger.creditCents : ledger.balanceCents)}
        </p>
        <p className="t-secondary mt-2">
          {ledger.balanceCents === 0 && ledger.creditCents === 0
            ? "Nothing owed. Thank you."
            : ledger.creditCents > 0
              ? "This will come off your next rent."
              : next
                ? `${formatMoney(next.outstandingCents)} ${next.charge.kind === "late_fee" ? "late fee" : "rent"} due ${formatDate(next.charge.dueOn, { year: true })}${late ? " — past due" : ""}`
                : ""}
        </p>
        {ledger.processingCents > 0 ? (
          <p className="t-secondary mt-2" style={{ color: "var(--color-amber)" }}>
            {formatMoney(ledger.processingCents)} is on its way from your bank. Bank payments take a few days to clear;
            the balance above updates when it lands.
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">Your rent this year</h2>
        <LedgerStrip cells={strip} year={year} />
      </section>

      <PayPanel
        token={token}
        landlordName={landlord.name}
        amountDueCents={next?.outstandingCents ?? 0}
        cardPassthrough={landlord.settings.cardFeePassthrough}
        canPayOnline={Boolean(landlord.stripeAccountId)}
      />

      <section className="mb-8">
        <h2 className="t-label mb-3">Everything on your account</h2>
        {ledger.lines.length === 0 ? (
          <p className="t-secondary">Nothing yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {[...ledger.lines].reverse().map((line) => (
              <li key={`${line.kind}-${line.id}`} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-body block truncate">{line.label}</span>
                  <span className="t-data block" style={{ color: "var(--color-text-3)" }}>
                    {line.date}
                    {line.detail ? ` · ${line.detail}` : ""}
                  </span>
                </span>
                <span
                  className="t-data"
                  style={{ color: line.kind === "payment" ? "var(--color-rent-green)" : undefined }}
                >
                  {line.kind === "payment" ? "-" : ""}
                  {formatMoney(Math.abs(line.deltaCents))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="t-secondary mt-3">
          This is the same ledger {landlord.name} sees. If something is missing or wrong, tell them — it is a record you
          both rely on.
        </p>
      </section>

      {openRequests.length > 0 ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">Repairs you have reported</h2>
          {requests.map((request) => (
            <Link key={request.id} href={`/t/${token}/requests/${request.id}`} className="row no-underline">
              <span
                className="dot"
                data-state={request.status === "closed" || request.status === "done" ? "paid" : "open"}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{request.title}</span>
                <span className="t-secondary block">{requestStatusLabel(request.status)}</span>
              </span>
              {request.tenantUnread > 0 ? <span className="dot" data-state="accent" aria-label="New reply" /> : null}
              <IconChevronRight size={18} />
            </Link>
          ))}
        </section>
      ) : null}

      <NewRequestForm token={token} />

      <footer className="mt-12 pt-6" style={{ borderTop: "1px solid var(--color-hairline)" }}>
        <p className="t-secondary">
          Bookmark this page — there is nothing to download and no password to remember. It is private to your tenancy:
          anyone with the link can see it, so keep it to yourself.
        </p>
        <p className="t-secondary mt-3">
          Your tenancy: {formatPeriod((tenancy.startsOn as string).slice(0, 7))} to{" "}
          {tenancy.endsOn ? formatPeriod((tenancy.endsOn as string).slice(0, 7)) : "month to month"} ·{" "}
          {formatMoney(tenancy.rentCents)} a month, due on day {tenancy.rentDueDay}.
        </p>
      </footer>
    </main>
  );
}
