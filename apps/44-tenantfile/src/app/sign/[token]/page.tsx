import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONSENT_SENTENCE, ESIGN_HONESTY_NOTE, leaseByToken } from "@/lib/leases";
import { formatDate, formatMoney } from "@/lib/money";
import { SignForm } from "./SignForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign the lease", robots: { index: false, follow: false } };

/**
 * The signing page, phone first. The whole lease is above the signature — nobody
 * signs behind a "click to expand".
 */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await leaseByToken(token);
  if (!view) notFound();

  const f = view.lease.fields;
  const otherSigned = view.lease.signatures.some((s) => s.role !== view.role);

  return (
    <main className="screen mx-auto max-w-[620px]" style={{ paddingBottom: 56 }}>
      <header className="pt-10 pb-6">
        <p className="t-label">{view.role === "landlord" ? "Landlord copy" : "Tenant copy"}</p>
        <h1 className="t-h2 mt-3">
          {f.propertyAddress}, {f.unitLabel}
        </h1>
        <p className="t-data mt-3">
          {formatMoney(f.rentCents)} / month · {formatDate(f.startsOn, { year: true })} to{" "}
          {f.endsOn ? formatDate(f.endsOn, { year: true }) : "month to month"}
        </p>
      </header>

      {view.lease.status === "voided" ? (
        <div className="notice" data-tone="bad">
          <p className="t-title">This lease was voided.</p>
          <p className="t-secondary mt-2">Nothing here can be signed. Your landlord will send a new one.</p>
        </div>
      ) : view.alreadySigned ? (
        <div className="notice" data-tone="good">
          <p className="t-title">You have signed this.</p>
          <p className="t-secondary mt-2">
            {view.lease.status === "signed"
              ? "Both parties have signed. The tenancy is live and you will get a copy by email."
              : `Waiting on the ${view.role === "landlord" ? "tenant" : "landlord"} to sign.`}
          </p>
        </div>
      ) : null}

      <section className="card my-8 p-4">
        <p className="t-label mb-3">The lease</p>
        {view.body.map((clause, i) => (
          <p key={i} className={`t-body ${i > 0 ? "mt-3" : ""}`}>
            {clause}
          </p>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">The terms, at a glance</h2>
        <dl className="m-0">
          <Row label="Tenant" value={f.tenantNames.join(", ")} />
          <Row label="Landlord" value={f.landlordName} />
          <Row label="Rent" value={`${formatMoney(f.rentCents)} on day ${f.rentDueDay} of the month`} />
          <Row label="Deposit" value={formatMoney(f.depositCents)} />
          <Row label="Late fee" value={f.lateFeeSummary} />
        </dl>
      </section>

      {view.lease.status !== "voided" && !view.alreadySigned ? (
        <SignForm
          token={token}
          role={view.role}
          expectedNames={view.role === "landlord" ? [f.landlordName] : f.tenantNames}
          consentSentence={CONSENT_SENTENCE}
          otherSigned={otherSigned}
        />
      ) : null}

      <footer className="mt-12 pt-6" style={{ borderTop: "1px solid var(--color-hairline)" }}>
        <p className="t-secondary">{ESIGN_HONESTY_NOTE}</p>
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <dt className="t-secondary w-[42%] shrink-0">{label}</dt>
      <dd className="t-body m-0 min-w-0 flex-1">{value}</dd>
    </div>
  );
}
