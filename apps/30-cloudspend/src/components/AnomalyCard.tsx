import Link from "next/link";
import { formatPerDay } from "@/lib/money";
import { durationShort, stampShort } from "@/lib/dates";
import { shortServiceName } from "@/lib/digest";
import { IconMagnifier } from "@/components/icons";
import { AckButton } from "@/components/AnomalyActions";

/**
 * The anomaly card, exactly as DESIGN.md constructs it: panel, hairline, radius
 * 12, padding 16 — state Label, Title, mono 20 delta, the correlated deploy row in
 * mono, a 48×16 dusk trend thumbnail, and a full-width Ack primary.
 *
 * The in-app card mirrors the Slack card block for block, which is why the same
 * sentences appear in both.
 */

export interface AnomalyCardData {
  id: string;
  service: string;
  region: string;
  status: "open" | "acked" | "resolved";
  startedAt: string;
  deltaPerDayMicros: number;
  ackedBy: string | null;
  deploy: { sha: string; serviceName: string; leadTime: string } | null;
  /** Hourly values for the 48×16 thumbnail, oldest first. */
  thumbnail: number[];
  demo: boolean;
}

const STATE_LABEL: Record<AnomalyCardData["status"], { text: string; className: string }> = {
  open: { text: "Open", className: "state-open" },
  acked: { text: "Acked", className: "state-acked" },
  resolved: { text: "Resolved", className: "state-resolved" },
};

function Thumbnail({ values, resolved }: { values: number[]; resolved: boolean }) {
  if (values.length < 2) return null;
  const peak = Math.max(1, ...values);
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * 48).toFixed(1)},${(16 - (v / peak) * 15).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={48} height={16} viewBox="0 0 48 16" aria-hidden="true" style={{ flex: "none" }}>
      <polyline
        points={points}
        fill="none"
        stroke={resolved ? "var(--color-green)" : "var(--color-dusk)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AnomalyCard({
  data,
  nowMs,
  canAck,
}: {
  data: AnomalyCardData;
  nowMs: number;
  canAck: boolean;
}) {
  const state = STATE_LABEL[data.status];
  const started = new Date(data.startedAt);
  return (
    <article className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <p className={`t-label ${state.className}`} style={{ margin: 0 }}>
          {state.text}
        </p>
        <p className="t-data" style={{ color: "var(--color-text-3)", margin: 0 }}>
          {stampShort(started)} · {durationShort(started.getTime(), nowMs)}
        </p>
      </div>

      <h3 className="t-title" style={{ marginTop: 8 }}>
        {shortServiceName(data.service)} — {data.region}
      </h3>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <p
          className="t-data-lg"
          style={{
            margin: 0,
            color: data.status === "resolved" ? "var(--color-green)" : "var(--color-amber)",
          }}
        >
          {formatPerDay(data.deltaPerDayMicros)}
        </p>
        <Thumbnail values={data.thumbnail} resolved={data.status === "resolved"} />
      </div>

      <p className="t-data" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
        {data.deploy
          ? `${data.deploy.sha} · ${data.deploy.serviceName} · ${data.deploy.leadTime}`
          : "No deploy in the 6h before onset"}
      </p>

      {data.ackedBy ? (
        <p className="t-data" style={{ color: "var(--color-text-3)", marginTop: 4 }}>
          ACKED BY {data.ackedBy.toUpperCase()}
        </p>
      ) : null}

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {data.status === "open" && canAck ? <AckButton anomalyId={data.id} /> : null}
        <Link
          className="btn btn-secondary btn-full"
          href={`/anomalies/${data.id}`}
          aria-label={`Investigate ${shortServiceName(data.service)} in ${data.region}`}
        >
          <IconMagnifier size={18} />
          Investigate
        </Link>
      </div>
    </article>
  );
}
