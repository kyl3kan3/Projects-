import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { plan } from "@/lib/plans";
import { domainCnameRecord, emailDnsRecords } from "@/lib/whitelabel";
import { env } from "@/lib/env";
import { ActionForm } from "@/components/ActionForm";
import { SignageChip } from "@/components/SignageChip";
import {
  saveBrandingAction,
  saveDomainAction,
  saveEmailDomainAction,
  signOutAction,
  verifyDomainAction,
  verifyEmailDnsAction,
} from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, workspace } = await requireUser();
  const limits = plan(workspace.plan);
  const cname = workspace.customDomain
    ? domainCnameRecord(workspace.customDomain, env.appUrl)
    : null;
  const sendingDomain = workspace.emailFromAddress?.split("@")[1] ?? null;
  const dnsRecords = sendingDomain ? emailDnsRecords(sendingDomain) : [];
  const dnsState = workspace.emailDnsState ?? {};

  return (
    <main className="screen screen-app" style={{ maxWidth: 640 }}>
      <header className="pt-10 pb-6">
        <p className="t-label">{user.email}</p>
        <h1 className="t-display mt-2">Settings</h1>
        <p className="t-secondary mt-3">
          On {limits.name} — ${limits.priceMonthly}/mo, per business.{" "}
          <Link href="/settings/billing" style={{ color: "var(--wl-accent)" }}>
            Plan and billing
          </Link>
        </p>
      </header>

      {/* -------------------------------------------------------- branding --- */}
      <section className="hairline-t py-6">
        <p className="t-label mb-1">Your brand</p>
        <p className="t-secondary mb-3">
          Two colours and a logo. Spacing, type sizes and the approved/awaiting colours stay ours —
          they carry meaning, so they aren&apos;t up for grabs.
        </p>
        <ActionForm action={saveBrandingAction} submitLabel="Save brand" variant="secondary">
          <label className="flex flex-col gap-2">
            <span className="t-label">Agency name</span>
            <input className="input" name="name" defaultValue={workspace.name} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-2" style={{ width: 150 }}>
              <span className="t-label">Welcome band</span>
              <input
                className="input input-mono"
                name="band"
                defaultValue={workspace.branding.band}
                placeholder="#1E4D3B"
              />
            </label>
            <label className="flex flex-col gap-2" style={{ width: 150 }}>
              <span className="t-label">Accent</span>
              <input
                className="input input-mono"
                name="accent"
                defaultValue={workspace.branding.accent}
                placeholder="#A8843F"
              />
            </label>
            <label className="flex flex-col gap-2" style={{ width: 150 }}>
              <span className="t-label">Display face</span>
              <select className="input" name="displayFont" defaultValue={workspace.branding.displayFont}>
                <option value="playfair">Playfair (serif)</option>
                <option value="inter">Inter (sans)</option>
              </select>
            </label>
          </div>
          <div className="flex gap-3">
            <span
              className="flex-1"
              style={{
                height: 48,
                borderRadius: 10,
                background: workspace.branding.band,
              }}
              aria-label={`Welcome band ${workspace.branding.band}`}
            />
            <span
              className="flex-1"
              style={{
                height: 48,
                borderRadius: 10,
                border: `1px solid ${workspace.branding.accent}`,
                color: workspace.branding.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
              }}
            >
              AWAITING YOU
            </span>
          </div>
          <label className="flex flex-col gap-2">
            <span className="t-label">Logo (SVG source)</span>
            <textarea
              className="input input-mono"
              name="logoSvg"
              rows={3}
              defaultValue={workspace.branding.logoSvg ?? ""}
              placeholder="<svg viewBox='0 0 120 28'>…</svg>"
            />
          </label>
          <p className="t-secondary">
            Purple, violet and lavender are refused — and an accent that can&apos;t reach 3:1 on the
            portal&apos;s ivory ground is refused too, because your client is the one who has to read
            it.
          </p>
        </ActionForm>
      </section>

      {/* --------------------------------------------------- custom domain --- */}
      <section className="hairline-t py-6">
        <div className="mb-1 flex items-center gap-3">
          <p className="t-label flex-1">Your domain</p>
          {workspace.customDomainVerifiedAt ? (
            <SignageChip tone="green">live</SignageChip>
          ) : workspace.customDomain ? (
            <SignageChip tone="amber">waiting on dns</SignageChip>
          ) : null}
        </div>
        {limits.customDomain ? (
          <>
            <ActionForm action={saveDomainAction} submitLabel="Save domain" variant="secondary" compact>
              <label className="flex min-w-[220px] flex-1 flex-col gap-2">
                <span className="t-label">Portal hostname</span>
                <input
                  className="input input-mono"
                  name="customDomain"
                  defaultValue={workspace.customDomain ?? ""}
                  placeholder="portal.youragency.com"
                />
              </label>
            </ActionForm>
            {cname ? (
              <div className="mt-4">
                <p className="t-label mb-2">Add this record</p>
                <div className="scroll-x">
                  <p className="t-data whitespace-nowrap">
                    CNAME &nbsp; {cname.host} &nbsp; → &nbsp; {cname.value}
                  </p>
                </div>
                <ActionForm
                  action={verifyDomainAction}
                  submitLabel="Check the DNS now"
                  variant="quiet"
                  compact
                  className="mt-3 flex flex-wrap items-end gap-3"
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="t-secondary">
            Custom domains start on Solo — $29/mo.{" "}
            <Link href="/settings/billing" style={{ color: "var(--wl-accent)" }}>
              See plans
            </Link>
          </p>
        )}
      </section>

      {/* --------------------------------------------- agency-domain email --- */}
      <section className="hairline-t py-6">
        <div className="mb-1 flex items-center gap-3">
          <p className="t-label flex-1">Email from your domain</p>
          {workspace.emailDomainVerifiedAt ? (
            <SignageChip tone="green">verified</SignageChip>
          ) : workspace.emailFromAddress ? (
            <SignageChip tone="amber">unverified</SignageChip>
          ) : null}
        </div>
        {limits.agencyEmail ? (
          <>
            <p className="t-secondary mb-3">
              Until all three records pass, notifications go from {env.emailFrom}. Sending from an
              unverified domain would damage your deliverability, so it stays closed until it
              isn&apos;t a guess.
            </p>
            <ActionForm
              action={saveEmailDomainAction}
              submitLabel="Save sender"
              variant="secondary"
              compact
            >
              <label className="flex min-w-[140px] flex-1 flex-col gap-2">
                <span className="t-label">From name</span>
                <input
                  className="input"
                  name="emailFromName"
                  defaultValue={workspace.emailFromName ?? workspace.name}
                />
              </label>
              <label className="flex min-w-[200px] flex-1 flex-col gap-2">
                <span className="t-label">From address</span>
                <input
                  className="input input-mono"
                  name="emailFromAddress"
                  type="email"
                  defaultValue={workspace.emailFromAddress ?? ""}
                  placeholder="updates@youragency.com"
                />
              </label>
            </ActionForm>

            {dnsRecords.length > 0 ? (
              <div className="mt-4">
                <p className="t-label mb-2">Three records on {sendingDomain}</p>
                {dnsRecords.map((record) => (
                  <div key={record.purpose} className="hairline-b py-3">
                    <div className="flex items-center gap-3">
                      <span className="t-label flex-1">{record.purpose}</span>
                      <SignageChip tone={dnsState[record.purpose] ? "green" : "amber"}>
                        {dnsState[record.purpose] ? "found" : "not found"}
                      </SignageChip>
                    </div>
                    <div className="scroll-x mt-1">
                      <p className="t-data whitespace-nowrap" style={{ color: "var(--color-ink-2)" }}>
                        {record.kind} &nbsp; {record.name} &nbsp; → &nbsp; {record.value}
                      </p>
                    </div>
                  </div>
                ))}
                <ActionForm
                  action={verifyEmailDnsAction}
                  submitLabel="Check the records now"
                  variant="quiet"
                  compact
                  className="mt-3 flex flex-wrap items-end gap-3"
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="t-secondary">
            Sending from your own domain is on Agency — $79/mo, and that tier removes every trace of
            ClientDock from your clients&apos; view.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------ white label --- */}
      <section className="hairline-t py-6">
        <p className="t-label mb-1">What your clients see</p>
        <p className="t-secondary">
          {limits.whiteLabel
            ? "Nothing of ours. No footer, no name, no link — the portal is yours end to end."
            : "An 11px “via ClientDock” line sits at the foot of each portal. Agency removes it, along with every other trace."}
        </p>
      </section>

      <section className="hairline-t py-6">
        <ActionForm action={signOutAction} submitLabel="Sign out" variant="quiet" />
      </section>
    </main>
  );
}
