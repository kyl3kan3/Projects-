import Link from "next/link";
import { requireUser, roleLabel } from "@/lib/auth";
import { agreementState } from "@/lib/agreement";
import { IconGear } from "@/components/icons";
import { SideRail, TabBar, IconShieldMark } from "@/components/TabBar";

/**
 * The practice app shell: a small header, the tab bar on a phone, a left rail at
 * >=1024px, and one banner that will not go away until the practice has read the
 * data-protection agreement.
 *
 * The banner is not a growth nag. FormForge is pre-launch, so a practice that has
 * not read what the software does and does not promise should be told on every
 * screen, not once at signup.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, practice } = await requireUser();
  const agreement = agreementState(practice);

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1120px] lg:gap-8 lg:px-8">
      <SideRail practiceName={practice.name} />

      <div className="min-w-0 flex-1">
        <header className="hairline-b flex items-center justify-between px-5 py-3 lg:hidden">
          <Link
            href="/intakes"
            className="flex min-h-11 items-center gap-2 no-underline"
            style={{ color: "var(--color-ink)" }}
          >
            <span style={{ color: "var(--color-teal)" }}>
              <IconShieldMark size={20} />
            </span>
            <span className="t-title">{practice.name}</span>
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center no-underline"
            style={{ color: "var(--color-ink-2)" }}
          >
            <IconGear size={22} />
          </Link>
        </header>

        {!agreement.accepted && (
          <div
            className="px-5 py-3 lg:px-0"
            style={{ background: "var(--color-chart)", borderBottom: "1px solid var(--color-hairline)" }}
          >
            <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
              You have not read the data-protection agreement yet.{" "}
              <Link href="/settings/agreement" className="btn-quiet">
                Read it now
              </Link>
            </p>
          </div>
        )}

        {agreement.stale && (
          <div
            className="px-5 py-3 lg:px-0"
            style={{ background: "var(--color-chart)", borderBottom: "1px solid var(--color-hairline)" }}
          >
            <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
              The agreement has been revised since {agreement.signerName} accepted it.{" "}
              <Link href="/settings/agreement" className="btn-quiet">
                Review the changes
              </Link>
            </p>
          </div>
        )}

        {children}

        <p className="t-label px-5 pb-24 pt-8 lg:px-0 lg:pb-8">
          Signed in as {user.name} · {roleLabel(user.role)}
        </p>
      </div>

      <TabBar />
    </div>
  );
}
