"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconMic,
  IconPause,
  IconRefresh,
} from "@/components/icons";
import { elapsed } from "@/lib/display";

/**
 * The capture screen: record, pause, snap, end.
 *
 * Everything here is built for one hand in a glove on bad signal:
 *
 *  - **Audio is chunked.** MediaRecorder is asked for a blob every 20 seconds and
 *    each chunk uploads on its own. A dropout costs one chunk's retry, not the
 *    walkthrough — and a pause boundary simply ends a chunk.
 *  - **Every asset carries its own state.** Pending, retrying (amber), landed
 *    (check). Nothing is assumed to have arrived; the server confirms against the
 *    object store.
 *  - **Retries are queued, not lost.** A failed upload goes back into the queue with
 *    backoff, and the "End walkthrough" button says how many assets are still in
 *    flight rather than blocking.
 *  - **No microphone is not a dead end.** If permission is refused or the device has
 *    no recorder, photos and typed notes still produce a draft, and the screen says
 *    so instead of showing a broken button.
 */

const CHUNK_MS = 20_000;
const MAX_ATTEMPTS = 4;

type AssetState = "uploading" | "retrying" | "landed" | "failed";

interface Asset {
  localId: string;
  kind: "audio" | "photo";
  sequence: number;
  state: AssetState;
  attempts: number;
  mediaId?: string;
  previewUrl?: string;
  caption?: string;
  sizeBytes: number;
}

interface UploadTask {
  localId: string;
  kind: "audio" | "photo";
  sequence: number;
  blob: Blob;
  contentType: string;
}

type Phase = "idle" | "recording" | "paused" | "processing" | "failed";

