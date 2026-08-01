import { requireUser } from "@/lib/auth";
import { Rail, TabBar } from "@/components/TabBar";
import { isEntitled, trialDaysLeft } from "@/lib/plans";
import Link from "next/link";

/**
 * The dashboard shell. Candlelight full-time — kitchens are dim, and an owner
 * checking the 86 board at 9pm should not get a white flash.
 *
 * The trial banner is the only chrome above the content, and it is text, not a
 * modal: nothing here blocks getting to the 86 board.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization } = await requireUser();
  const now = new Date();
  const entitled = isEntitled(organization.subscriptionStatus, organization.trialEndsAt, now);
  const daysLeft = trialDaysLeft(organization.trialEndsAt, now);

  return (
    <div className="app-shell">
      <Rail />
      <div style={{ minWidth: 0 }}>
        {!entitled ? (
          <div
            className="screen hairline-b"
            style={{ paddingTop: 12, paddingBottom: 12, background: "var(--panel)" }}
          >
            <p className="t-secondary" style={{ margin: 0 }}>
              The trial has ended. Your published menus are still live —{" "}
              <Link href="/settings/billing" style={{ color: "#c05a3e" }}>
                pick a plan
              </Link>{" "}
              to keep editing.
            </p>
          </div>
        ) : organization.subscriptionStatus === "trialing" && daysLeft <= 5 ? (
          <div className="screen hairline-b" style={{ paddingTop: 12, paddingBottom: 12 }}>
            <p className="t-secondary" style={{ margin: 0 }}>
              {daysLeft === 1 ? "Last day of the trial" : `${daysLeft} days left in the trial`} ·{" "}
              <Link href="/settings/billing" style={{ color: "#c05a3e" }}>
                see plans
              </Link>
            </p>
          </div>
        ) : organization.subscriptionStatus === "past_due" ? (
          <div className="screen hairline-b" style={{ paddingTop: 12, paddingBottom: 12 }}>
            <p className="t-secondary" style={{ margin: 0, color: "#b8863b" }}>
              The last payment failed. Nothing has come off your menus —{" "}
              <Link href="/settings/billing" style={{ color: "#c05a3e" }}>
                update the card
              </Link>
              .
            </p>
          </div>
        ) : null}

        <div className="with-tabbar">{children}</div>
      </div>
      <TabBar />
    </div>
  );
}
