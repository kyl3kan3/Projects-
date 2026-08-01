import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLandlord } from "@/lib/auth";
import { landlordUnit } from "@/lib/units";
import { listingsForUnit } from "@/lib/listings";
import { applicationsForListing } from "@/lib/applications";
import { costByUnit } from "@/lib/maintenance";
import { incomeRatioLabel, statusLabel } from "@/lib/application-pipeline";
import { listingUrl } from "@/lib/links";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/money";
import { CopyField } from "@/components/ActionForm";
import { IconChevronRight } from "@/components/icons";
import { ListingSection } from "./ListingSection";
import { ImportTenancySection } from "./ImportTenancySection";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { landlord } = await requireLandlord();
  const owned = await landlordUnit(landlord.id, (await params).id);
  return { title: owned ? `${owned.property.address} ${owned.unit.label}` : "Unit" };
}

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { landlord } = await requireLandlord();
  const { id } = await params;
  const owned = await landlordUnit(landlord.id, id);
  if (!owned) notFound();

  const listings = await listingsForUnit(owned.unit.id);
  const live = listings.find((l) => l.status === "live") ?? null;
  const applications = live ? await applicationsForListing(live.id) : [];
  const spend = (await costByUnit(landlord.id)).find((s) => s.unitId === owned.unit.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/units" className="btn-quiet no-underline">
          Units
        </Link>
        <h1 className="t-h2 mt-4">
          {owned.property.address} <span className="t-data">{owned.unit.label}</span>
        </h1>
        <p className="t-secondary mt-1">
          {owned.property.city}, {owned.property.state} · {owned.unit.beds} bed · {owned.unit.baths} bath
          {owned.unit.sqft ? ` · ${owned.unit.sqft} sq ft` : ""} · {formatMoneyShort(owned.unit.rentCents)}/month
        </p>
      </header>

      {live ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">The link you paste everywhere</h2>
          <CopyField label="Listing page" value={listingUrl(live.slug)} />
          <p className="t-secondary mt-2">
            Craigslist, Facebook Marketplace, a Zillow post, a text to your neighbour — anyone who opens it can apply.
          </p>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="t-label mb-3">Applications</h2>
        {applications.length === 0 ? (
          <p className="t-secondary">
            {live
              ? "Nobody has applied yet. Applications land here the moment someone submits the form."
              : "No listing is live, so there is nowhere for anyone to apply from."}
          </p>
        ) : (
          <div className="stagger flex flex-col gap-3">
            {applications.map((application, i) => (
              <Link
                key={application.id}
                href={`/applications/${application.id}`}
                className="card block p-4 no-underline"
                style={{ "--i": i } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-title truncate">{application.applicantName}</p>
                    <p className="t-data mt-1" style={{ color: "var(--color-text-2)" }}>
                      {incomeRatioLabel(application.answers.monthlyIncomeCents, owned.unit.rentCents)}
                    </p>
                    <p className="t-secondary mt-2">
                      Wants {formatDate(application.answers.moveInOn)} · {application.answers.occupants} occupant
                      {application.answers.occupants === 1 ? "" : "s"} ·{" "}
                      {application.documentKeys.length} document{application.documentKeys.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="pill shrink-0" data-tone={pillTone(application.status)}>
                    <span className="dot" data-state={dotState(application.status)} aria-hidden="true" />
                    {statusLabel(application.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <ListingSection unitId={owned.unit.id} listing={live} rentCents={owned.unit.rentCents} depositCents={owned.unit.depositCents} />

      <ImportTenancySection unitId={owned.unit.id} rentCents={owned.unit.rentCents} depositCents={owned.unit.depositCents} />

      {spend && spend.requests > 0 ? (
        <section className="mt-8">
          <h2 className="t-label mb-3">Maintenance history</h2>
          <Link href="/requests" className="row no-underline">
            <span className="min-w-0 flex-1">
              <span className="t-title block">
                {spend.requests} request{spend.requests === 1 ? "" : "s"} on this unit
              </span>
              <span className="t-secondary block">Recorded spend</span>
            </span>
            <span className="t-data">{formatMoney(spend.totalCents)}</span>
            <IconChevronRight size={18} />
          </Link>
        </section>
      ) : null}
    </main>
  );
}

function pillTone(status: string): "green" | "amber" | "red" | "accent" | undefined {
  if (status === "approved") return "green";
  if (status === "declined") return "red";
  if (status === "screened") return "accent";
  if (status === "invited_to_screen") return "amber";
  return undefined;
}

function dotState(status: string): string {
  if (status === "approved") return "paid";
  if (status === "declined") return "late";
  if (status === "screened") return "accent";
  return "open";
}
