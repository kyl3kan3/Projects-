import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { TabBar } from "@/components/TabBar";
import { srOnly } from "@/components/ui";
import { trialActive, trialDaysLeft } from "@/lib/plans";
import { senderMode } from "@/server/notify";

/**
 * The console shell. Every screen inside it is behind a session, and the header
 * carries the two facts a user needs at all times: which location they are looking
 * at, and whether sending is live or a rehearsal.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, practice, location, locations } = await requireUser();
  const sender = senderMode();
  const dryRun = sender.email === "dry_run" || sender.sms === "dry_run";
  const daysLeft = trialDaysLeft(practice.trialEndsAt);

  return (
    <>
      <header
        className="hairline-b"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "color-mix(in srgb, var(--color-porcelain) 94%, transparent)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          className="screen"
          style={{
            paddingTop: 10,
            paddingBottom: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Icon name="chair-side" size={22} />
            <span style={{ minWidth: 0 }}>
              <span className="t-title" style={{ display: "block", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {practice.name}
              </span>
              <span className="t-secondary" style={{ display: "block", lineHeight: 1.2 }}>
                {location.name}
                {locations.length > 1 ? ` · ${locations.length} locations` : ""}
              </span>
            </span>
          </Link>
          <Link href="/settings" className="btn-quiet" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="settings" size={18} />
            <span style={srOnly}>Settings</span>
            <span className="t-secondary" style={{ color: "var(--color-aqua-text)", fontWeight: 700 }}>
              {user.name.split(" ")[0]}
            </span>
          </Link>
        </div>

        {(dryRun || trialActive(practice.trialEndsAt)) && (
          <div
            className="screen"
            style={{ paddingTop: 0, paddingBottom: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            {dryRun && (
              <span className="pill pill-amber" title={sender.reason}>
                Rehearsal mode
              </span>
            )}
            {trialActive(practice.trialEndsAt) && (
              <span className="pill pill-quiet">
                Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
            )}
          </div>
        )}
      </header>

      {children}
      <TabBar />
    </>
  );
}
