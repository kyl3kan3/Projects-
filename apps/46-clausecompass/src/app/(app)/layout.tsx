import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { creditBalance } from "@/lib/billing";
import { IconCompass, IconGear } from "@/components/icons";
import { SideRail, TabBar } from "@/components/TabBar";
import { Banner } from "@/components/Banner";
import { PLANS } from "@/lib/plans";

/**
 * The app shell: a small header on a phone, a left rail at >=1024px, the tab bar, and
 * the banner in the footer of every screen.
 *
 * The credit count lives in the header because the thing a person wants to know before
 * uploading a contract they are nervous about is whether it is going to cost them
 * anything.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, account } = await requireUser();
  const credits = await creditBalance(account.id);
  const plan = PLANS[account.plan];

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1240px] lg:gap-8 lg:px-8">
      <SideRail accountName={plan.name} />

      <div className="min-w-0 flex-1">
        <header className="hairline-b flex items-center justify-between px-5 py-3 lg:hidden no-print">
          <Link
            href="/contracts"
            className="flex min-h-11 items-center gap-2 no-underline"
            style={{ color: "var(--color-ink)" }}
          >
            <span style={{ color: "var(--color-oxblood)" }}>
              <IconCompass size={20} />
            </span>
            <span className="t-title">ClauseCompass</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/billing"
              className="t-data tap no-underline"
              style={{ color: credits > 0 ? "var(--color-text-2)" : "var(--color-oxblood)" }}
            >
              {credits} {credits === 1 ? "review" : "reviews"}
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-11 w-11 items-center justify-center no-underline"
              style={{ color: "var(--color-text-2)" }}
            >
              <IconGear size={22} />
            </Link>
          </div>
        </header>

        {children}

        <div className="px-5 lg:px-0">
          <Banner />
          <p className="t-label pb-24 lg:pb-8">
            {user.email} · {plan.name} · {credits} {credits === 1 ? "review" : "reviews"} left
          </p>
        </div>
      </div>

      <TabBar />
    </div>
  );
}
