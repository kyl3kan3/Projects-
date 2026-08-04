/**
 * The signed-in shell: a phone tab bar in the thumb zone, a left rail from
 * 1024px, and the two banners that must never be missable — the trial countdown
 * and the read-only lock when nothing is paying.
 */

import Link from "next/link";
import { Rail, TabBar } from "@/components/TabBar";
import { requireSession } from "@/lib/auth";
import { entitlements, PLANS } from "@/lib/plans";
import { signOutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { account, user } = await requireSession();
  const ent = entitlements(account);

  return (
    <div className="shell">
      <div className="shell-grid">
        <Rail
          yardName={account.name}
          plan={
            ent.trialing
              ? `Trial · ${ent.trialDaysLeft}d left`
              : `${PLANS[ent.plan].name} · $${PLANS[ent.plan].priceMonthly}/mo`
          }
        />
        <div className="shell-main">
          <header
            className="between no-print"
            style={{ paddingTop: 20, paddingBottom: 12 }}
          >
            <div>
              <p className="t-placard tone-dim">{account.name}</p>
              <p className="t-secondary" style={{ marginTop: 2 }}>
                {user.name} · {user.role}
              </p>
            </div>
            <form action={signOutAction} className="shell-signout">
              <button type="submit" className="btn-quiet">
                Sign out
              </button>
            </form>
          </header>

          {ent.locked ? (
            <div className="banner" data-tone="warn" style={{ marginBottom: 16 }} role="status">
              <strong>{ent.lockReason}</strong>{" "}
              <Link href="/settings/billing" className="btn-quiet">
                Pick a plan
              </Link>
            </div>
          ) : null}

          {ent.trialing && ent.trialDaysLeft <= 5 ? (
            <div className="banner" data-tone="accent" style={{ marginBottom: 16 }} role="status">
              {ent.trialDaysLeft} day{ent.trialDaysLeft === 1 ? "" : "s"} left on the trial. Your
              inventory, orders and photos stay put whichever plan you pick.{" "}
              <Link href="/settings/billing" className="btn-quiet">
                See plans
              </Link>
            </div>
          ) : null}

          {ent.paymentProblem ? (
            <div className="banner" data-tone="warn" style={{ marginBottom: 16 }} role="status">
              The card on file was declined. Everything keeps working while you fix it.{" "}
              <Link href="/settings/billing" className="btn-quiet">
                Update billing
              </Link>
            </div>
          ) : null}

          {children}
        </div>
      </div>
      <TabBar />
    </div>
  );
}
