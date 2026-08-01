import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLandlord } from "@/lib/auth";
import { landlordApplication, screeningFor } from "@/lib/applications";
import {
  FAIR_HOUSING_NOTE,
  incomeRatioLabel,
  meetsIncomeRequirement,
  requiresAdverseAction,
  statusLabel,
} from "@/lib/application-pipeline";
import { screeningExpired, screeningStatusLabel, SCREENING_FEE_NOTE } from "@/lib/screening";
import { urlForKey } from "@/lib/storage";
import { formatDate, formatMoney } from "@/lib/money";
import { ApplicationActions } from "./ApplicationActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { landlord } = await requireLandlord();
  const owned = await landlordApplication(landlord.id, (await params).id);
  return { title: owned ? owned.application.applicantName : "Application" };
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { landlord, user } = await requireLandlord();
  const { id } = await params;
  const owned = await landlordApplication(landlord.id, id);
  if (!owned) notFound();

  const { application, unit, property, listing } = owned;
  const a = application.answers;
  const screening = await screeningFor(application.id);
  const needsLetter = requiresAdverseAction(application.status, screening != null);
  const clearsIncome = meetsIncomeRequirement(a.monthlyIncomeCents, unit.rentCents, listing.requirements.minIncomeMultiple);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/applications" className="btn-quiet no-underline">
          Applications
        </Link>
        <h1 className="t-h2 mt-4">{application.applicantName}</h1>
        <p className="t-secondary mt-1">
          {property.address} <span className="t-data">{unit.label}</span> · applied{" "}
          {formatDate(application.submittedAt.toISOString().slice(0, 10), { year: true })}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pill">{statusLabel(application.status)}</span>
          <span className="pill">{incomeRatioLabel(a.monthlyIncomeCents, unit.rentCents)}</span>
          {clearsIncome === false ? (
            <span className="pill" data-tone="amber">
              Below your {listing.requirements.minIncomeMultiple}× bar
            </span>
          ) : null}
        </div>
      </header>

      <section className="mb-8">
        <h2 className="t-label mb-3">Contact</h2>
        <dl className="m-0">
          <Row label="Email" value={application.applicantEmail} mono />
          <Row label="Phone" value={application.applicantPhone || "not given"} mono />
          <Row label="Lives now" value={a.currentAddress} />
          <Row label="Wants to move in" value={formatDate(a.moveInOn, { year: true })} mono />
          <Row label="Occupants" value={String(a.occupants)} mono />
        </dl>
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">Work and income, as stated</h2>
        <dl className="m-0">
          <Row label="Employer" value={a.employer || "not given"} />
          <Row label="Role" value={a.jobTitle || "not given"} />
          <Row label="Monthly income" value={a.monthlyIncomeCents ? formatMoney(a.monthlyIncomeCents) : "not stated"} mono />
          <Row label="Years there" value={a.employmentYears ? String(a.employmentYears) : "not given"} mono />
        </dl>
        <p className="t-secondary mt-3">
          These are the applicant&apos;s own answers. TenantFile does not verify income and does not score anyone — the only
          number it works out is income divided by rent.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">Previous landlord and the rest</h2>
        <dl className="m-0">
          <Row label="Previous landlord" value={a.previousLandlordName || "not given"} />
          <Row label="Their phone" value={a.previousLandlordPhone || "not given"} mono />
          <Row label="Pets" value={a.pets || "none listed"} />
          <Row label="Vehicles" value={a.vehicles || "none listed"} />
          <Row label="Smokes" value={a.smoker ? "yes" : "no"} />
        </dl>
        {a.notes ? (
          <div className="card mt-4 p-4">
            <p className="t-label mb-2">Their note</p>
            <p className="t-body whitespace-pre-wrap">{a.notes}</p>
          </div>
        ) : null}
        <p className="t-secondary mt-3">{FAIR_HOUSING_NOTE}</p>
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">Documents</h2>
        {application.documentKeys.length === 0 ? (
          <p className="t-secondary">Nothing attached.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {application.documentKeys.map((key, i) => (
              <li key={key} className="row">
                <span className="t-data flex-1 truncate">
                  Document {i + 1} · {key.split(".").pop()?.toUpperCase()}
                </span>
                <a className="btn-quiet" href={urlForKey(key)} target="_blank" rel="noreferrer">
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">Screening</h2>
        <div className="card p-4">
          <p className="t-title">{screeningStatusLabel(screening)}</p>
          {screening ? (
            <div className="mt-3">
              {screening.consentAt ? (
                <p className="t-secondary">
                  Authorised {screening.consentAt.toISOString().slice(0, 16).replace("T", " ")} UTC by &quot;
                  {screening.consentName}&quot; from {screening.consentIp}.
                </p>
              ) : (
                <p className="t-secondary">Waiting for the applicant to authorise it.</p>
              )}
              {screening.provider ? (
                <p className="t-secondary mt-2">
                  {screening.provider}
                  {screening.providerRef ? ` · ref ${screening.providerRef}` : ""}
                  {screening.receivedOn ? ` · received ${screening.receivedOn}` : ""}
                  {screeningExpired(screening) ? " · expired" : screening.expiresOn ? ` · good until ${screening.expiresOn}` : ""}
                </p>
              ) : null}
              {screening.landlordNote ? <p className="t-body mt-2 whitespace-pre-wrap">{screening.landlordNote}</p> : null}
            </div>
          ) : (
            <p className="t-secondary mt-2">{SCREENING_FEE_NOTE}</p>
          )}
        </div>
        <div className="notice mt-4">
          <p className="t-secondary">
            TenantFile does not run credit or background checks and never will hold what a report says. It records that
            the applicant authorised one, which agency you used, and when the report arrived — the paper trail you need if
            you later decline them.
          </p>
        </div>
      </section>

      <ApplicationActions
        applicationId={application.id}
        applicantName={application.applicantName}
        status={application.status}
        hasScreening={screening != null}
        needsLetter={needsLetter}
        landlordName={user.name || user.email}
        landlordEmail={user.email}
        propertyLine={`${unit.label} at ${property.address}`}
        adverseActionSentAt={application.adverseActionSentAt?.toISOString().slice(0, 10) ?? null}
        adverseActionBody={application.adverseActionBody}
      />
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row">
      <dt className="t-secondary w-[40%] shrink-0">{label}</dt>
      <dd className={`m-0 min-w-0 flex-1 ${mono ? "t-data" : "t-body"}`} style={{ wordBreak: "break-word" }}>
        {value}
      </dd>
    </div>
  );
}
