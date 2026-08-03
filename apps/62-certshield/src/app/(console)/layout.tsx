import Link from "next/link";
import { requireUser, roleLabel } from "@/lib/auth";
import { reviewQueueCount } from "@/lib/certificates";
import { accessLevel, trialState } from "@/lib/plans";
import { SideRail, TabBar } from "@/components/TabBar";
import { IconGear, IconShield } from "@/components/icons";

/**
 * The console shell. Desktop-first at 1280px per BUILD.md — a left rail and a wide
 * content column — collapsing to a single column with a bottom tab bar on a phone,
 * because a coordinator does check the review queue from the car park.
 *
 * Two banners, and only two: the trial countdown while it is running, and the
 * read-only notice once it has lapsed. Neither is a growth nag; both are facts a
 * user needs before they rely on what the screen says.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, org } = await requireUser();
  const reviewCount = await reviewQueueCount(org.id);
  const trial = trialState(org);
  const access = accessLevel(org);

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1280px] lg:gap-10 lg:px-8">
      <SideRail orgName={org.name} reviewCount={reviewCount} />

      <div className="min-w-0 flex-1">
        <header
          className="hairline-b flex items-center justify-between lg:hidden"
          style={{ padding: "12px var(--gutter)" }}
        >
          <Link
            href="/dashboard"
            className="flex items-center gap-2 no-underline"
            style={{ color: "var(--color-ink)", minHeight: 44 }}
          >
            <span style={{ color: "var(--color-seal)" }}>
              <IconShield size={20} />
            </span>
            <span className="t-title" style={{ fontWeight: 600 }}>
              {org.name}
            </span>
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex items-center justify-center no-underline"
            style={{ color: "var(--color-dim)", width: 44, height: 44 }}
          >
            <IconGear size={22} />
          </Link>
        </header>

        {access === "read_only" && (
          <div
            className="hairline-b"
            style={{ background: "var(--color-sheet)", padding: "12px var(--gutter)" }}
          >
            <p className="t-secondary">
              <strong style={{ color: "var(--color-claim)", fontWeight: 600 }}>
                Your trial has ended.
              </strong>{" "}
              Everything on file is intact and binder exports still work — adding vendors and
              sending chases are paused until you pick a plan.{" "}
              <Link href="/settings/billing" className="btn-quiet">
                Choose a plan
              </Link>
            </p>
          </div>
        )}

        {access === "full" && trial.onTrial && (
          <div
            className="hairline-b"
            style={{ background: "var(--color-sheet)", padding: "12px var(--gutter)" }}
          >
            <p className="t-secondary">
              {trial.daysLeft} day{trial.daysLeft === 1 ? "" : "s"} left in your trial. No card on
              file.{" "}
              <Link href="/settings/billing" className="btn-quiet">
                See plans
              </Link>
            </p>
          </div>
        )}

        {children}

        <p
          className="t-label"
          style={{ padding: "32px var(--gutter) calc(var(--tabbar-h) + 40px)" }}
        >
          Signed in as {user.name} · {roleLabel(user.role)} · {org.name}
        </p>
      </div>

      <TabBar reviewCount={reviewCount} />
    </div>
  );
}
