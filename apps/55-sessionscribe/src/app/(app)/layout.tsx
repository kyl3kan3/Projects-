import { requirePractice } from "@/lib/auth";
import { billingFacts } from "@/lib/billing";
import { entitlement } from "@/lib/plans";
import { SideRail, TabBar } from "@/components/TabBar";
import Link from "next/link";

/**
 * The app shell: left rail on desktop, tab bar on phones, and the one banner the
 * product is allowed to show — the billing notice, which exists because a
 * clinician must never discover that capture is paused by trying to capture.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { practice } = await requirePractice();
  const ent = entitlement(billingFacts(practice), new Date());

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1120px] lg:gap-8 lg:px-8">
      <SideRail practiceName={practice.name} />
      <div className="min-w-0 flex-1">
        {ent.notice && (
          <div
            className="hairline-b px-5 py-3 lg:px-0"
            style={{ background: "var(--color-card)" }}
          >
            <p className="t-secondary" style={{ color: "var(--color-ink)" }}>
              {ent.notice}{" "}
              <Link className="btn-quiet btn-quiet-sm" href="/settings/billing">
                Billing
              </Link>
            </p>
          </div>
        )}
        {children}
      </div>
      <TabBar />
    </div>
  );
}
