import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { countConnections } from "@/lib/connections";
import { defaultTarget } from "@/lib/storage-targets";
import { getSubscription } from "@/lib/billing";
import { reportablePeriods } from "@/lib/reports";
import { databasesLabel, plan } from "@/lib/plans";
import { OrgForm } from "./OrgForm";
import { generateReportAction, saveOrgAction } from "./actions";
import { logoutAction } from "@/app/(auth)/actions";
import { IconBucket, IconChevronRight, IconDownload, IconKey, IconLock } from "@/components/icons";
import { has } from "@/lib/env";
import { managedTargetDescription } from "@/lib/storage";
import { formatTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { org, user, role } = await requireUser();
  const [used, target, subscription, periods] = await Promise.all([
    countConnections(org.id),
    defaultTarget(org.id),
    getSubscription(org.id),
    reportablePeriods(org.id, 4),
  ]);
  const limits = plan(org.plan);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Settings</p>
        <h1 className="t-h2 mt-2">{org.name}</h1>
        <p className="t-secondary mt-1">
          {limits.name} · {used} of {databasesLabel(limits)} databases · signed in as {user.email} (
          {role})
        </p>
      </header>

      <section className="mb-10">
        <OrgForm name={org.name} alertEmail={org.alertEmail ?? ""} action={saveOrgAction} />
      </section>

      <section className="mb-10">
        <p className="t-label mb-2">Where backups go</p>
        <Link href="/settings/storage" className="row">
          <span style={{ color: "var(--color-text-3)" }}>
            <IconBucket size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title block">{target?.name ?? "No storage target"}</span>
            <span className="t-data mt-1.5 block truncate" style={{ color: "var(--color-text-3)" }}>
              {target?.kind === "managed"
                ? managedTargetDescription()
                : `${target?.bucket ?? ""}${target?.prefix ? `/${target.prefix}` : ""}`}
            </span>
          </span>
          <span style={{ color: "var(--color-text-3)" }} aria-hidden="true">
            <IconChevronRight size={18} />
          </span>
        </Link>
        <p className="t-secondary mt-3">
          Bring your own S3 or R2 bucket on any plan. If VaultBack disappears tomorrow your encrypted
          dumps are still sitting in your bucket, and the decryption format is documented.
        </p>
      </section>

      <section className="mb-10">
        <p className="t-label mb-2">Plan and billing</p>
        <Link href="/settings/billing" className="row">
          <span style={{ color: "var(--color-text-3)" }}>
            <IconKey size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title block">
              {limits.name} · ${limits.priceMonthly}/mo
            </span>
            <span className="t-data mt-1.5 block" style={{ color: "var(--color-text-3)" }}>
              {subscription
                ? `${subscription.status}${subscription.currentPeriodEnd ? ` · renews ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}` : ""}`
                : org.trialEndsAt
                  ? `trial ends ${org.trialEndsAt.toISOString().slice(0, 10)}`
                  : "no subscription"}
            </span>
          </span>
          <span style={{ color: "var(--color-text-3)" }} aria-hidden="true">
            <IconChevronRight size={18} />
          </span>
        </Link>
      </section>

      <section className="mb-10">
        <p className="t-label mb-2">Compliance report</p>
        {limits.complianceReport ? (
          <>
            <p className="t-secondary mb-3">
              A month of backup history, retention adherence, drill evidence and encryption posture,
              as a PDF you can attach to a security questionnaire.
            </p>
            <div className="flex flex-col gap-2">
              {periods.map((period) => {
                const value = `${period.from.getUTCFullYear()}-${String(period.from.getUTCMonth() + 1).padStart(2, "0")}`;
                return (
                  <form key={value} action={generateReportAction}>
                    <input type="hidden" name="period" value={value} />
                    <button className="btn btn-secondary btn-full" type="submit">
                      <IconDownload size={18} />
                      {period.label}
                    </button>
                  </form>
                );
              })}
            </div>
          </>
        ) : (
          <p className="t-secondary">
            The monthly compliance PDF is a Business-tier feature. Everything it reports on — backup
            outcomes, retention, drill results — is already being recorded, so switching the plan on
            produces a complete report for this month immediately.
          </p>
        )}
      </section>

      <section className="mb-10">
        <p className="t-label mb-2">Activity</p>
        <Link href="/settings/activity" className="row">
          <span style={{ color: "var(--color-text-3)" }}>
            <IconLock size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title block">Audit log</span>
            <span className="t-data mt-1.5 block" style={{ color: "var(--color-text-3)" }}>
              every backup, restore, drill and settings change
            </span>
          </span>
          <span style={{ color: "var(--color-text-3)" }} aria-hidden="true">
            <IconChevronRight size={18} />
          </span>
        </Link>
      </section>

      <section className="mb-10">
        <p className="t-label mb-2">Encryption</p>
        <dl className="panel p-4">
          <Row label="Snapshots" value="AES-256-GCM, unique key per snapshot" />
          <Row label="Data keys" value="wrapped by the master key, never stored in plaintext" />
          <Row label="Credentials" value="AES-256-GCM under a separate key" />
          <Row
            label="Alert email"
            value={has("RESEND_API_KEY") ? "Resend configured" : "not configured — alerts are logged"}
          />
        </dl>
      </section>

      <section className="mb-10">
        <p className="t-label mb-2">Session</p>
        <form action={logoutAction}>
          <button className="btn btn-secondary btn-full" type="submit">
            Sign out
          </button>
        </form>
        <p className="t-secondary mt-3" style={{ color: "var(--color-text-3)" }}>
          Workspace created {formatTimestamp(org.createdAt)}
        </p>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline-b flex flex-wrap items-baseline justify-between gap-3 py-2.5 last:border-0">
      <dt className="t-label">{label}</dt>
      <dd className="t-data" style={{ color: "var(--color-text-2)" }}>
        {value}
      </dd>
    </div>
  );
}
