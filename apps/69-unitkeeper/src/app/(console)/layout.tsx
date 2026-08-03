import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { SideRail, TabBar } from "@/components/TabBar";
import { requireOwner } from "@/lib/auth";
import { paymentsAreSimulated } from "@/lib/payments";

/**
 * The console shell. Mobile: a single column with the tab bar in the thumb zone.
 * From 1024px a left rail appears and the content gets the width the map wants —
 * DESIGN.md calls the console desktop-first, and the map is why, but every screen
 * is built to work at 390 first.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { owner, ent } = await requireOwner();

  return (
    <div className="console-shell">
      <div className="console-grid">
        <aside className="console-rail">
          <Link
            href="/map"
            className="t-label"
            style={{ textDecoration: "none", display: "block", padding: "0 12px 20px" }}
          >
            UnitKeeper
          </Link>
          <SideRail />
          <form action={logoutAction} style={{ marginTop: 24, padding: "0 12px" }}>
            <button type="submit" className="btn-quiet">
              Sign out
            </button>
          </form>
        </aside>

        <div className="console-main">
          <header
            className="hairline-b"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "16px 20px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p className="t-label">{owner.name}</p>
              <p className="t-secondary" style={{ marginTop: 2 }}>
                {ent.trialing
                  ? `Trial — ${ent.trialDaysLeft} day${ent.trialDaysLeft === 1 ? "" : "s"} left`
                  : `${ent.spec.name} · up to ${ent.spec.units} units`}
              </p>
            </div>
            <form action={logoutAction} className="console-signout">
              <button type="submit" className="btn-quiet">
                Sign out
              </button>
            </form>
          </header>

          {ent.locked && ent.lockReason ? (
            <p
              className="t-secondary"
              style={{
                margin: 20,
                padding: 12,
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--color-line)",
                background: "var(--color-slab)",
                color: "var(--color-liencard)",
              }}
              role="status"
            >
              {ent.lockReason} <Link href="/settings/billing">Choose a plan</Link>
            </p>
          ) : null}

          {ent.paymentProblem ? (
            <p
              className="t-secondary"
              style={{
                margin: 20,
                padding: 12,
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--color-line)",
                background: "var(--color-slab)",
              }}
              role="status"
            >
              Your last UnitKeeper payment failed. Nothing is locked yet —{" "}
              <Link href="/settings/billing">update the card</Link>.
            </p>
          ) : null}

          {paymentsAreSimulated() ? (
            <p className="t-secondary" style={{ margin: "12px 20px 0" }}>
              Rent is <strong>simulated</strong> here — no Stripe key is configured, so no card is
              touched and every simulated ledger row says so.
            </p>
          ) : null}

          {children}
        </div>
      </div>

      <TabBar />
    </div>
  );
}
