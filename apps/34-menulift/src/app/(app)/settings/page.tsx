import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { storageDriver } from "@/lib/storage";
import { enhancerDescription } from "@/lib/photo-pipeline";
import { PLANS, isPlanId } from "@/lib/plans";
import { money } from "@/lib/format";
import { AddLocationForm, LocationForm, PinForm, SignOutButton } from "./SettingsUi";
import { CopyField } from "@/components/CopyField";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, organization, location, locations } = await requireUser();
  const plan = PLANS[isPlanId(organization.plan) ? organization.plan : "menu"];

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <h1 className="t-h2" style={{ marginTop: 0, marginBottom: 24 }}>
        Settings
      </h1>

      <section className="hairline-b" style={{ paddingBottom: 32 }}>
        <h2 className="t-label" style={{ marginTop: 0, marginBottom: 16 }}>
          This location
        </h2>
        <LocationForm
          name={location.name}
          address={location.address ?? ""}
          timezone={location.timezone}
          rollover={location.serviceRolloverHour}
        />
      </section>

      <section className="hairline-b" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <h2 className="t-label" style={{ marginTop: 0, marginBottom: 16 }}>
          The board at the pass
        </h2>
        <PinForm hasPin={Boolean(location.staffPin)} />
        <div style={{ marginTop: 16 }}>
          <CopyField label="Board URL" value={`${env.appUrl}/board/${location.slug}`} />
        </div>
      </section>

      <section className="hairline-b" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <h2 className="t-label" style={{ marginTop: 0, marginBottom: 8 }}>
          Locations — {locations.length}
        </h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {locations.map((site) => (
            <li key={site.id} className="row" style={{ alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="t-body" style={{ margin: 0 }}>
                  {site.name}
                  {site.id === location.id ? " · current" : ""}
                </p>
                <p className="t-data" style={{ margin: 0, marginTop: 2, color: "var(--fg-3)" }}>
                  /m/{site.slug} · {site.timezone}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 16 }}>
          <AddLocationForm />
        </div>
      </section>

      <section className="hairline-b" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <h2 className="t-label" style={{ marginTop: 0, marginBottom: 8 }}>
          Plan
        </h2>
        <p className="t-body" style={{ marginTop: 0 }}>
          {plan.name} — {money(plan.priceCents)} per location per month. {plan.tagline}
        </p>
        <Link href="/settings/billing" className="btn btn-secondary">
          Billing
        </Link>
      </section>

      <section className="hairline-b" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <h2 className="t-label" style={{ marginTop: 0, marginBottom: 8 }}>
          How this deployment is configured
        </h2>
        <p className="t-secondary" style={{ margin: 0 }}>
          Photo enhancement: {enhancerDescription()}
        </p>
        <p className="t-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          Photo storage:{" "}
          {storageDriver() === "r2"
            ? "Cloudflare R2, served from its CDN."
            : "the application database — fine for a trial, but set the R2 variables before real traffic."}
        </p>
      </section>

      <section style={{ paddingTop: 32 }}>
        <h2 className="t-label" style={{ marginTop: 0, marginBottom: 8 }}>
          Account
        </h2>
        <p className="t-secondary" style={{ marginTop: 0 }}>
          {user.email} · {user.role}
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}
