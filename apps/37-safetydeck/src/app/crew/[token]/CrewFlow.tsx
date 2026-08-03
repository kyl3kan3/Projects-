"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TalkBody } from "@/components/TalkBody";
import {
  IconCamera,
  IconCheck,
  IconCloudOff,
  IconCloudUp,
  IconMapPin,
  IconPenLine,
} from "@/components/icons";
import {
  cacheTalk,
  deviceId,
  pendingFor,
  queueMeta,
  queueSignature,
  readCachedTalk,
  syncOutbox,
  type SyncOutcome,
} from "@/lib/offline";
import { SignaturePad, pathLength, type CapturedSignature } from "./SignaturePad";

/**
 * The crew flow — the product. Four screens, linear, no nav, glove-sized targets.
 *
 * The rule that makes it work on a jobsite: **every signature is written to the
 * local outbox first**, whether or not there is signal, and only leaves the phone
 * when the server acknowledges it. There is no separate online path to break.
 *
 * The animation budget for the whole app is spent here, once: the strokes replay,
 * a mono timestamp stamps in beneath the baseline, the roster row flips to its
 * green check, and the header counter ticks. When the last person signs, the talk
 * card's border sweeps once. Nothing else moves.
 */

export interface CrewFlowProps {
  token: string;
  instanceId: string;
  crewName: string;
  siteLabel: string | null;
  companyName: string;
  scheduledFor: string;
  talk: { title: string; body: string; hazardTags: string[]; estMinutes: number };
  roster: { id: string; name: string; jobTitle: string | null }[];
  alreadySigned: { employeeId: string; signedAt: string }[];
  hasPhoto: boolean;
  completed: boolean;
}

type Screen = "talk" | "roster" | "sign" | "done";

interface LocalSignature {
  employeeId: string;
  signedAt: string;
  path: string;
  width: number;
  height: number;
}

