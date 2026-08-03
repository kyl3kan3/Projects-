import Link from "next/link";
import { requireFirm } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";
import { Gear, TargetRing } from "@/components/icons";
import { logoutAction } from "../(auth)/actions";

/**
 * The signed-in shell.
 *
 * Mobile-first: a lean header, then the screen, then the bottom tab bar. At
 * >=1024px the tab bar gives way to a left rail and the content caps at 1120px
 * centred (DESIGN.md, Responsive).
 *
 * The two banners here are the honest ones: how many trial days are left, and —
 * when a trial has lapsed or dunning has run out — that the account is read-only
 * with the library still exportable. Neither is dismissible, because both change
 * what the buttons below them will do.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { firm, user, access, planName } = await requireFirm();

  return (
    <>
      <header
        className="sticky top-0 z-30"
        style={{
          background: "color-mix(in srgb, var(--color-register) 94%, transparent)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        <div className="screen flex items-center gap-3" style={{ paddingBottom: 0, minHeight: 56 }}>
          <div className="min-w-0 flex-1">
            <p className="t-title truncate lg:hidden">{firm.name}</p>
            <p className="t-label hidden lg:block">Capture desk</p>
          </div>
          <Link
            href="/profiles"
            className="btn-quiet"
            aria-label="Keyword profiles"
            style={{ color: "var(--color-ink-2)" }}
          >
            <TargetRing size={20} />
            <span className="sr-only">Profiles</span>
          </Link>
          <Link
            href="/settings"
            className="btn-quiet"
            aria-label="Settings"
            style={{ color: "var(--color-ink-2)" }}
          >
            <Gear size={20} />
            <span className="sr-only">Settings</span>
          </Link>
          <form action={logoutAction}>
            <button className="btn-quiet" type="submit" style={{ color: "var(--color-ink-2)" }}>
              Sign out
            </button>
          </form>
        </div>
      </header>

      {access.readOnly && (
        <div
          role="status"
          style={{
            background: "color-mix(in srgb, var(--color-red) 8%, var(--color-register))",
            borderBottom: "1px solid var(--color-line)",
          }}
        >
          <div className="screen py-3" style={{ paddingBottom: 12 }}>
            <p className="t-secondary" style={{ color: "var(--color-red)" }}>
              {access.reason}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link href="/settings/billing" className="btn-quiet">
                Pick a plan
              </Link>
              <a href="/api/library/export" className="btn-quiet" download>
                Export the library
              </a>
            </div>
          </div>
        </div>
      )}

      {!access.readOnly && access.reason && (
        <div
          role="status"
          style={{
            background: "color-mix(in srgb, var(--color-amber) 10%, var(--color-register))",
            borderBottom: "1px solid var(--color-line)",
          }}
        >
          <div className="screen py-3" style={{ paddingBottom: 12 }}>
            <p className="t-secondary" style={{ color: "var(--color-amber-text)" }}>
              {access.reason}
            </p>
          </div>
        </div>
      )}

      {access.planId === "trial" && access.trialDaysLeft !== null && access.active && (
        <div className="screen pt-3" style={{ paddingBottom: 0 }}>
          <p className="t-secondary">
            Trial — {access.trialDaysLeft} day{access.trialDaysLeft === 1 ? "" : "s"} left, full
            access.{" "}
            <Link href="/settings/billing" className="btn-quiet">
              See plans
            </Link>
          </p>
        </div>
      )}

      <div className="screen lg:flex lg:gap-8 lg:pt-6">
        <SideRail firmName={firm.name} planName={`${planName} · ${user.role}`} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <TabBar />
    </>
  );
}
