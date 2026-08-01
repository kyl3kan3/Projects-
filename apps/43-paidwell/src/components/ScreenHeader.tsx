import Link from "next/link";
import { IconGear } from "@/components/icons";

/**
 * The screen header: firm mark, the sync status line in mono, and a settings
 * gear. The gear is a secondary path — the primary action on every screen lives
 * in the thumb zone, never in a top corner.
 */
export function ScreenHeader({
  firmName,
  meta,
  metaHref,
}: {
  firmName: string;
  meta?: string;
  metaHref?: string;
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
        paddingBottom: 20,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Link
          href="/aging"
          className="t-h2"
          style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}
        >
          {firmName}
        </Link>
        {meta ? (
          metaHref ? (
            <Link
              href={metaHref}
              className="t-data"
              style={{
                color: "var(--color-text-aa)",
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
              }}
            >
              {meta}
            </Link>
          ) : (
            <p className="t-data" style={{ color: "var(--color-text-aa)", marginTop: 4 }}>
              {meta}
            </p>
          )
        ) : null}
      </div>
      <Link
        href="/settings"
        aria-label="Settings"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          flex: "none",
          color: "var(--color-text-2)",
        }}
      >
        <IconGear size={22} />
      </Link>
    </header>
  );
}
