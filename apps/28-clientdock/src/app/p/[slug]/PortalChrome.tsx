import Link from "next/link";
import { AgencyMark } from "./PortalTheme";
import { IconChevronLeft } from "@/components/icons";
import { Monogram } from "@/components/Monogram";
import type { Branding } from "@/db/schema";

/** The slim top bar: agency mark left, a back arrow on module screens. */
export function PortalTopBar({
  branding,
  agencyName,
  backHref,
}: {
  branding: Branding;
  agencyName: string;
  backHref?: string;
}) {
  return (
    <div className="hairline-b flex items-center gap-3 py-4">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back to the portal"
          // 44x44 target, pulled back with negative margins so the glyph still
          // sits on the gutter line (DESIGN_LANGUAGE: targets >= 44px).
          style={{
            color: "var(--color-ink-2)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            marginLeft: -11,
            marginRight: -11,
            flex: "none",
          }}
        >
          <IconChevronLeft size={22} />
        </Link>
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        <AgencyMark branding={branding} name={agencyName} />
      </span>
    </div>
  );
}

/** Welcome band: brand fill, full-bleed, monogram + the client's name in serif. */
export function WelcomeBand({
  clientName,
  preparedBy,
  note,
}: {
  clientName: string;
  preparedBy: string;
  note?: string | null;
}) {
  return (
    <div className="welcome-band">
      <Monogram name={clientName} />
      <h1 className="t-display mt-4">Welcome, {clientName}</h1>
      {preparedBy ? <p className="band-secondary mt-2">Prepared by {preparedBy}</p> : null}
      {note ? <p className="band-secondary mt-3">{note}</p> : null}
    </div>
  );
}

/**
 * The Solo-tier footer line: 11px ink-3, one line, no logo. Agency+ removes every
 * trace, so this component simply isn't rendered.
 */
export function PortalFooter({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <footer className="hairline-t mt-10 pt-6">
      <p className="t-label" style={{ fontSize: 11 }}>
        via ClientDock
      </p>
    </footer>
  );
}

/** The agency's own view of a client portal, labelled so it can't be mistaken. */
export function PreviewNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="t-label mt-4" style={{ color: "var(--color-amber)" }}>
      Client view · preview — nothing you do here counts, and this visit isn&apos;t logged
    </p>
  );
}
