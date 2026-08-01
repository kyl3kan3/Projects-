import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicListing } from "@/lib/listings";
import { FAIR_HOUSING_NOTE } from "@/lib/application-pipeline";
import { formatDate, formatMoney } from "@/lib/money";
import { ApplicationForm } from "./ApplicationForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const listing = await getPublicListing((await params).slug);
  if (!listing) return { title: "Listing not found" };
  return {
    title: listing.headline,
    description: `${listing.rentLabel}/month · ${listing.beds} bed · ${listing.baths} bath in ${listing.city}, ${listing.state}. Apply online.`,
    openGraph: {
      title: listing.headline,
      description: `${listing.rentLabel}/month in ${listing.city}, ${listing.state}`,
      images: listing.photoUrls.slice(0, 1),
    },
  };
}

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getPublicListing(slug);
  if (!listing) notFound();

  return (
    <main className="screen mx-auto max-w-[680px]" style={{ paddingBottom: 56 }}>
      <header className="pt-10 pb-6">
        <p className="t-label">{listing.landlordName}</p>
        <h1 className="t-display mt-3">{listing.headline}</h1>
        <p className="t-data mt-4">
          {listing.rentLabel} / month · {listing.unitLabel} · {listing.beds} bed · {listing.baths} bath
          {listing.sqft ? ` · ${listing.sqft} sq ft` : ""}
        </p>
        <p className="t-secondary mt-1">
          {listing.city}, {listing.state}
        </p>
      </header>

      {listing.closed ? (
        <div className="notice mb-8" data-tone="warn">
          <p className="t-title">This one has been taken.</p>
          <p className="t-secondary mt-2">The listing is closed, so the form below is no longer accepting applications.</p>
        </div>
      ) : null}

      {listing.photoUrls.length > 0 ? (
        <section className="mb-8 flex flex-col gap-3">
          {listing.photoUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={`${listing.headline} — photo ${i + 1}`}
              className="w-full"
              style={{ borderRadius: 14, border: "1px solid var(--color-hairline)" }}
            />
          ))}
        </section>
      ) : null}

      {listing.description ? (
        <section className="mb-8">
          <p className="t-body whitespace-pre-wrap">{listing.description}</p>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="t-label mb-3">What is being asked for</h2>
        <dl className="m-0">
          <Row label="Rent" value={`${listing.rentLabel} a month`} />
          <Row label="Security deposit" value={formatMoney(listing.requirements.depositCents)} />
          <Row
            label="Income"
            value={
              listing.requirements.minIncomeMultiple > 0
                ? `At least ${listing.requirements.minIncomeMultiple}× the rent`
                : "No stated requirement"
            }
          />
          <Row label="Lease length" value={`${listing.requirements.leaseMonths} months`} />
          <Row label="Available from" value={formatDate(listing.requirements.availableOn, { year: true })} />
          <Row label="Pets" value={listing.requirements.petsAllowed ? "Considered" : "Not allowed"} />
          <Row label="Smoking" value={listing.requirements.smokingAllowed ? "Allowed" : "Not allowed"} />
        </dl>
      </section>

      {!listing.closed ? (
        <section>
          <h2 className="t-h2 mb-2">Apply</h2>
          <p className="t-secondary mb-6">
            Ten minutes, no account, and nothing to pay to send it. {FAIR_HOUSING_NOTE}
          </p>
          <ApplicationForm slug={slug} rentCents={listing.rentCents} availableOn={listing.requirements.availableOn} />
        </section>
      ) : null}

      <footer className="mt-12 pt-6" style={{ borderTop: "1px solid var(--color-hairline)" }}>
        <p className="t-secondary">
          Listed by {listing.landlordName}. This page and the application are run on TenantFile.
        </p>
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <dt className="t-secondary w-[45%] shrink-0">{label}</dt>
      <dd className="t-body m-0 min-w-0 flex-1">{value}</dd>
    </div>
  );
}
