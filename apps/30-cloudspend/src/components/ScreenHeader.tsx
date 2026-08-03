import Link from "next/link";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { IconFlare, IconGear } from "@/components/icons";

/**
 * The top bar DESIGN.md specifies: account switcher on the left (mono label +
 * chevron), the flare badge with its open-anomaly count on the right, and a quiet
 * route to settings. The primary action on every screen lives in the thumb zone,
 * never up here.
 */
export function ScreenHeader({
  accounts,
  selectedId,
  openAnomalies,
  title,
}: {
  accounts: Array<{ id: string; label: string; demo: boolean }>;
  selectedId: string;
  openAnomalies: number;
  title?: string;
}) {
  return (
    <header
      className="gutter"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingTop: 12,
        paddingBottom: 8,
      }}
    >
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <AccountSwitcher accounts={accounts} selectedId={selectedId} />
        {title ? (
          <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
            {title}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}>
        <Link
          href="/anomalies"
          aria-label={
            openAnomalies === 1
              ? "1 open anomaly"
              : `${openAnomalies} open anomalies`
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
            padding: "0 6px",
            color: openAnomalies > 0 ? "var(--color-amber)" : "var(--color-text-3)",
          }}
        >
          <IconFlare size={22} />
          {openAnomalies > 0 ? <span className="badge">{openAnomalies}</span> : null}
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            color: "var(--color-text-2)",
          }}
        >
          <IconGear size={22} />
        </Link>
      </div>
    </header>
  );
}

/** The banner shown on every screen fed by the synthetic provider. */
export function DemoNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p
      className="t-data gutter"
      style={{
        color: "var(--color-text-2)",
        paddingTop: 8,
        paddingBottom: 8,
        borderBottom: "1px solid var(--color-hairline)",
      }}
    >
      DEMO DATA · no AWS credential is configured, so these figures are a
      simulated estate, not a bill.
    </p>
  );
}
