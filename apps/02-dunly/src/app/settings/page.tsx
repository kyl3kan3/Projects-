import Link from "next/link";
import { BottomNav, DesktopRail } from "@/components/bottom-nav";
import { Icon } from "@/components/icons";
import { TopBar } from "@/components/top-bar";
import { getSenderDomainSetup, listSuppressionPreview } from "@/lib/deliverability";
import { demoOrganization } from "@/lib/sample-data";

export default async function SettingsPage() {
  const senderDomain = getSenderDomainSetup(demoOrganization.senderDomain);
  const suppressions = await listSuppressionPreview();

  return (
    <main className="screen">
      <div className="shell with-rail">
        <DesktopRail active="/settings" />
        <div>
          <TopBar />
          <section className="mb-6">
            <p className="t-label">Settings</p>
            <h1 className="t-h2 mt-2">Recovery controls</h1>
          </section>
          <div className="space-y-4">
            <div className="panel p-4">
              <p className="t-label">Stripe account</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{demoOrganization.stripeAccountId}</p>
                  <p className="t-secondary">Test-mode Connect account. Webhooks healthy.</p>
                </div>
                <span className="status">
                  <span className="dot dot-banknote" />
                  <span className="t-label text-[var(--color-text)]">Connected</span>
                </span>
              </div>
            </div>
            <div className="panel p-4">
              <p className="t-label">Sender domain</p>
              <p className="mt-3 font-semibold">{demoOrganization.senderDomain}</p>
              <p className="t-secondary mt-1">SPF, DKIM, and bounce handling are verified for live sending.</p>
              <div className="mt-4 space-y-2">
                {senderDomain.records.map((record) => (
                  <div className="rounded-[8px] border border-[var(--color-hairline)] p-3" key={record.host}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="data text-xs text-[var(--color-text-2)]">{record.type}</p>
                      <span className="status">
                        <span className="dot dot-banknote" />
                        <span className="t-label text-[var(--color-text)]">{record.status}</span>
                      </span>
                    </div>
                    <p className="mt-2 break-all text-sm font-semibold">{record.host}</p>
                    <p className="data mt-1 break-all text-xs text-[var(--color-text-3)]">{record.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel p-4">
              <p className="t-label">Suppression list</p>
              <div className="mt-3">
                {suppressions.map((suppression) => (
                  <div className="row grid grid-cols-[1fr_auto] gap-4" key={`${suppression.email}-${suppression.reason}`}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{suppression.email}</p>
                      <p className="t-secondary">{suppression.reason}</p>
                    </div>
                    <p className="data text-xs text-[var(--color-text-3)]">
                      {suppression.suppressedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel p-4">
              <p className="t-label">Plan</p>
              <p className="mt-3 font-semibold">Growth - SMS enabled</p>
              <Link href="/api/billing/checkout?plan=growth" className="btn btn-secondary mt-4 w-full">
                <Icon name="card" className="h-[18px] w-[18px]" />
                Manage Dunly billing
              </Link>
            </div>
          </div>
        </div>
      </div>
      <BottomNav active="/settings" />
    </main>
  );
}
