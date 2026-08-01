import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLandlord } from "@/lib/auth";
import { landlordTenancy } from "@/lib/ledger";
import { ESIGN_HONESTY_NOTE, leaseBody, leaseForTenancy, leaseStatusLabel } from "@/lib/leases";
import { signingUrl } from "@/lib/links";
import { plan } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/money";
import { urlForKey } from "@/lib/storage";
import { CopyField } from "@/components/ActionForm";
import { LeaseActions } from "./LeaseActions";

export const metadata: Metadata = { title: "Lease" };
export const dynamic = "force-dynamic";

export default async function LeasePage({ params }: { params: Promise<{ id: string }> }) {
  const { landlord, user } = await requireLandlord();
  const { id } = await params;
  const owned = await landlordTenancy(landlord.id, id);
  if (!owned) notFound();

  const lease = await leaseForTenancy(id);
  const limits = plan(landlord.plan);
  const landlordSigned = lease?.signatures.some((s) => s.role === "landlord") ?? false;
  const tenantSigned = lease?.signatures.some((s) => s.role === "tenant") ?? false;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href={`/tenancies/${id}`} className="btn-quiet no-underline">
          {owned.tenancy.tenantNames.join(", ") || "Tenancy"}
        </Link>
        <h1 className="t-h2 mt-4">Lease</h1>
        <p className="t-secondary mt-1">
          {owned.property.address} <span className="t-data">{owned.unit.label}</span> ·{" "}
          {formatMoney(owned.tenancy.rentCents)}/month from {formatDate(owned.tenancy.startsOn as string, { year: true })}
        </p>
        {lease ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="pill" data-tone={lease.status === "signed" ? "green" : lease.status === "voided" ? "red" : "amber"}>
              {leaseStatusLabel(lease.status)}
            </span>
            <span className="pill">{landlordSigned ? "You signed" : "You have not signed"}</span>
            <span className="pill">{tenantSigned ? "Tenant signed" : "Tenant has not signed"}</span>
          </div>
        ) : null}
      </header>

      {!limits.eSign ? (
        <div className="notice mb-6" data-tone="warn">
          <p className="t-title">E-sign is on Building and above.</p>
          <p className="t-secondary mt-2">
            On {limits.name} you can still record a signed lease: sign it however you normally do, then attach the PDF here
            so it lives in the File.
          </p>
          <Link href="/settings/billing" className="btn btn-secondary btn-full mt-4">
            See the plans
          </Link>
        </div>
      ) : null}

      {lease && lease.status === "signed" ? (
        <section className="mb-8">
          <div className="notice" data-tone="good">
            <p className="t-title">Signed on {lease.signedAt?.toISOString().slice(0, 10)}.</p>
            <p className="t-secondary mt-2">
              The tenancy is active, the deposit and first month are on the ledger, and reminders are scheduled.
            </p>
          </div>
          {lease.signedPdfKey ? (
            <a className="btn btn-secondary btn-full mt-4" href={urlForKey(lease.signedPdfKey)} target="_blank" rel="noreferrer">
              Open the sealed lease PDF
            </a>
          ) : null}
          <div className="card mt-6 p-4">
            <p className="t-label mb-3">Signatures</p>
            {lease.signatures.map((sig, i) => (
              <div key={i} className={i > 0 ? "hairline-t pt-3 mt-3" : ""}>
                <p className="t-title">
                  {sig.role === "landlord" ? "Landlord" : "Tenant"} — {sig.typedName}
                </p>
                <p className="t-data mt-1" style={{ color: "var(--color-text-3)" }}>
                  {sig.signedAt} · {sig.ip}
                </p>
                <p className="t-secondary mt-2">&quot;{sig.consent}&quot;</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {lease && lease.status !== "voided" ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">What both parties will read</h2>
          <div className="card p-4">
            {leaseBody(lease.fields, lease.source).map((clause, i) => (
              <p key={i} className={`t-body ${i > 0 ? "mt-3" : ""}`}>
                {clause}
              </p>
            ))}
          </div>
          {lease.fields.uploadSha256 ? (
            <p className="t-secondary mt-3">
              Attached: {lease.fields.uploadFilename}. Checksum {lease.fields.uploadSha256.slice(0, 16)}… is sealed into the
              signature certificate, so a changed file will not match.
            </p>
          ) : null}
        </section>
      ) : null}

      {lease && (lease.status === "sent" || lease.status === "partially_signed") ? (
        <section className="mb-8 flex flex-col gap-4">
          <h2 className="t-label">Signing links</h2>
          <CopyField label="Tenant's link" value={signingUrl(lease.tenantToken)} />
          {!landlordSigned ? <CopyField label="Your link" value={signingUrl(lease.landlordToken)} /> : null}
          <p className="t-secondary">{ESIGN_HONESTY_NOTE}</p>
        </section>
      ) : null}

      <LeaseActions
        tenancyId={id}
        lease={
          lease
            ? {
                id: lease.id,
                status: lease.status,
                source: lease.source,
                landlordToken: lease.landlordToken,
                landlordSigned,
              }
            : null
        }
        landlordName={user.name || user.email}
        eSignAllowed={limits.eSign}
      />
    </main>
  );
}
