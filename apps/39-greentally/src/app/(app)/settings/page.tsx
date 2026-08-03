import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, sites } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { canAddSite, PLANS, planLabel } from "@/lib/plans";
import { deadLetters } from "@/lib/jobs";
import { driverKind } from "@/lib/storage";
import { extractorIsLive, formatMicrocents } from "@/lib/extraction";
import { stripeConfigured } from "@/lib/env";
import { AddSiteForm, LogoutButton, ProfileForm, SiteEditor } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, org, period } = await requireOnboarded();
  const db = getDb();
  const siteRows = await db.select().from(sites).where(eq(sites.organizationId, org.id));
  const gate = canAddSite(org.plan, siteRows.length);
  const failed = await deadLetters(org.id);

  const docs = await db
    .select({ cost: documents.costMicrocents })
    .from(documents)
    .where(eq(documents.organizationId, org.id));
  const totalCost = docs.reduce((a, d) => a + d.cost, 0);

  return (
    <main className="screen pt-5">
      <h1 className="t-h2">Settings</h1>

      <section className="mt-6">
        <h2 className="t-label">Company</h2>
        <ProfileForm
          contactName={org.settings.contactName}
          contactEmail={org.settings.contactEmail}
          reportWordmark={org.settings.reportWordmark}
          revenue={org.annualRevenueCents > 0 ? (org.annualRevenueCents / 100).toFixed(0) : ""}
          fteCount={org.fteCount}
          brandedAllowed={PLANS[org.plan].brandedReport}
        />
      </section>

      <section className="mt-10">
        <h2 className="t-label">
          Sites · {siteRows.length} of {PLANS[org.plan].sites}
        </h2>
        <div className="mt-2">
          {siteRows.map((s) => (
            <SiteEditor
              key={s.id}
              site={{
                id: s.id,
                name: s.name,
                address: s.address,
                country: s.country,
                gridRegion: s.gridRegion,
                floorAreaSqm: s.floorAreaSqm,
                marketMethod: s.marketMethod,
                renewableSharePct: s.renewableSharePct,
                contractNote: s.contractNote,
              }}
            />
          ))}
        </div>
        <AddSiteForm allowed={gate.allowed} reason={gate.reason} />
      </section>

      <section className="mt-10">
        <h2 className="t-label">Plan</h2>
        <div className="row-plain flex items-baseline justify-between gap-3">
          <span className="t-body">{planLabel(org.plan)}</span>
          <span className="t-mono">
            {org.plan === "preview"
              ? "free"
              : `$${(PLANS[org.plan].monthlyCents / 100).toFixed(0)}/mo${
                  org.billingInterval === "year" ? " · billed annually" : ""
                }`}
          </span>
        </div>
        <Link href="/settings/billing" className="btn btn-secondary btn-full mt-4">
          {org.plan === "preview" ? "See the plans" : "Manage billing"}
        </Link>
        {!stripeConfigured() && (
          <p className="t-secondary mt-3" style={{ maxWidth: "50ch" }}>
            Stripe is not configured on this deployment, so checkout is unavailable. The
            plans and their limits still apply.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="t-label">How this deployment is set up</h2>
        <div className="row-plain flex items-baseline justify-between gap-3">
          <span className="t-body">Bill extraction</span>
          <span className="t-mono">{extractorIsLive() ? "VISION MODEL" : "TEXT LAYER ONLY"}</span>
        </div>
        <div className="row-plain flex items-baseline justify-between gap-3">
          <span className="t-body">Original documents</span>
          <span className="t-mono">{driverKind() === "r2" ? "OBJECT STORAGE" : "DATABASE"}</span>
        </div>
        <div className="row-plain flex items-baseline justify-between gap-3">
          <span className="t-body">Extraction spend to date</span>
          <span className="t-mono">{formatMicrocents(totalCost)}</span>
        </div>
        <div className="row-plain flex items-baseline justify-between gap-3">
          <span className="t-body">Reporting year</span>
          <span className="t-mono">
            {period.year}
            {period.lockedAt ? " · LOCKED" : ""}
          </span>
        </div>
        {!extractorIsLive() && (
          <p className="t-secondary mt-3" style={{ maxWidth: "52ch" }}>
            Without an extraction model, bills are read from their PDF text layer. A scan or
            photograph arrives in review with empty fields to type in — never with an
            invented number.
          </p>
        )}
      </section>

      {failed.length > 0 && (
        <section className="mt-10">
          <h2 className="t-label" style={{ color: "var(--color-red)" }}>
            Background work that failed
          </h2>
          {failed.map((j) => (
            <div key={j.id} className="row-plain">
              <p className="t-title">{j.kind.replace(/_/g, " ")}</p>
              <p className="t-secondary mt-1" style={{ maxWidth: "52ch" }}>
                {j.error ?? "No error recorded."}
              </p>
              <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                {j.attempts} ATTEMPTS · {j.createdAt.toISOString().slice(0, 19).replace("T", " ")}Z
              </p>
            </div>
          ))}
          <p className="t-secondary mt-3" style={{ maxWidth: "52ch" }}>
            These stopped retrying. Re-uploading the document, or fixing the underlying
            problem and re-running extraction from its review screen, is the way through.
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="t-label">Account</h2>
        <div className="row-plain flex items-baseline justify-between gap-3">
          <span className="t-body">{user.name}</span>
          <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
            {user.email}
          </span>
        </div>
        <div className="mt-3">
          <LogoutButton />
        </div>
      </section>
    </main>
  );
}
