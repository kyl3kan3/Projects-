import type { Metadata } from "next";
import { listLinks } from "@/lib/portals";
import { MODULE_COPY } from "@/components/module-copy";
import { IconLink } from "@/components/icons";
import { PortalTheme } from "../PortalTheme";
import { PortalFooter, PortalTopBar } from "../PortalChrome";
import { requirePortalModule } from "../guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Links", robots: { index: false } };

export default async function PortalLinks({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requirePortalModule(slug, "links");
  const links = await listLinks(viewer.portalId);

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main className="screen screen-portal">
        <PortalTopBar
          branding={viewer.workspace.branding}
          agencyName={viewer.workspace.name}
          backHref={`/p/${slug}`}
        />
        <header className="pt-8 pb-6">
          <h1 className="t-h2">Links</h1>
          <p className="t-secondary mt-2">Everything that lives somewhere else.</p>
        </header>

        {links.length === 0 ? (
          <p className="t-secondary">{MODULE_COPY.links.empty}</p>
        ) : (
          links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              className="row"
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconLink size={18} style={{ color: "var(--wl-accent)", flex: "none" }} />
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{link.label}</span>
                <span className="t-data block truncate" style={{ color: "var(--color-ink-3)" }}>
                  {new URL(link.url).hostname}
                </span>
              </span>
            </a>
          ))
        )}

        <PortalFooter show={viewer.showBadge} />
      </main>
    </PortalTheme>
  );
}
