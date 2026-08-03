/**
 * The screen header: the brand mark, the API being worked on, and the H2 title.
 *
 * Space before boxes — this is a hairline rule and margins, not a bar with a
 * background. The API switcher is a text link rather than a select because the
 * common case is one or two APIs and a `<select>` at the top of a phone screen
 * is the worst target on the page.
 */

import Link from "next/link";
import { BrandMark, IconChevronRight } from "@/components/icons";

export function AppHeader({
  apiName,
  apiSlug,
  trialNote,
}: {
  apiName?: string;
  apiSlug?: string;
  trialNote?: string | null;
}) {
  return (
    <header className="gutter hairline-b" style={{ paddingBlock: 12 }}>
      <div
        className="wrap"
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, flexWrap: "wrap" }}
      >
        <Link
          href="/apis"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--color-text)" }}
        >
          <BrandMark size={22} />
          <span className="t-label" style={{ color: "var(--color-text-2)" }}>
            SchemaSentry
          </span>
        </Link>

        {apiName && apiSlug ? (
          <>
            <IconChevronRight size={16} style={{ color: "var(--color-text-3-aa)" }} />
            <Link href={`/apis/${apiSlug}`} className="t-data" style={{ color: "var(--color-text)" }}>
              {apiSlug}
            </Link>
          </>
        ) : null}

        <span style={{ flex: 1 }} />

        {trialNote ? (
          <span className="t-label" style={{ color: "var(--color-amber)" }}>
            {trialNote}
          </span>
        ) : null}

        {/* "Account", not "Settings": the per-API screen has its own Settings
            link, and two controls with the same word going to different places
            is the kind of thing people only notice by getting it wrong. */}
        <Link href="/settings" className="t-secondary" style={{ color: "var(--color-text-2)" }}>
          Account
        </Link>
      </div>
    </header>
  );
}

export function ScreenTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="t-h2" style={{ margin: 0 }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="t-secondary" style={{ margin: "8px 0 0" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
