import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { currentPeriod, forwardingAddress, usageFor } from "@/lib/org";
import { documentCapacity, plan } from "@/lib/plans";
import { listVendorsWithRules } from "@/lib/vendors";
import { describeAudit, recentAudit } from "@/lib/audit";
import { formatMicrocents, extractorIsLive } from "@/lib/extraction";
import { monthName } from "@/lib/dates";
import { storageKind } from "@/lib/storage";
import { SettingsForm, SignOutButton } from "./SettingsForms";
import { CopyField } from "@/components/CopyField";
import { IconChevronRight } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, org } = await requireUser();
  const period = currentPeriod(org);
  const usage = await usageFor(org.id, period);
  const capacity = documentCapacity(org.plan, usage.documentsExtracted);
  const vendorRules = await listVendorsWithRules(org.id);
  const activity = await recentAudit(org.id, 12);
  const features = plan(org.plan);

  return (
    <main className="screen">
      <header className="pt-8">
        <span className="t-label">Settings</span>
        <h1 className="t-h2 mt-2">{org.name}</h1>
        <p className="t-secondary mt-1">{user.email}</p>
      </header>

      <section className="mt-6">
        <CopyField value={forwardingAddress(org.forwardingSlug)} label="Your forwarding address" />
        <p className="t-secondary mt-2" style={{ color: "var(--color-fg-3)" }}>
          Forward from any address. Attachments and plain email bodies both work.
        </p>
      </section>

      <section className="panel mt-6 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-label">
            {monthName(period)} usage · {features.name} plan
          </span>
          <span className="t-data">
            {capacity.extracted} / {capacity.cap}
          </span>
        </div>
        <p className="t-secondary mt-2">
          {capacity.atCap
            ? "You are at this month's cap. New documents park until next cycle or an upgrade — nothing is lost and you are never billed for overage."
            : `${capacity.remaining} extractions left this month.`}
        </p>
        <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
          {usage.documentsIngested} received · {usage.documentsExtracted} extracted ·{" "}
          {formatMicrocents(usage.extractionCostMicrocents)} extraction cost
        </p>
        <Link href="/settings/billing" className="btn btn-secondary btn-full mt-4">
          Plans and billing
          <IconChevronRight size={18} />
        </Link>
      </section>

      <section className="mt-8">
        <span className="t-label">Business</span>
        <SettingsForm
          name={org.name}
          timeZone={org.timeZone}
          digestWeekday={org.digestWeekday}
          weeklyDigestEnabled={org.weeklyDigestEnabled}
        />
      </section>

      <section className="mt-10">
        <span className="t-label">Vendor rules</span>
        <h2 className="t-title mt-2">What the corrections taught us</h2>
        <p className="t-secondary mt-1">
          Correct a category once in the review queue and it becomes permanent for that
          vendor. This is why month six is quieter than month one.
        </p>
        {vendorRules.length === 0 ? (
          <p className="t-secondary mt-4" style={{ color: "var(--color-fg-3)" }}>
            No vendors yet. They appear here as documents come in.
          </p>
        ) : (
          <div className="mt-4 hairline-t">
            {vendorRules.slice(0, 20).map(({ vendor, category }) => (
              <div
                key={vendor.id}
                className="flex items-baseline justify-between gap-3 border-b py-3"
                style={{ borderColor: "var(--color-line)" }}
              >
                <span className="min-w-0">
                  <span className="t-body block truncate">{vendor.displayName}</span>
                  <span className="t-data block" style={{ color: "var(--color-fg-3)" }}>
                    {vendor.documentCount} {vendor.documentCount === 1 ? "document" : "documents"}
                    {vendor.ruleSource ? ` · rule from a ${vendor.ruleSource}` : ""}
                  </span>
                </span>
                <span
                  className="t-data shrink-0"
                  style={{ color: category ? "var(--color-ledger)" : "var(--color-fg-3)" }}
                >
                  {category?.name ?? "no rule yet"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <span className="t-label">Activity</span>
        <h2 className="t-title mt-2">Everything that touched your records</h2>
        <p className="t-secondary mt-1">
          Exports and accountant access are logged — these are financial records.
        </p>
        <div className="mt-4 hairline-t">
          {activity.map((entry) => (
            <div
              key={entry.id}
              className="flex items-baseline justify-between gap-3 border-b py-3"
              style={{ borderColor: "var(--color-line)" }}
            >
              <span className="t-secondary min-w-0 flex-1">{describeAudit(entry)}</span>
              <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <span className="t-label">This deployment</span>
        <div className="mt-3 hairline-t">
          <div className="flex items-baseline justify-between gap-3 border-b py-3" style={{ borderColor: "var(--color-line)" }}>
            <span className="t-secondary">Extraction</span>
            <span className="t-data">
              {extractorIsLive() ? "Anthropic API" : "deterministic stand-in (no API key set)"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b py-3" style={{ borderColor: "var(--color-line)" }}>
            <span className="t-secondary">Document storage</span>
            <span className="t-data">{storageKind() === "r2" ? "Cloudflare R2" : "local filesystem"}</span>
          </div>
        </div>
      </section>

      <div className="mt-10">
        <SignOutButton />
      </div>

      <p className="t-secondary mt-8" style={{ color: "var(--color-fg-3)" }}>
        LedgerLens categorises to Schedule C lines so a professional can file from it. It
        is not accounting software and it is not tax advice.
      </p>
    </main>
  );
}
