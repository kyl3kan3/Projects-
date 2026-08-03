import Link from "next/link";
import { Icon } from "@/components/icons";
import { TabBar } from "@/components/TabBar";
import { ownedShop, requireStylist } from "@/lib/auth";
import { entitlement, trialDaysLeft, type Billable } from "@/lib/plans";

/**
 * The stylist's shell: the tab bar, and one honest line about the account's state.
 *
 * A lapsed account still reaches every screen. Reading is never gated — the client book,
 * the history and the ledger stay open — and only the things that *act* (sending,
 * charging, offering, taking new bookings) stop. Locking a stylist out of their own client
 * list over a card failure would be a growth tactic this product does not run.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, stylist } = await requireStylist();
  const shop = await ownedShop(user.id);
  const ent = entitlement(stylist as Billable);

  return (
    <>
      <div className="screen">
        {ent.state === "lapsed" && (
          <div
            role="status"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "12px 0",
              borderBottom: "1px solid var(--color-hairline)",
              color: "var(--color-red)",
            }}
          >
            <Icon name="alert" size={18} style={{ flex: "none", marginTop: 2 }} />
            <p className="t-secondary" style={{ margin: 0, color: "var(--color-red)" }}>
              {ent.reason} Your booking page is closed and nothing is being sent or charged.
              Your clients, history and ledger stay readable.{" "}
              <Link href="/settings/billing" style={{ fontWeight: 700, color: "var(--color-red)" }}>
                Restart your plan
              </Link>
            </p>
          </div>
        )}
        {ent.state === "past_due" && (
          <div
            role="status"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "12px 0",
              borderBottom: "1px solid var(--color-hairline)",
              color: "var(--color-amber-text)",
            }}
          >
            <Icon name="alert" size={18} style={{ flex: "none", marginTop: 2 }} />
            <p className="t-secondary" style={{ margin: 0, color: "var(--color-amber-text)" }}>
              Your last payment failed. Everything keeps working — your booking page stays
              up — but please{" "}
              <Link
                href="/settings/billing"
                style={{ fontWeight: 700, color: "var(--color-amber-text)" }}
              >
                update your card
              </Link>
              .
            </p>
          </div>
        )}
        {ent.state === "trial" && trialDaysLeft(stylist.trialEndsAt) <= 5 && (
          <div
            role="status"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "12px 0",
              borderBottom: "1px solid var(--color-hairline)",
              color: "var(--color-cobalt)",
            }}
          >
            <Icon name="clock" size={18} style={{ flex: "none", marginTop: 2 }} />
            <p className="t-secondary" style={{ margin: 0, color: "var(--color-cobalt)" }}>
              {ent.daysLeft} {ent.daysLeft === 1 ? "day" : "days"} left of your trial.{" "}
              <Link href="/settings/billing" style={{ fontWeight: 700, color: "var(--color-cobalt)" }}>
                Pick a plan
              </Link>
            </p>
          </div>
        )}
        {children}
      </div>
      <TabBar showRent={Boolean(shop)} />
    </>
  );
}
