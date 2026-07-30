import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadStatusPage, statusLabel } from "@/lib/status-pages";
import { UptimeBars } from "@/components/UptimeBars";
import { StatusDot } from "@/components/StatusDot";
import { durationBetween } from "@/lib/format";

/**
 * Public status page. SSR with a short cache: an HN spike must not turn into a
 * database load spike at the exact moment the service is struggling
 * (ARCHITECTURE.md flow 4). Reads only the daily rollup and the incident tables.
 */
export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const view = await loadStatusPage((await params).slug);
  if (!view) return { title: "Status" };
  return {
    title: view.page.title,
    description: view.page.description ?? `Live status for ${view.page.title}.`,
    robots: { index: true },
  };
}

const BANNER = {
  operational: { text: "All systems operational", color: "var(--color-phosphor)" },
  degraded: { text: "Partially degraded", color: "var(--color-amber)" },
  outage: { text: "Active outage", color: "var(--color-red)" },
} as const;

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const view = await loadStatusPage((await params).slug);
  if (!view) notFound();

  const banner = BANNER[view.overall];
  const openIncidents = view.incidents.filter((i) => !i.resolvedAt);
  const pastIncidents = view.incidents.filter((i) => i.resolvedAt);

  return (
    <main className="screen mx-auto max-w-[720px] pb-16">
      <header className="pt-10 pb-8">
        <p className="t-label">{view.page.title}</p>
        <h1 className="t-h2 mt-3" style={{ color: banner.color }}>
          {banner.text}
        </h1>
        {view.page.description ? (
          <p className="t-secondary mt-2">{view.page.description}</p>
        ) : null}
      </header>

      {openIncidents.length ? (
        <section className="mb-8 flex flex-col gap-3">
          {openIncidents.map((incident) => (
            <article key={incident.id} className="incident-card">
              <p className="t-title">{incident.title}</p>
              <p className="t-data mt-1" style={{ color: "var(--color-red)" }}>
                ongoing · {durationBetween(incident.startedAt)}
              </p>
              {incident.updates.map((update, i) => (
                <p key={i} className="t-secondary mt-3">
                  <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                    {update.postedAt.toISOString().slice(11, 16)} UTC{" "}
                  </span>
                  {update.body}
                </p>
              ))}
            </article>
          ))}
        </section>
      ) : null}

      <section className="mb-10 flex flex-col gap-8">
        {view.services.length === 0 ? (
          <p className="t-secondary">No services are published on this page yet.</p>
        ) : (
          view.services.map((service) => (
            <article key={service.monitor.id}>
              <div className="flex items-center gap-2.5">
                <StatusDot status={service.monitor.status} />
                <h2 className="t-title min-w-0 flex-1 truncate">{service.displayName}</h2>
                <span
                  className="t-label"
                  style={{
                    color:
                      service.monitor.status === "down"
                        ? "var(--color-red)"
                        : service.monitor.status === "up"
                          ? "var(--color-phosphor)"
                          : undefined,
                  }}
                >
                  {statusLabel(service.monitor.status)}
                </span>
              </div>
              <div className="mt-3">
                <UptimeBars cells={service.cells} uptime90={service.uptime90} />
              </div>
            </article>
          ))
        )}
      </section>

      {pastIncidents.length ? (
        <section className="mb-10">
          <p className="t-label mb-4">Incident history</p>
          <ul>
            {pastIncidents.map((incident) => (
              <li key={incident.id} className="hairline-b py-4">
                <p className="t-title">{incident.title}</p>
                <p className="t-data mt-1" style={{ color: "var(--color-text-2)" }}>
                  {incident.startedAt.toISOString().slice(0, 10)} ·{" "}
                  {incident.resolvedAt
                    ? durationBetween(incident.startedAt, incident.resolvedAt)
                    : "ongoing"}
                </p>
                {incident.updates.map((update, i) => (
                  <p key={i} className="t-secondary mt-2">
                    {update.body}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="hairline-t pt-6">
        <p className="t-secondary">
          Times are UTC. Uptime is measured from our own probes; days we did not measure are shown
          empty rather than green.
        </p>
        {view.showBadge ? (
          <p className="t-label mt-4">
            Monitored by{" "}
            <a href="https://pulsewatch.dev" style={{ color: "var(--color-phosphor)" }}>
              PulseWatch
            </a>
          </p>
        ) : null}
      </footer>
    </main>
  );
}