export function CaptureClient({
  jobId,
  walkthroughId,
  address,
  jobTitle,
  quotaLine,
  transcriptionNote,
}: {
  jobId: string;
  walkthroughId: string;
  address: string;
  jobTitle: string;
  quotaLine: string;
  transcriptionNote: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [holding, setHolding] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSequence = useRef(0);
  const photoSequence = useRef(0);
  const queue = useRef<UploadTask[]>([]);
  const draining = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterFrame = useRef<number | null>(null);

  /* ------------------------------------------------------------ uploading --- */

  const setAssetState = useCallback((localId: string, patch: Partial<Asset>) => {
    setAssets((current) =>
      current.map((asset) => (asset.localId === localId ? { ...asset, ...patch } : asset)),
    );
  }, []);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length) {
        const task = queue.current[0];
        try {
          const presign = await fetch("/api/uploads/presign", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              walkthroughId,
              kind: task.kind,
              sequence: task.sequence,
              contentType: task.contentType,
              sizeBytes: task.blob.size,
            }),
          });
          if (!presign.ok) throw new Error((await presign.json().catch(() => ({}))).error ?? "presign failed");
          const grant = (await presign.json()) as {
            mediaId: string;
            uploadUrl: string;
            headers: Record<string, string>;
          };

          const put = await fetch(grant.uploadUrl, {
            method: "PUT",
            headers: grant.headers,
            body: task.blob,
          });
          if (!put.ok) throw new Error(`upload failed (${put.status})`);

          const confirm = await fetch("/api/uploads/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mediaId: grant.mediaId }),
          });
          if (!confirm.ok) throw new Error("the object never landed");

          setAssetState(task.localId, {
            state: "landed",
            mediaId: grant.mediaId,
            sizeBytes: task.blob.size,
          });
          queue.current.shift();
        } catch (err) {
          const asset = assets.find((candidate) => candidate.localId === task.localId);
          const attempts = (asset?.attempts ?? 0) + 1;
          if (attempts >= MAX_ATTEMPTS) {
            setAssetState(task.localId, { state: "failed", attempts });
            queue.current.shift();
            setError(
              `One ${task.kind === "audio" ? "audio chunk" : "photo"} would not upload after ${MAX_ATTEMPTS} tries. The rest of the walkthrough is fine — ${err instanceof Error ? err.message : "unknown error"}.`,
            );
          } else {
            setAssetState(task.localId, { state: "retrying", attempts });
            // Back off, then try the same asset again — never skip ahead, so
            // audio chunks stay in order.
            await new Promise((resolve) => setTimeout(resolve, 800 * attempts));
          }
        }
      }
    } finally {
      draining.current = false;
    }
  }, [assets, setAssetState, walkthroughId]);

  const enqueue = useCallback(
    (task: UploadTask, preview?: string) => {
      setAssets((current) => [
        ...current,
        {
          localId: task.localId,
          kind: task.kind,
          sequence: task.sequence,
          state: "uploading",
          attempts: 0,
          previewUrl: preview,
          sizeBytes: task.blob.size,
        },
      ]);
      queue.current.push(task);
      void drain();
    },
    [drain],
  );

  /* ------------------------------------------------------------ recording --- */

  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const read = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const sample of data) peak = Math.max(peak, Math.abs(sample - 128) / 128);
      setLevel(Math.min(1, peak * 1.8));
      meterFrame.current = requestAnimationFrame(read);
    };
    read();
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    if (recorderRef.current) {
      // Resume from pause.
      recorderRef.current.resume();
      setPhase("recording");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const context = new AudioContextCtor();
        audioContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        startMeter();
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size < 512) return;
        const sequence = audioSequence.current++;
        enqueue({
          localId: `audio-${sequence}`,
          kind: "audio",
          sequence,
          blob: event.data,
          contentType: event.data.type || mimeType || "audio/webm",
        });
      };
      recorder.start(CHUNK_MS);
      recorderRef.current = recorder;
      setPhase("recording");
    } catch {
      setMicBlocked(true);
      setError(
        "No microphone access on this device, so there is no narration to transcribe. Photos with captions and typed notes still produce a draft.",
      );
    }
  }, [enqueue, startMeter]);

  const pauseRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      // requestData flushes the current chunk so a pause boundary never loses
      // the last few seconds of narration.
      recorder.requestData();
      recorder.pause();
      setPhase("paused");
    }
  }, []);

  const stopEverything = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.requestData();
      recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (meterFrame.current) cancelAnimationFrame(meterFrame.current);
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }, []);

  /* -------------------------------------------------------------- photos --- */

  const onPhoto = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const sequence = photoSequence.current++;
      enqueue(
        {
          localId: `photo-${sequence}`,
          kind: "photo",
          sequence,
          blob: file,
          contentType: file.type || "image/jpeg",
        },
        URL.createObjectURL(file),
      );
    },
    [enqueue],
  );

  const setCaption = useCallback(
    async (asset: Asset, caption: string) => {
      setAssetState(asset.localId, { caption });
      if (!asset.mediaId) return;
      await fetch("/api/uploads/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: asset.mediaId, caption }),
      });
    },
    [setAssetState],
  );

  /* ----------------------------------------------------------------- end --- */

  const endWalkthrough = useCallback(async () => {
    stopEverything();
    setPhase("processing");
    setPipeline("Uploading what is left…");
    // Give any in-flight chunk a moment to be handed to the queue, then drain it.
    await new Promise((resolve) => setTimeout(resolve, 350));
    await drain();

    setPipeline("Transcribing the walkthrough…");
    const response = await fetch(`/api/walkthroughs/${walkthroughId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ durationSeconds: seconds, notes }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      estimateId?: string;
      error?: string;
      code?: string;
    };
    if (!response.ok || !payload.estimateId) {
      setPhase("failed");
      setPipeline(null);
      setError(payload.error ?? "The draft could not be produced.");
      return;
    }
    setPipeline("Drafting the estimate…");
    router.push(`/estimates/${payload.estimateId}?reveal=1`);
  }, [drain, notes, router, seconds, stopEverything, walkthroughId]);

  /* -------------------------------------------------------------- timers --- */

  useEffect(() => {
    if (phase !== "recording") {
      if (tickTimer.current) clearInterval(tickTimer.current);
      tickTimer.current = null;
      return;
    }
    tickTimer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => {
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, [phase]);

  useEffect(() => stopEverything, [stopEverything]);

  /* ---------------------------------------------------------------- hold --- */

  const beginHold = useCallback(() => {
    if (phase === "processing") return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      void endWalkthrough();
    }, 600);
  }, [endWalkthrough, phase]);

  const cancelHold = useCallback(
    (tapped: boolean) => {
      const wasHolding = holdTimer.current !== null;
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
      setHolding(false);
      if (!tapped || !wasHolding) return;
      // A tap toggles record/pause; the hold above is what ends the walkthrough.
      if (phase === "recording") pauseRecording();
      else void startRecording();
    },
    [pauseRecording, phase, startRecording],
  );

  const inFlight = assets.filter(
    (asset) => asset.state === "uploading" || asset.state === "retrying",
  ).length;
  const photos = assets.filter((asset) => asset.kind === "photo");
  const audioChunks = assets.filter((asset) => asset.kind === "audio");
  const canEnd = phase !== "processing" && (audioChunks.length > 0 || photos.length > 0 || notes.trim().length > 0);

  return (
    <div>
      <section className="gutter" style={{ paddingBottom: 20 }}>
        <h1 className="t-h2">{address}</h1>
        <p className="t-secondary" style={{ marginTop: 6 }}>
          {jobTitle}
        </p>
        <p className="t-data" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
          {quotaLine}
        </p>
      </section>

      {photos.length ? (
        <section className="scroll-x gutter" style={{ display: "flex", gap: 12, paddingBottom: 20 }}>
          {photos.map((photo) => (
            <figure key={photo.localId} style={{ margin: 0, width: 132, flex: "none" }}>
              <div
                style={{
                  position: "relative",
                  width: 132,
                  height: 132,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid var(--color-hairline)",
                  background: "var(--color-toolbox)",
                }}
              >
                {photo.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.previewUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : null}
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {photo.state === "landed" ? (
                    <IconCheck size={16} style={{ color: "var(--color-hi-vis)" }} />
                  ) : photo.state === "failed" ? (
                    <IconAlert size={16} style={{ color: "var(--color-red)" }} />
                  ) : (
                    <span
                      className="dot"
                      style={{ background: "var(--color-amber)" }}
                      aria-label="uploading"
                    />
                  )}
                </span>
              </div>
              <input
                className="field"
                style={{ marginTop: 8, height: 40, fontSize: 14 }}
                placeholder="Caption this photo"
                aria-label={`Caption for photo ${photo.sequence + 1}`}
                defaultValue={photo.caption ?? ""}
                onBlur={(event) => void setCaption(photo, event.target.value)}
              />
            </figure>
          ))}
        </section>
      ) : null}

      <section className="gutter" style={{ paddingBottom: 20 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Notes (added to the transcript)</span>
          <textarea
            className="field"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Panel is a Federal Pacific, needs a 200A service. Twelve AFCI breakers."
            rows={3}
          />
        </label>
        <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-text-3)" }}>
          {transcriptionNote}
        </p>
      </section>

      {error ? (
        <section className="gutter" style={{ paddingBottom: 16 }}>
          <p
            className="t-secondary"
            role="alert"
            style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
          >
            <IconAlert size={18} style={{ flex: "none" }} />
            <span>{error}</span>
          </p>
          {phase === "failed" ? (
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button className="btn btn-secondary" type="button" onClick={() => void endWalkthrough()}>
                <IconRefresh size={18} />
                Try the draft again
              </button>
              <a className="btn btn-secondary" href={`/jobs/${jobId}`}>
                Back to the job
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-data" style={{ color: "var(--color-text-3)" }}>
          {audioChunks.length
            ? `${audioChunks.filter((chunk) => chunk.state === "landed").length}/${audioChunks.length} audio chunks landed`
            : micBlocked
              ? "No audio this walkthrough"
              : "Nothing recorded yet"}
          {inFlight ? ` · ${inFlight} uploading` : ""}
        </p>
        {pipeline ? (
          <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-hi-vis)" }}>
            {pipeline}
          </p>
        ) : null}
      </section>

      <div
        className="thumb-bar thumb-bar-plain"
        style={{ flexDirection: "column", alignItems: "stretch", gap: 16 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <label className="camera-button" aria-label="Add a photo" style={{ cursor: "pointer" }}>
            <IconCamera size={22} />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhoto}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </label>

          <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
            <button
              type="button"
              className="record-capsule"
              data-recording={phase === "recording"}
              data-paused={phase === "paused"}
              aria-label={
                phase === "recording"
                  ? "Pause recording. Hold to end the walkthrough."
                  : "Start recording. Hold to end the walkthrough."
              }
              disabled={phase === "processing" || micBlocked}
              onPointerDown={beginHold}
              onPointerUp={() => cancelHold(true)}
              onPointerLeave={() => cancelHold(false)}
              onPointerCancel={() => cancelHold(false)}
            >
              <span className="hold-fill" data-holding={holding} />
              {phase === "recording" ? <IconPause size={26} /> : <IconMic size={26} />}
            </button>
            <span className="t-data" style={{ fontSize: 14 }}>
              {elapsed(seconds)}
            </span>
            <div
              aria-hidden="true"
              style={{ width: 96, height: 2, background: "var(--color-hairline)", borderRadius: 2 }}
            >
              <span
                className="level-meter"
                style={{ display: "block", width: `${Math.round(level * 96)}px` }}
              />
            </div>
          </div>

          <span style={{ width: 56 }} />
        </div>

        <button
          className="btn btn-primary btn-full"
          type="button"
          onClick={() => void endWalkthrough()}
          disabled={!canEnd}
        >
          {phase === "processing"
            ? "Drafting…"
            : inFlight
              ? `End walkthrough (${inFlight} uploading)`
              : "End walkthrough"}
        </button>
        <p className="t-secondary" style={{ textAlign: "center", color: "var(--color-text-3)" }}>
          {micBlocked
            ? "Photos and notes are enough to draft from."
            : "Tap the capsule to pause · hold it to end"}
        </p>
      </div>
    </div>
  );
}
