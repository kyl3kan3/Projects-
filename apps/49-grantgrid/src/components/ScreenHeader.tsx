import Link from "next/link";
import { IconGear } from "@/components/icons";

/**
 * The screen header: title, a mono summary label, and the only route to Settings
 * on a phone (the tab bar is spent on the four destinations DESIGN.md names).
 * Space and a hairline, no box.
 */
export function ScreenHeader({
  title,
  summary,
  action,
}: {
  title: string;
  /** Mono label line, e.g. `6 ACTIVE · $83,500 PENDING`. */
  summary?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="rule-b pb-4 pt-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-h2">{title}</h1>
          {summary ? (
            <p className="t-data mt-2" style={{ color: "var(--color-ink-2)" }}>
              {summary}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex items-center justify-center lg:hidden"
            style={{ width: 44, height: 44, color: "var(--color-ink-2)" }}
          >
            <IconGear size={22} />
          </Link>
        </div>
      </div>
    </header>
  );
}
