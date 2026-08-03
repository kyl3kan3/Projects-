import Link from "next/link";
import { IconBeltBar, IconSettings } from "@/components/icons";
import { TabBar } from "@/components/TabBar";
import { requireSchool } from "@/lib/auth";
import { trialState } from "@/lib/plans";

/**
 * The staff console shell: a quiet header, the four-tab bar (a left rail at
 * >=1024px), and the trial banner while the clock is running.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { school, user } = await requireSchool();
  const trial = trialState(school.trialEndsAt);

  return (
    <>
      <header className="hairline-b">
        <div
          className="screen-plain flex items-center justify-between"
          style={{ paddingTop: 12, paddingBottom: 12, gap: 16 }}
        >
          <Link href="/roster" className="flex items-center gap-2 fg" style={{ minWidth: 0 }}>
            <span className="crimson" style={{ flex: "none" }}>
              <IconBeltBar size={22} />
            </span>
            <span className="t-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {school.name}
            </span>
          </Link>
          <div className="flex items-center gap-3" style={{ flex: "none" }}>
            {trial.trialing && school.billingStatus === "trialing" ? (
              <Link href="/settings/plan" className="t-data crimson">
                {trial.daysLeft}d trial
              </Link>
            ) : null}
            <Link href="/settings" className="fg-2" aria-label={`Settings — signed in as ${user.name}`}>
              <IconSettings size={22} />
            </Link>
          </div>
        </div>
      </header>
      {children}
      <TabBar />
    </>
  );
}
