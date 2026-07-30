import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { alertChannels, checkResults, monitors as monitorsTable, notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getIncident, incidentTimeline } from "@/lib/incidents";
import { Sparkline } from "@/components/Sparkline";
import { ChannelIcon, IconCheck } from "@/components/icons";
import { clock, durationBetween } from "@/lib/format";
import { acknowledgeAction, postUpdateAction, resolveAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { team } = await requireUser();
  const incident = await getIncident((await params).id, team.id);
  return { title: incident?.title || "Incident" };
}

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { team } = await requireUser();
  const { id } = await params;
  const incident = await getIncident(id, team.id);
  if (!incident) notFound();

  const db = getDb();
  const updates = await incidentTimeline(incident.id);

  const [monitor] = incident.monitorId
    ? await db.select().from(monitorsTable).where(eq(monitorsTable.id, incident.monitorId))
    : [];

  // Which channels were told, and whether the send landed.
  const sends = await db
    .select({ notification: notifications, channel: alertChannels })
    .from(notifications)
    .innerJoin(alertChannels, eq(alertChannels.id, notifications.alertChannelId))
    .where(eq(notifications.incidentId, incident.id));

  // The trace across the outage window, padded either side so the drop is visible.
  const from = new Date(incident.startedAt.getTime() - 15 * 60_000);
  const to = new Date((incident.resolvedAt ?? new Date()).getTime() + 15 * 60_000);
  const results = incident.monitorId
    ? await db
        .select({ latencyMs: checkResults.latencyMs, ok: checkResults.ok })
        .from(checkResults)
        .where(
          and(
            eq(checkResults.monitorId, incident.monitorId),
            gte(checkResults.checkedAt, from),
            lte(checkResults.checkedAt, to),
          ),
        )
        .orderBy(checkResults.checkedAt)
        .limit(240)
    : [];
  const points = results.map((r) => (r.ok ? (r.latencyMs ?? 0) : 0));

  const resolved = Boolean(incident.resolvedAt);
  const advisory = incident.kind === "ssl_expiry" || incident.kind === "domain_expiry";

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/incidents" className="btn-quiet no-underline">
          Incidents
        </Link>
        <h1 className="t-h2 mt-4">{incident.title || "Incident"}</h1>
        <p
          className="t-data mt-2"
          style={{
            color: resolved
              ? "var(--color-text-2)"
              : advisory
                ? "var(--color-amber)"
                : "var(--color-red)",
          }}
        >
          {resolved
            ? `resolved after ${durationBetween(incident.startedAt, incident.resolvedAt!)}`
            : advisory
              ? "open · advisory"
              : `down ${durationBetween(incident.startedAt)}`}
        </p>
        {monitor ? (
          <Link href={`/monitors/${monitor.id}`} className="btn-quiet mt-3 inline-block no-underline">
            {monitor.name}
          </Link>
        ) : null}
      </header>

      {/* The vertical hairline timeline from DESIGN.md. */}
      <section className="mb-8">
        <p className="t-label mb-4">Timeline</p>
        <ol
          className="flex flex-col gap-5 pl-4"
          style={{ borderLeft: "1px solid var(--color-hairline)" }}
        >
          <TimelineItem
            at={incident.startedAt}
            title="Detected"
            detail={incident.triggerSummary}
            tone={advisory ? "amber" : "red"}
          />

          {incident.confirmingRegions.length ? (
            <TimelineItem
              at={incident.startedAt}
              title={`${incident.confirmingRegions.length}/${monitor?.regions.length ?? incident.confirmingRegions.length} regions`}
              detail={incident.confirmingRegions.join(", ")}
            />
          ) : null}

          {sends.length ? (
            <li className="relative">
              <Marker />
              <p className="t-data" style={{ color: "var(--color-text-3)" }}>
                {clock(sends[0].notification.createdAt)}
              </p>
              <p className="t-title mt-1">Alerts sent</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sends.map(({ notification, channel }) => (
                  <span
                    key={notification.id}
                    className="chip"
                    data-active={notification.status === "sent"}
                    style={{
                      color:
                        notification.status === "failed" ? "var(--color-red)" : undefined,
                      borderColor:
                        notification.status === "failed" ? "var(--color-red)" : undefined,
                    }}
                    title={notification.error ?? notification.edge}
                  >
                    <ChannelIcon kind={channel.kind} size={14} />
                    {channel.name}
                    {notification.status === "failed" ? " · failed" : ""}
                  </span>
                ))}
              </div>
            </li>
          ) : null}

          {incident.acknowledgedAt ? (
            <TimelineItem
              at={incident.acknowledgedAt}
              title="Acknowledged"
              detail="Someone is looking at it."
            />
          ) : null}

          {updates
            .filter((u) => u.visibility === "public" && u.postedAt > incident.startedAt)
            .map((update) => (
              <TimelineItem
                key={update.id}
                at={update.postedAt}
                title="Update"
                detail={update.body}
              />
            ))}

          {incident.resolvedAt ? (
            <TimelineItem
              at={incident.resolvedAt}
              title="Recovered"
              detail={`Down for ${durationBetween(incident.startedAt, incident.resolvedAt)}.`}
              tone="phosphor"
            />
          ) : null}
        </ol>
      </section>

      {points.length ? (
        <section className="mb-8">
          <p className="t-label mb-3">Response time across the outage</p>
          <div className="panel p-4">
            <Sparkline points={points} down={!resolved} width={280} height={72} />
          </div>
          <p className="t-secondary mt-2">
            {from.toISOString().slice(11, 16)}–{to.toISOString().slice(11, 16)} UTC · a value on the
            baseline is a failed check.
          </p>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-3">
        {!incident.acknowledgedAt && !resolved ? (
          <form action={acknowledgeAction}>
            <input type="hidden" name="id" value={incident.id} />
            <button className="btn btn-secondary" type="submit">
              <IconCheck size={18} />
              Acknowledge
            </button>
          </form>
        ) : null}

        {!resolved && incident.kind === "manual" ? (
          <form action={resolveAction}>
            <input type="hidden" name="id" value={incident.id} />
            <button className="btn btn-secondary" type="submit">
              Mark resolved
            </button>
          </form>
        ) : null}
      </section>

      {!resolved ? (
        <section className="pt-8 pb-8">
          <p className="t-label mb-3">Post a public update</p>
          <form action={postUpdateAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={incident.id} />
            <textarea
              className="input"
              name="body"
              rows={3}
              required
              placeholder="Identified the cause: a bad deploy. Rolling back now."
            />
            <button className="btn btn-secondary self-start" type="submit">
              Post update
            </button>
          </form>
        </section>
      ) : null}

      {incident.kind !== "manual" && !resolved ? (
        <p className="t-secondary pb-8">
          This resolves itself on the next successful check — no action needed to close it.
        </p>
      ) : null}
    </main>
  );
}

function Marker({ tone }: { tone?: "red" | "amber" | "phosphor" }) {
  const color =
    tone === "red"
      ? "var(--color-red)"
      : tone === "amber"
        ? "var(--color-amber)"
        : tone === "phosphor"
          ? "var(--color-phosphor)"
          : "var(--color-text-3)";
  return (
    <span
      className="dot"
      style={{ position: "absolute", left: "-21px", top: "6px", background: color }}
    />
  );
}

function TimelineItem({
  at,
  title,
  detail,
  tone,
}: {
  at: Date;
  title: string;
  detail?: string;
  tone?: "red" | "amber" | "phosphor";
}) {
  return (
    <li className="relative">
      <Marker tone={tone} />
      <p className="t-data" style={{ color: "var(--color-text-3)" }}>
        {clock(at)}
      </p>
      <p className="t-title mt-1">{title}</p>
      {detail ? <p className="t-secondary mt-1">{detail}</p> : null}
    </li>
  );
}
