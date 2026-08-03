import Link from "next/link";
import { IconChevronLeft, IconGear } from "@/components/icons";

/**
 * The screen header: the brand mark or a back link, a mono meta line, and a
 * settings gear. The gear is a secondary path — every screen's primary action
 * lives in the thumb zone, never in a top corner.
 */
export function ScreenHeader({
  title,
  meta,
  backHref,
  backLabel,
  showSettings = true,
  action,
}: {
  title: string;
  meta?: string;
  backHref?: string;
  backLabel?: string;
  showSettings?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <header
      className="gutter"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        paddingTop: 20,
        paddingBottom: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {backHref ? (
          <Link
            href={backHref}
            className="t-secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              minHeight: 44,
              color: "var(--color-text-2)",
            }}
          >
            <IconChevronLeft size={16} />
            {backLabel ?? "Back"}
          </Link>
        ) : null}
        <h1 className="t-h2" style={{ margin: backHref ? "0" : "8px 0 0" }}>
          {title}
        </h1>
        {meta ? (
          <p className="t-data" style={{ color: "var(--color-text-3)", marginTop: 6 }}>
            {meta}
          </p>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
        {action}
        {showSettings ? (
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
        ) : null}
      </div>
    </header>
  );
}
