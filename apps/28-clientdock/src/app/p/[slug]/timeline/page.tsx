import type { Metadata } from "next";
import { listPhases } from "@/lib/portals";
import { overallProgress, stampDate } from "@/lib/format";
import { MODULE_COPY } from "@/components/module-copy";
import { PortalTheme } from "../PortalTheme";
import { PortalFooter, PortalTopBar } from "../PortalChrome";
import { requirePortalModule } from "../guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Timeline", robots: { index: false } };

export default async function PortalTimeline({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requirePortalModule(slug, "timeline");
  const phases = await listPhases(viewer.portalId);
  const progress = overallProgress(phases);

  // The rail fills brass through completed phases: the proportion of the rail, not
  // the proportion of the work, so a half-done phase doesn't read as finished.
  const completed = phases.filter((p) => p.progressPct === 100).length;
  const fillPct = phases.length ? Math.round((completed / phases.length) * 100) : 0;

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main className="screen screen-portal">
        <PortalTopBar
          branding={viewer.workspace.branding}
          agencyName={viewer.workspace.name}
          backHref={`/p/${slug}`}
        />
        <header className="pt-8 pb-6">
          <h1 className="t-h2">Timeline</h1>
          <p className="t-data mt-2" style={{ color: "var(--color-ink-2)" }}>
            {progress}% THROUGH · {completed} OF {phases.length} PHASES DONE
          </p>
        </header>

        {phases.length === 0 ? (
          <p className="t-secondary">
            {MODULE_COPY.timeline.empty} {viewer.workspace.name} will stock this room.
          </p>
        ) : (
          <div className="rail">
            <div className="rail-fill" style={{ height: `calc(${fillPct}% - 12px)` }} />
            {phases.map((phase) => {
              const state =
                phase.progressPct === 100 ? "done" : phase.progressPct > 0 ? "active" : "todo";
              return (
                <section key={phase.id} className="relative pb-6">
                  <span className="phase-dot" data-state={state} />
                  <div className="flex items-baseline gap-3">
                    <h2 className="t-title min-w-0 flex-1">{phase.name}</h2>
                    <span className="t-data" style={{ color: "var(--color-ink-3)" }}>
                      UPDATED {stampDate(phase.updatedAt)}
                    </span>
                  </div>
                  <div className="meter mt-2">
                    <div className="meter-fill" style={{ width: `${phase.progressPct}%` }} />
                  </div>
                  <p className="t-secondary mt-2">
                    {phase.note ??
                      (state === "done"
                        ? "Done."
                        : state === "active"
                          ? `${phase.progressPct}% through.`
                          : "Not started yet.")}
                  </p>
                </section>
              );
            })}
          </div>
        )}

        <PortalFooter show={viewer.showBadge} />
      </main>
    </PortalTheme>
  );
}
