/**
 * /t/[token] — the tenant link (DESIGN.md screen 4).
 *
 * Mobile-first at 390px, plain language, no account. One page that knows which of
 * four things the tenant is here to do: read and sign the agreement, save a payment
 * method, pay the first month, or pay a balance and read receipts.
 *
 * The primary action is always the last thing on the page, in the thumb zone, and
 * there is exactly one of it.
 */

import type { Metadata } from "next";
import {
  MethodForm,
  PayBalanceForm,
  PayFirstMonthForm,
  SignForm,
} from "@/app/t/[token]/TenantForms";
import { leaseSections } from "@/lib/lease-text";
import { leaseFactsFor } from "@/lib/docs";
import { delinquency, kindLabel } from "@/lib/ledger-core";
import { entriesFor, toCoreEntries } from "@/lib/ledger";
import { verifyTenantToken } from "@/lib/links";
import { formatDate, formatMoney, isoDateOf, prorateFirstMonth } from "@/lib/money";
import { paymentsAreSimulated, SIMULATED_METHODS } from "@/lib/payments";
import { tenancyContext } from "@/lib/tenancy";

export const metadata: Metadata = {
  title: "Your unit",
  robots: { index: false, follow: false },
};

export default async function TenantPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claim = await verifyTenantToken(token);
  const ctx = claim ? await tenancyContext(claim.tenancyId) : null;

  if (!claim || !ctx) {
    return (
      <main style={{ maxWidth: 420, margin: "0 auto", padding: "56px 20px 80px" }}>
        <p className="t-label">UnitKeeper</p>
        <h1 className="t-display" style={{ marginTop: 12 }}>
          This link has expired
        </h1>
        <p className="t-body" style={{ marginTop: 12 }}>
          Links last 14 days for a move-in. Ask the facility office for a new one — they can send it
          in a few seconds.
        </p>
      </main>
    );
  }

  const asOf = isoDateOf(new Date());
  const entries = await entriesFor(ctx.tenancy.id);
  const delq = delinquency(toCoreEntries(entries), asOf);
  const firstCents = prorateFirstMonth(
    ctx.tenancy.rateCents,
    ctx.tenancy.startedOn,
    ctx.settings.prorateRule,
  );
  const facts = leaseFactsFor(ctx, firstCents);

  const needsSignature = !ctx.tenancy.signedAt;
  const needsMethod = Boolean(ctx.tenancy.signedAt) && !ctx.tenancy.stripePaymentMethodId;
  const needsFirstPayment =
    Boolean(ctx.tenancy.signedAt) &&
    Boolean(ctx.tenancy.stripePaymentMethodId) &&
    !ctx.tenancy.gateCode;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p className="t-label">{ctx.facility.name}</p>
      <h1 className="t-display" style={{ marginTop: 8 }}>
        Unit {ctx.unit.label}
      </h1>
      <p className="t-body" style={{ marginTop: 8 }}>
        {ctx.unit.size} · {formatMoney(ctx.tenancy.rateCents)} a month · starting{" "}
        {formatDate(ctx.tenancy.startedOn, { year: true })}
      </p>

      {ctx.tenancy.gateCode && ctx.tenancy.gateCodeStatus === "active" ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
          <p className="t-label">Your gate code</p>
          <p className="t-stat" style={{ marginTop: 4 }}>
            {ctx.tenancy.gateCode}
          </p>
        </section>
      ) : null}

      {ctx.tenancy.gateCodeStatus === "overlocked" ? (
        <p className="rail-stop" style={{ marginTop: 20 }}>
          Your unit is overlocked and the gate code is switched off because the balance is unpaid.
          Paying in full below restores access the same day.
        </p>
      ) : null}

      {/* ---- read and sign ---- */}
      {needsSignature ? (
        <>
          <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
            <h2 className="t-h2">Your rental agreement</h2>
            <p className="t-secondary" style={{ marginTop: 4 }}>
              Read it here. It is the same document you will get a copy of.
            </p>
            {leaseSections(facts).map((section) => (
              <div key={section.heading} style={{ marginTop: 20 }}>
                <h3 className="t-title">{section.heading}</h3>
                <p className="t-body" style={{ marginTop: 4 }}>
                  {section.body}
                </p>
              </div>
            ))}
          </section>
          <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
            <SignForm token={token} tenantName={ctx.tenant.name} />
          </section>
        </>
      ) : null}

      {/* ---- payment method ---- */}
      {needsMethod ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
          <h2 className="t-h2">How the rent gets paid</h2>
          <p className="t-secondary" style={{ marginTop: 4, marginBottom: 16 }}>
            Rent comes out automatically each month. You can change or stop it by calling the office.
          </p>
          <MethodForm
            token={token}
            methods={SIMULATED_METHODS}
            simulated={paymentsAreSimulated()}
          />
        </section>
      ) : null}

      {/* ---- first payment ---- */}
      {needsFirstPayment ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
          <h2 className="t-h2">First payment</h2>
          <p className="t-body" style={{ marginTop: 4, marginBottom: 16 }}>
            {formatMoney(firstCents)}
            {ctx.settings.prorateRule === "daily"
              ? ` — the rest of ${ctx.tenancy.startedOn.slice(0, 7)}, prorated from your start date.`
              : " — the first full month."}{" "}
            Your gate code is issued the moment it clears.
          </p>
          <PayFirstMonthForm token={token} amountLabel={formatMoney(firstCents)} />
        </section>
      ) : null}

      {/* ---- balance and receipts ---- */}
      {!needsSignature && !needsMethod && !needsFirstPayment ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="t-label">Balance</h2>
            <p className="t-stat">{formatMoney(delq.outstandingCents - delq.creditCents)}</p>
          </div>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {delq.since === null
              ? delq.creditCents > 0
                ? `${formatMoney(delq.creditCents)} in credit. Nothing to pay.`
                : "You are paid up. Nothing to pay."
              : `${delq.daysLate} day${delq.daysLate === 1 ? "" : "s"} past due.`}
          </p>
          {delq.outstandingCents > 0 ? (
            <div style={{ marginTop: 16 }}>
              <PayBalanceForm
                token={token}
                amountLabel={formatMoney(delq.outstandingCents)}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {entries.length > 0 ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
          <h2 className="t-label">Your receipts</h2>
          <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
            {[...entries].reverse().slice(0, 12).map((entry) => (
              <li className="row" key={entry.id}>
                <span style={{ flex: 1 }}>
                  <span className="t-title">{kindLabel(entry.kind)}</span>
                  <br />
                  <span className="t-secondary">
                    {entry.occurredOn} · {entry.description}
                  </span>
                </span>
                <span className="t-mono">{formatMoney(entry.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="t-secondary" style={{ marginTop: 32 }}>
        Questions about the unit or the balance: contact {ctx.facility.name}
        {ctx.owner.email ? ` at ${ctx.owner.email}` : ""}.
      </p>
    </main>
  );
}
