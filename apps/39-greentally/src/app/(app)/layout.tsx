import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";
import { IconGear, IconLedger, IconTable, TallyMark } from "@/components/icons";
import { planLabel } from "@/lib/plans";

/**
 * The signed-in shell: a bottom tab bar on a phone with a compact header for the three
 * screens that do not earn a tab, and a left rail from 1024px.
 *
 * The layout resolves the session once, so every screen under it can assume a user, an
 * organisation and a reporting period.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, period } = await requireOnboarded();

  return (
    <>
      <header className="hairline-b lg:hidden">
        <div
          className="flex items-center justify-between"
          style={{ paddingInline: "var(--gutter)", height: 52 }}
        >
          <Link href="/footprint" className="flex min-w-0 items-center gap-2">
            <span style={{ color: "var(--color-accent-text)" }}>
              <TallyMark size={18} />
            </span>
            <span className="t-title truncate">{org.name}</span>
            <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
              {period.year}
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="More">
            <Link
              href="/spend"
              aria-label="Spend"
              className="flex h-11 w-11 items-center justify-center"
              style={{ color: "var(--color-fg-2)" }}
            >
              <IconTable size={20} />
            </Link>
            <Link
              href="/audit"
              aria-label="Audit trail"
              className="flex h-11 w-11 items-center justify-center"
              style={{ color: "var(--color-fg-2)" }}
            >
              <IconLedger size={20} />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-11 w-11 items-center justify-center"
              style={{ color: "var(--color-fg-2)" }}
            >
              <IconGear size={20} />
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1120px] gap-8 px-0 lg:px-8">
        <SideRail orgName={org.name} planName={`${planLabel(org.plan)} · ${period.year}`} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <TabBar />
    </>
  );
}
