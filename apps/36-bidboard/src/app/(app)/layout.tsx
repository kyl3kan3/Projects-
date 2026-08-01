import Link from "next/link";
import { TabBar } from "@/components/TabBar";
import { requireUser } from "@/lib/auth";
import { trialState } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { company, user } = await requireUser();
  const trial = trialState(company);

  return (
    <div className="screen">
      <header
        className="gutter hairline-b"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--s4)",
          paddingBlock: "var(--s4)",
        }}
      >
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <Link href="/projects" className="t-label" style={{ letterSpacing: "0.16em" }}>
            BIDBOARD
          </Link>
          <span
            className="t-title"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {company.name}
          </span>
        </div>
        <div className="stack" style={{ gap: 2, alignItems: "flex-end", flex: "none" }}>
          <span className="t-data" style={{ color: "var(--fg-2)" }}>
            {PLANS[company.plan].name.toUpperCase()}
          </span>
          {trial.onTrial ? (
            <Link href="/settings/billing" className="t-data" style={{ color: "var(--warn)" }}>
              TRIAL · {trial.daysLeft}D LEFT
            </Link>
          ) : (
            <span className="t-secondary" style={{ fontSize: 11 }}>
              {user.email}
            </span>
          )}
        </div>
      </header>

      {children}
      <TabBar />
    </div>
  );
}
