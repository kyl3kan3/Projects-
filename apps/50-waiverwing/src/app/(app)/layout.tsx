import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { monthlyVolume } from "@/lib/signatures";
import { plan, softCapMessage, trialActive } from "@/lib/plans";
import { SideRail, TabBar } from "@/components/TabBar";

/**
 * The staff shell: bottom tabs on a phone, a left rail on a front-desk monitor.
 *
 * The soft-cap banner lives here so it is impossible to miss and equally
 * impossible for it to reach the signing path — /sign and /kiosk are outside
 * this layout entirely.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { account, user } = await requireUser();
  const volume = await monthlyVolume(account.id);
  const capMessage = softCapMessage(account.plan, volume);
  const spec = plan(account.plan);
  const onTrial = trialActive(account);

  const trialDays = account.trialEndsAt
    ? Math.max(0, Math.ceil((account.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] lg:flex lg:gap-8 lg:px-6">
      <SideRail accountName={account.name} />

      <div className="min-w-0 flex-1 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+16px)] lg:pb-10">
        {onTrial ? (
          <div className="hairline-b px-5 py-2.5 lg:px-0">
            <p className="t-secondary">
              <span className="t-data" style={{ color: "var(--color-trail)" }}>
                {trialDays} DAYS LEFT
              </span>{" "}
              on your trial — every feature is on.{" "}
              <Link href="/settings/billing" className="btn-quiet">
                Pick a plan
              </Link>
            </p>
          </div>
        ) : null}

        {capMessage ? (
          <div className="hairline-b px-5 py-2.5 lg:px-0">
            <p className="t-secondary">
              {capMessage}{" "}
              <Link href="/settings/billing" className="btn-quiet">
                Compare plans
              </Link>
            </p>
          </div>
        ) : null}

        {children}

        <div className="mt-10 px-5 lg:px-0">
          <p className="t-secondary">
            Signed in as {user.email} · {spec.name} plan ·{" "}
            <Link href="/settings" className="btn-quiet">
              Settings
            </Link>
          </p>
        </div>
      </div>

      <TabBar />
    </div>
  );
}
