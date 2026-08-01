import { themeVars } from "@/lib/whitelabel";
import type { Branding } from "@/db/schema";

/**
 * Applies the agency's three themeable tokens to everything inside. Vanishing
 * gracefully is the system's flex: nothing else about the portal changes, so a
 * re-skin can never break the layout or the meaning of a colour.
 */
export function PortalTheme({
  branding,
  children,
}: {
  branding: Branding;
  children: React.ReactNode;
}) {
  return (
    <div style={themeVars(branding) as React.CSSProperties}>{children}</div>
  );
}

/** The agency's logo, or nothing. Max-height 28, per DESIGN.md. */
export function AgencyMark({ branding, name }: { branding: Branding; name: string }) {
  if (branding.logoSvg) {
    return (
      <span
        className="inline-flex items-center"
        style={{ maxHeight: 28, overflow: "hidden" }}
        aria-label={name}
        // The SVG is validated on save: no script, no event handlers, no remote
        // references (see sanitizeLogoSvg).
        dangerouslySetInnerHTML={{ __html: branding.logoSvg }}
      />
    );
  }
  return (
    <span className="t-title" style={{ fontFamily: "var(--wl-display-font)" }}>
      {name}
    </span>
  );
}
