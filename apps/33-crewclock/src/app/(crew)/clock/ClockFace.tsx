"use client";

/**
 * The crew clock. One oversized control, one honest caption, nothing else — a
 * gloved thumb runs this screen in under ten seconds.
 *
 * Every punch goes through the outbox: enqueue first, then try to send. A punch
 * that fails to reach the server is already on the phone, so the tap is never
 * lost, and the copy says exactly that instead of pretending it synced.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeofenceRing } from "@/components/GeofenceRing";
import { IconAlertOff, IconMapPin, IconPause, IconPlay, IconRing } from "@/components/icons";
import {
  count as outboxCount,
  deviceFingerprint,
  enqueue,
  flush,
  getFix,
  supportsOutbox,
  type OutboxPunch,
} from "@/lib/outbox";

export interface ClockJob {
  id: string;
  name: string;
  siteLabel: string | null;
  radiusM: number | null;
}

export interface OpenShift {
  id: string;
  jobId: string;
  clockInAtIso: string;
  breakSeconds: number;
  breakStartedAtIso: string | null;
  fenceStatus: "inside" | "outside" | "unavailable" | null;
  distanceM: number | null;
}

export interface ClockStrings {
  in: string;
  out: string;
  punching: string;
  onTheClock: string;
  off: string;
  onBreak: string;
  shift: string;
  startedAt: string;
  breakStart: string;
  breakEnd: string;
  pickJob: string;
  noJobs: string;
  noJobsHelp: string;
  locating: string;
  fenceInside: string;
  fenceOutside: string;
  fenceUnavailable: string;
  fenceLowAccuracy: string;
  fenceNoSite: string;
  fenceRadius: string;
  savedOnPhone: string;
  queuedOne: string;
  queuedMany: string;
  syncNow: string;
  today: string;
  week: string;
  confirmIn: string;
  confirmOut: string;
  retry: string;
}

interface Props {
  jobs: ClockJob[];
  open: OpenShift | null;
  todaySeconds: number;
  weekSeconds: number;
  strings: ClockStrings;
  clockTimeLabel: string | null;
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export function ClockFace({
  jobs,
  open,
  todaySeconds,
  weekSeconds,
  strings,
  clockTimeLabel,
}: Props) {
  const router = useRouter();
  const [jobId, setJobId] = useState(open?.jobId ?? jobs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "locating" | "sending">("idle");
  const [queued, setQueued] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* The hero readout ticks every second while a shift is open. */
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const refreshQueue = useCallback(async () => {
    if (!supportsOutbox()) return;
    setQueued(await outboxCount());
  }, []);

  /* Try the queue on mount and whenever the signal comes back. */
  useEffect(() => {
    let cancelled = false;
    const attempt = async () => {
      if (!supportsOutbox()) return;
      try {
        if ((await outboxCount()) > 0) {
          await flush();
          if (!cancelled) router.refresh();
        }
      } catch {
        /* Still offline. The punches stay on the phone. */
      } finally {
        if (!cancelled) await refreshQueue();
      }
    };
    void attempt();
    window.addEventListener("online", attempt);
    return () => {
      cancelled = true;
      window.removeEventListener("online", attempt);
    };
  }, [refreshQueue, router]);

  const selectedJob = jobs.find((j) => j.id === (open?.jobId ?? jobId)) ?? null;

  /* The caption under the ring, in priority order: what just happened, then
     what we know about the shift, then what the site looks like. */
  const restingCaption = (() => {
    if (caption) return caption;
    if (open) return fenceCaption(open.fenceStatus, open.distanceM, null, strings);
    if (!selectedJob) return strings.noJobs;
    if (selectedJob.radiusM === null) return strings.fenceNoSite;
    return fill(strings.fenceRadius, { meters: selectedJob.radiusM });
  })();

  const punch = async (kind: "in" | "out") => {
    if (busy) return;
    const targetJob = kind === "out" ? open?.jobId : jobId;
    if (!targetJob) return;

    setBusy(true);
    setFlash(null);
    setPhase("locating");

    const fix = await getFix();
    const item: OutboxPunch = {
      clientEventId:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      jobId: targetJob,
      kind,
      occurredAt: new Date().toISOString(),
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      deviceFingerprint: deviceFingerprint(),
      attempts: 0,
    };

    // On the phone first. Everything after this can fail without losing a punch.
    try {
      if (supportsOutbox()) await enqueue(item);
    } catch {
      /* Private mode with IndexedDB blocked: fall through to a direct send. */
    }

    setPhase("sending");
    try {
      const response = await fetch("/api/punches/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          punches: [
            {
              clientEventId: item.clientEventId,
              jobId: item.jobId,
              kind: item.kind,
              occurredAt: item.occurredAt,
              lat: item.lat,
              lng: item.lng,
              accuracyM: item.accuracyM,
              deviceFingerprint: item.deviceFingerprint,
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        results: {
          clientEventId: string;
          status: string;
          fenceStatus: "inside" | "outside" | "unavailable" | null;
          distanceM: number | null;
          accuracyM: number | null;
          workedSeconds: number | null;
        }[];
      };
      const result = body.results[0];
      await flush().catch(() => undefined);
      if (result) {
        setCaption(fenceCaption(result.fenceStatus, result.distanceM, result.accuracyM, strings));
        setFlash(
          kind === "in"
            ? strings.confirmIn
            : fill(strings.confirmOut, {
                duration: formatDuration(result.workedSeconds ?? 0),
              }),
        );
      }
      router.refresh();
    } catch {
      setCaption(strings.savedOnPhone);
      setFlash(strings.savedOnPhone);
    } finally {
      await refreshQueue();
      if (mounted.current) {
        setBusy(false);
        setPhase("idle");
      }
    }
  };

  const breakAction = async (action: "start" | "end") => {
    setBusy(true);
    try {
      await fetch("/api/punches/break", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  /* Live totals: the server numbers plus the running shift. */
  const openElapsed = open ? liveSeconds(open, tick) : 0;
  const heroSeconds = open ? openElapsed : todaySeconds;
  const onBreak = Boolean(open?.breakStartedAtIso);

  return (
    <main className="screen screen-crew">
      <header className="flex items-center justify-between pt-6 pb-4">
        <span className="pill" data-tone={open ? (onBreak ? "warn" : "on") : undefined}>
          <span className="dot" />
          {open ? (onBreak ? strings.onBreak : strings.onTheClock) : strings.off}
        </span>
        {queued > 0 ? (
          <span className="t-secondary">
            {queued === 1 ? strings.queuedOne : fill(strings.queuedMany, { count: queued })}
          </span>
        ) : null}
      </header>

      <GeofenceRing
        state={open ? "on" : "off"}
        label={(selectedJob?.siteLabel ?? selectedJob?.name ?? "—").toUpperCase()}
        caption={phase === "locating" ? strings.locating : restingCaption}
      />

      <section className="pt-6 pb-2">
        <p className="t-stat">{formatDuration(heroSeconds)}</p>
        <p className="t-secondary mt-1">
          {open
            ? `${strings.shift}: ${formatDuration(openElapsed)}${
                clockTimeLabel ? ` · ${fill(strings.startedAt, { time: clockTimeLabel })}` : ""
              }`
            : `${strings.today}: ${formatDuration(todaySeconds)} · ${strings.week}: ${formatDuration(weekSeconds)}`}
        </p>
      </section>

      {flash ? (
        <p className="t-secondary" role="status" style={{ color: "var(--accent)" }}>
          {flash}
        </p>
      ) : null}

      {jobs.length === 0 ? (
        <section className="panel mt-4 p-5">
          <p className="t-title">{strings.noJobs}</p>
          <p className="t-secondary mt-2">{strings.noJobsHelp}</p>
        </section>
      ) : null}

      {!open && jobs.length > 1 ? (
        <section className="mt-4 flex flex-col gap-2">
          <span className="t-label">{strings.pickJob}</span>
          <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className="chip"
                data-active={job.id === jobId}
                onClick={() => {
                  setJobId(job.id);
                  setCaption(null);
                }}
              >
                {job.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {open ? (
        <section className="mt-5">
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={() => breakAction(onBreak ? "end" : "start")}
            disabled={busy}
          >
            {onBreak ? <IconPlay size={18} /> : <IconPause size={18} />}
            {onBreak ? strings.breakEnd : strings.breakStart}
          </button>
        </section>
      ) : null}

      {jobs.length > 0 ? (
        <div className="thumb-zone">
          <button
            type="button"
            className="clock-btn"
            data-on={open ? "true" : "false"}
            disabled={busy || (!open && !jobId)}
            onClick={() => punch(open ? "out" : "in")}
          >
            {busy ? null : <StateGlyph status={open?.fenceStatus ?? null} />}
            {busy ? strings.punching : open ? strings.out : strings.in}
          </button>
        </div>
      ) : null}
    </main>
  );
}

function StateGlyph({ status }: { status: "inside" | "outside" | "unavailable" | null }) {
  if (status === "outside") return <IconMapPin size={20} style={{ color: "var(--warn)" }} />;
  if (status === "unavailable") return <IconAlertOff size={20} style={{ color: "var(--fg-3)" }} />;
  return <IconRing size={20} style={{ color: "var(--accent)" }} />;
}

function liveSeconds(open: OpenShift, nowMs: number): number {
  const start = new Date(open.clockInAtIso).getTime();
  const runningBreak = open.breakStartedAtIso
    ? Math.max(0, Math.floor((nowMs - new Date(open.breakStartedAtIso).getTime()) / 1000))
    : 0;
  return Math.max(0, Math.floor((nowMs - start) / 1000) - open.breakSeconds - runningBreak);
}

function fenceCaption(
  status: "inside" | "outside" | "unavailable" | null,
  distanceM: number | null,
  accuracyM: number | null,
  strings: ClockStrings,
): string {
  if (status === "inside") return strings.fenceInside;
  if (status === "outside") {
    return fill(strings.fenceOutside, { meters: Math.round(distanceM ?? 0) });
  }
  if (status === "unavailable" && accuracyM !== null && accuracyM > 1000) {
    return fill(strings.fenceLowAccuracy, { meters: Math.round(accuracyM) });
  }
  return strings.fenceUnavailable;
}
