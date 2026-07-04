import Link from "next/link";
import { BottomNav, DesktopRail } from "@/components/bottom-nav";
import { Icon } from "@/components/icons";
import { TopBar } from "@/components/top-bar";
import { demoOrganization } from "@/lib/sample-data";

export default function SettingsPage() {
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
              <p className="t-secondary mt-1">SPF and DKIM verified. Bounces and complaints suppress automatically.</p>
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