export function CrewFlow(props: CrewFlowProps) {
  const [screen, setScreen] = useState<Screen>(props.completed ? "done" : "talk");
  const [signing, setSigning] = useState<string | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.alreadySigned.map((s) => [s.employeeId, s.signedAt])),
  );
  const [justSigned, setJustSigned] = useState<LocalSignature | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [sync, setSync] = useState<SyncOutcome | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [photoQueued, setPhotoQueued] = useState(props.hasPhoto);
  const [absent, setAbsent] = useState<string[]>([]);
  const photoInput = useRef<HTMLInputElement | null>(null);

  const roster = props.roster;
  const signedCount = Object.keys(signed).length;
  const allSigned = signedCount >= roster.length && roster.length > 0;

  /* ---- cache the talk for airplane mode, and note the connection state ---- */
  useEffect(() => {
    cacheTalk({
      instanceId: props.instanceId,
      title: props.talk.title,
      hazardTags: props.talk.hazardTags,
      estMinutes: props.talk.estMinutes,
      body: props.talk.body,
      crewName: props.crewName,
      siteLabel: props.siteLabel,
      scheduledFor: props.scheduledFor,
      roster,
      alreadySigned: props.alreadySigned,
    });
    // If the page was served from the service worker cache with nothing fresh,
    // the cached roster is what the huddle runs on.
    void readCachedTalk(props.instanceId);
  }, [props, roster]);

  const router = useRouter();

  /**
   * Adopt whatever this phone already has in its outbox.
   *
   * Without this, a reload mid-huddle — or a page served from the service-worker
   * cache — shows a person who signed offline as still waiting, and "finish with
   * absentees noted" then marks them absent beside their own signature. The
   * device's outbox is as much a record of the huddle as the server is.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const queued = await pendingFor(props.instanceId);
      if (cancelled || queued.length === 0) return;
      setSigned((prev) => {
        const next = { ...prev };
        for (const entry of queued) next[entry.employeeId] ??= entry.signedAt;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [props.instanceId]);

  const refreshPending = useCallback(async () => {
    setPending((await pendingFor(props.instanceId)).length);
  }, [props.instanceId]);

  const drain = useCallback(async () => {
    const outcome = await syncOutbox(props.instanceId, props.token);
    if (outcome.attempted) setSync(outcome);
    await refreshPending();
    // Signatures that just landed change what the server would render, and the
    // office is watching this instance live.
    if (outcome.stored > 0) router.refresh();
    return outcome;
  }, [props.instanceId, props.token, refreshPending, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPending();
    void drain();

    const goOnline = () => {
      setOnline(true);
      void drain();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Pull-to-refresh is not available inside a page, so retry on a slow tick as
    // well: a truck driving back into coverage should not need a tap.
    const timer = window.setInterval(() => {
      if (navigator.onLine) void drain();
    }, 20_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [drain, refreshPending]);

  /* ---- the signature ---- */
  const capture = useCallback(
    async (employeeId: string, sig: CapturedSignature) => {
      const signedAt = new Date().toISOString();
      const wasOffline = !navigator.onLine;
      await queueSignature({
        instanceId: props.instanceId,
        token: props.token,
        employeeId,
        employeeName: roster.find((r) => r.id === employeeId)?.name ?? "",
        signaturePath: sig.path,
        signatureWidth: sig.width,
        signatureHeight: sig.height,
        signedAt,
        capturedOffline: wasOffline,
      });
      setSigned((prev) => ({ ...prev, [employeeId]: signedAt }));
      setJustSigned({ employeeId, signedAt, path: sig.path, width: sig.width, height: sig.height });
      setSigning(null);
      await refreshPending();
      void drain();
    },
    [drain, props.instanceId, props.token, refreshPending, roster],
  );

  /* ---- huddle photo and GPS ---- */
  const onPhoto = useCallback(
    async (file: File) => {
      const base64 = await fileToBase64(file);
      const contentType = (file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
          ? "image/webp"
          : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
      await queueMeta({
        instanceId: props.instanceId,
        token: props.token,
        photoBase64: base64,
        photoContentType: contentType,
        ...(gps ? { gps } : {}),
      });
      setPhotoQueued(true);
      void drain();
    },
    [drain, gps, props.instanceId, props.token],
  );

  const askGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState("denied");
      return;
    }
    setGpsState("asking");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps(next);
        setGpsState("granted");
        await queueMeta({ instanceId: props.instanceId, token: props.token, gps: next });
        void drain();
      },
      () => setGpsState("denied"),
      { timeout: 8_000, maximumAge: 60_000 },
    );
  }, [drain, props.instanceId, props.token]);

  const closeOut = useCallback(async () => {
    const missing = roster.filter((r) => !signed[r.id]).map((r) => r.id);
    setAbsent(missing);
    await queueMeta({
      instanceId: props.instanceId,
      token: props.token,
      absentEmployeeIds: missing,
      closeOut: true,
      ...(gps ? { gps } : {}),
    });
    setScreen("done");
    void drain();
  }, [drain, gps, props.instanceId, props.token, roster, signed]);

  const nextUnsigned = useMemo(
    () => roster.find((r) => !signed[r.id])?.id ?? null,
    [roster, signed],
  );

  /* ---- screens ---- */

  return (
    <div className="min-h-dvh">
      <ConnectionBanner online={online} pending={pending} sync={sync} />

      <main className="screen-plain mx-auto max-w-[560px] pb-40">
        <header className="pt-6">
          <p className="t-label">
            {props.crewName}
            {props.siteLabel ? ` · ${props.siteLabel}` : ""}
          </p>
          <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
            {props.scheduledFor} · {props.companyName}
          </p>
        </header>

        {screen === "talk" ? (
          <TalkScreen
            talk={props.talk}
            allSigned={allSigned}
            signedCount={signedCount}
            rosterCount={roster.length}
            photoQueued={photoQueued}
            gpsState={gpsState}
            onPhoto={onPhoto}
            photoInput={photoInput}
            askGps={askGps}
            onStart={() => setScreen("roster")}
          />
        ) : null}

        {screen === "roster" ? (
          <RosterScreen
            roster={roster}
            signed={signed}
            justSigned={justSigned}
            onPick={(id) => {
              setSigning(id);
              setScreen("sign");
            }}
            onDone={() => (allSigned ? setScreen("done") : closeOut())}
            allSigned={allSigned}
          />
        ) : null}

        {screen === "sign" && signing ? (
          <SignScreen
            person={roster.find((r) => r.id === signing)!}
            index={roster.findIndex((r) => r.id === signing) + 1}
            total={roster.length}
            onCapture={async (sig) => {
              await capture(signing, sig);
              setScreen("roster");
            }}
            onCancel={() => {
              setSigning(null);
              setScreen("roster");
            }}
          />
        ) : null}

        {screen === "done" ? (
          <DoneScreen
            signedCount={signedCount}
            rosterCount={roster.length}
            absentCount={absent.length}
            pending={pending}
            online={online}
            sync={sync}
            lastSignedAt={latest(signed)}
            onBack={() => setScreen("roster")}
            onRetry={() => void drain()}
          />
        ) : null}
      </main>

      {screen === "talk" ? (
        <div className="thumb-cta thumb-cta-crew">
          <button
            type="button"
            className="btn btn-primary btn-crew btn-full"
            onClick={() => setScreen(allSigned ? "done" : "roster")}
          >
            <IconPenLine size={20} />
            {allSigned ? "See the sign-off" : nextUnsigned ? "Start sign-off" : "Start sign-off"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces --- */

function ConnectionBanner({
  online,
  pending,
  sync,
}: {
  online: boolean;
  pending: number;
  sync: SyncOutcome | null;
}) {
  // Offline is a normal state here. Never a modal, never red.
  if (!online) {
    return (
      <div className="offline-banner" role="status">
        <IconCloudOff size={20} style={{ flex: "none" }} />
        <span>
          Working offline — {pending} sign-off{pending === 1 ? "" : "s"} will sync when you get
          coverage. Keep going.
        </span>
      </div>
    );
  }
  if (pending > 0) {
    return (
      <div className="offline-banner" role="status">
        <IconCloudUp size={20} style={{ flex: "none" }} />
        <span>
          Syncing {pending} sign-off{pending === 1 ? "" : "s"}…
        </span>
      </div>
    );
  }
  if (sync?.error) {
    return (
      <div className="offline-banner" role="status">
        <IconCloudOff size={20} style={{ flex: "none", color: "var(--color-orange)" }} />
        <span>{sync.error} Signatures are saved on this phone and will retry.</span>
      </div>
    );
  }
  return null;
}

function TalkScreen({
  talk,
  allSigned,
  signedCount,
  rosterCount,
  photoQueued,
  gpsState,
  onPhoto,
  photoInput,
  askGps,
  onStart,
}: {
  talk: CrewFlowProps["talk"];
  allSigned: boolean;
  signedCount: number;
  rosterCount: number;
  photoQueued: boolean;
  gpsState: "idle" | "asking" | "granted" | "denied";
  onPhoto: (file: File) => void;
  photoInput: React.RefObject<HTMLInputElement | null>;
  askGps: () => void;
  onStart: () => void;
}) {
  return (
    <>
      <article className={`talk-card relative mt-5 ${allSigned ? "talk-card-done" : ""}`}>
        {allSigned ? <span className="sweep" aria-hidden /> : null}
        <p className="t-label" style={{ color: "var(--color-hardhat)" }}>
          {talk.hazardTags.join(" · ").toUpperCase()} · {talk.estMinutes} MIN
        </p>
        <h1 className="t-h2 mt-2">{talk.title}</h1>
        <TalkBody body={talk.body} />
      </article>

      <p className="t-data mt-5" style={{ color: allSigned ? "var(--color-green)" : "var(--color-fg-3)" }}>
        {signedCount} OF {rosterCount} SIGNED
      </p>

      <section className="mt-6 rule-t pt-5">
        <p className="t-label">Optional, before you pass the phone round</p>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPhoto(file);
          }}
        />
        <button
          type="button"
          className="row row-crew"
          onClick={() => photoInput.current?.click()}
        >
          <IconCamera size={24} style={{ color: photoQueued ? "var(--color-green)" : "var(--color-fg-3)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">
              {photoQueued ? "Huddle photo taken" : "Take a photo of the huddle"}
            </span>
            <span className="t-secondary block">
              {photoQueued
                ? "Stored with this talk. It syncs with the signatures."
                : "One frame of the crew standing there. Inspectors ask."}
            </span>
          </span>
          {photoQueued ? <IconCheck size={20} style={{ color: "var(--color-green)" }} /> : null}
        </button>
        <button type="button" className="row row-crew" onClick={askGps}>
          <IconMapPin
            size={24}
            style={{ color: gpsState === "granted" ? "var(--color-green)" : "var(--color-fg-3)" }}
          />
          <span className="min-w-0 flex-1">
            <span className="t-title block">
              {gpsState === "granted"
                ? "Location stamped"
                : gpsState === "denied"
                  ? "Location not shared"
                  : gpsState === "asking"
                    ? "Asking for location…"
                    : "Stamp the location"}
            </span>
            <span className="t-secondary block">
              {gpsState === "denied"
                ? "That is fine — the talk records without it."
                : "Proves the talk happened at the site, not in the truck park."}
            </span>
          </span>
          {gpsState === "granted" ? <IconCheck size={20} style={{ color: "var(--color-green)" }} /> : null}
        </button>
      </section>

      <button type="button" className="btn-quiet mt-6" onClick={onStart}>
        Skip to the sign-off
      </button>
    </>
  );
}

function RosterScreen({
  roster,
  signed,
  justSigned,
  onPick,
  onDone,
  allSigned,
}: {
  roster: CrewFlowProps["roster"];
  signed: Record<string, string>;
  justSigned: LocalSignature | null;
  onPick: (id: string) => void;
  onDone: () => void;
  allSigned: boolean;
}) {
  return (
    <>
      <h1 className="t-h2 mt-6">Tap your name, then sign.</h1>
      <p className="t-data mt-2" style={{ color: allSigned ? "var(--color-green)" : "var(--color-hardhat)" }}>
        {Object.keys(signed).length} OF {roster.length} SIGNED
      </p>

      <section className="mt-5">
        {roster.map((person) => {
          const at = signed[person.id];
          const isJust = justSigned?.employeeId === person.id;
          return (
            <button
              key={person.id}
              type="button"
              className="row row-crew"
              onClick={() => !at && onPick(person.id)}
              disabled={Boolean(at)}
              style={{ opacity: at ? 0.9 : 1 }}
            >
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate" style={{ fontSize: 17 }}>
                  {person.name}
                </span>
                {person.jobTitle ? (
                  <span className="t-secondary block truncate">{person.jobTitle}</span>
                ) : null}
              </span>
              {at ? (
                <span
                  className={`flex shrink-0 items-center gap-2 ${isJust ? "stamp" : ""}`}
                  style={{ color: "var(--color-green)" }}
                >
                  <IconCheck size={20} />
                  <span className="t-data">{at.slice(11, 16)}</span>
                </span>
              ) : (
                <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                  waiting
                </span>
              )}
            </button>
          );
        })}
      </section>

      <div className="thumb-cta thumb-cta-crew">
        <button type="button" className="btn btn-primary btn-crew btn-full" onClick={onDone}>
          {allSigned ? "Finish" : "Finish with absentees noted"}
        </button>
      </div>
    </>
  );
}

function SignScreen({
  person,
  index,
  total,
  onCapture,
  onCancel,
}: {
  person: CrewFlowProps["roster"][number];
  index: number;
  total: number;
  onCapture: (sig: CapturedSignature) => void;
  onCancel: () => void;
}) {
  const [replay, setReplay] = useState<CapturedSignature | null>(null);

  return (
    <div className="mt-6">
      <p className="t-label">
        {index} / {total} on the roster
      </p>
      <h1 className="t-h2 mt-1">{person.name}</h1>
      <p className="t-secondary mt-2">
        Sign on the yellow line. Your signature and the time are the record that you were at
        this talk.
      </p>

      <div className="mt-5">
        {replay ? (
          <div className="sigpad">
            <svg viewBox={`0 0 ${replay.width} ${replay.height}`} aria-label="Your signature">
              <path
                d={replay.path}
                fill="none"
                stroke="var(--color-fg)"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-replay"
                style={{ ["--len" as string]: pathLength(replay.path) }}
              />
            </svg>
            <span className="sigpad-baseline" aria-hidden />
            <span className="sigpad-name t-label stamp" style={{ color: "var(--color-green)" }}>
              {new Date().toTimeString().slice(0, 5)} · SIGNED
            </span>
          </div>
        ) : (
          <SignaturePad
            name={person.name}
            onCancel={onCancel}
            onCapture={(sig) => {
              setReplay(sig);
              // The replay is the whole brand animation; it runs once and then
              // the queue advances. 480ms is the draw plus the stamp settle.
              window.setTimeout(() => onCapture(sig), 480);
            }}
          />
        )}
      </div>
    </div>
  );
}

function DoneScreen({
  signedCount,
  rosterCount,
  absentCount,
  pending,
  online,
  sync,
  lastSignedAt,
  onBack,
  onRetry,
}: {
  signedCount: number;
  rosterCount: number;
  absentCount: number;
  pending: number;
  online: boolean;
  sync: SyncOutcome | null;
  lastSignedAt: string | null;
  onBack: () => void;
  onRetry: () => void;
}) {
  const complete = signedCount >= rosterCount && rosterCount > 0;
  return (
    <div className="mt-8">
      <p className="t-stat" style={{ color: complete ? "var(--color-green)" : "var(--color-paper)" }}>
        {signedCount} of {rosterCount} signed
      </p>
      {lastSignedAt ? (
        <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
          LAST SIGNATURE {lastSignedAt.slice(11, 16)}
        </p>
      ) : null}
      <p className="t-body mt-4" style={{ color: "var(--color-fg-2)" }}>
        {complete
          ? "That is the whole crew. The record is on file with each person's signature and time."
          : absentCount > 0
            ? `Closed out with ${absentCount} noted absent. They can sign the next one — the record shows honestly who was there.`
            : "You can still hand the phone around; nothing is locked."}
      </p>

      <div className="mt-6 rule-t pt-5">
        <p className="t-label">Sync</p>
        <p className="t-secondary mt-2 flex items-center gap-2">
          {pending === 0 ? (
            <>
              <IconCheck size={20} style={{ color: "var(--color-green)", flex: "none" }} />
              Everything on this phone has reached the office.
            </>
          ) : online ? (
            <>
              <IconCloudUp size={20} style={{ flex: "none" }} />
              {pending} sign-off{pending === 1 ? "" : "s"} still going up.
            </>
          ) : (
            <>
              <IconCloudOff size={20} style={{ flex: "none" }} />
              {pending} sign-off{pending === 1 ? "" : "s"} saved on this phone. They go up on
              their own when you have signal — you can close this page.
            </>
          )}
        </p>
        {sync?.rejected ? (
          <p className="t-secondary mt-2" style={{ color: "var(--color-orange)" }}>
            {sync.rejected} signature{sync.rejected === 1 ? "" : "s"} could not be filed — the
            office needs to check the roster. Nothing was thrown away.
          </p>
        ) : null}
        {pending > 0 ? (
          <button type="button" className="btn-quiet mt-3" onClick={onRetry}>
            Try syncing now
          </button>
        ) : null}
      </div>

      <button type="button" className="btn btn-secondary btn-crew btn-full mt-8" onClick={onBack}>
        Back to the crew list
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ utils --- */

function latest(signed: Record<string, string>): string | null {
  const values = Object.values(signed).sort();
  return values.length ? values[values.length - 1] : null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that photo"));
    reader.readAsDataURL(file);
  });
}
