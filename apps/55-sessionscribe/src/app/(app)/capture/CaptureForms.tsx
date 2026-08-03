"use client";

/**
 * Capture: three full-width rows (Record · Upload · Shorthand), a client picker
 * with the consent state shown inline, and a per-session template override.
 *
 * The consent rule is visible before it is enforced: with no consent on file the
 * Record and Upload rows are disabled and say why, the consent script is one tap
 * away, and Shorthand stays exactly as available as it always was. The server
 * enforces the same rule (`lib/sessions.captureSession`) — this is the courtesy,
 * not the control.
 *
 * Recording uses MediaRecorder with a quiet 3px level bar and a mono elapsed
 * timer; "End session" sits in the thumb zone. There is no visualiser light show.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { captureShorthandAction, type CaptureState } from "./actions";
import {
  IconMicQuiet,
  IconPencilLine,
  IconUpload,
  IconChevronRight,
} from "@/components/icons";

export interface CaptureClient {
  id: string;
  displayLabel: string;
  modality: string;
  consent: "none" | "verbal" | "written";
  defaultTemplateId: string | null;
}

export interface CaptureTemplate {
  id: string;
  name: string;
  format: string;
  modality: string;
  allowed: boolean;
}

type Mode = "record" | "upload" | "shorthand" | null;

const initial: CaptureState = {};

export function CaptureForms({
  clients,
  templates,
  retentionDays,
  consentScript,
  captureBlocked,
}: {
  clients: CaptureClient[];
  templates: CaptureTemplate[];
  retentionDays: number;
  consentScript: string;
  captureBlocked: string | null;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const [showScript, setShowScript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shorthandState, shorthandAction, shorthandPending] = useActionState(
    captureShorthandAction,
    initial,
  );

  const client = clients.find((c) => c.id === clientId) ?? null;
  const consentMissing = client?.consent === "none";

  /* -------------------------------------------------------- recording state */
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void audioCtxRef.current?.close();
    },
    [],
  );

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(Math.min(1, peak * 1.6));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setError(
        "This browser would not give access to the microphone. Check the site's microphone permission, or write shorthand instead.",
      );
    }
  }

  async function endRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setBusy(true);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await stopped;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    void audioCtxRef.current?.close();
    setRecording(false);

    const blob = new Blob(chunksRef.current, {
      type: recorder.mimeType || "audio/webm",
    });
    await submitAudio(blob, "recording", Math.max(1, elapsed));
  }

  async function submitAudio(
    blob: Blob,
    kind: "recording" | "upload",
    durationSeconds: number | null,
  ) {
    setBusy(true);
    setError(null);
    try {
      const created = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          captureKind: kind,
          templateId: templateId || null,
          mime: blob.type || "audio/webm",
          durationSeconds,
        }),
      });
      const payload = (await created.json()) as {
        sessionId?: string;
        noteId?: string;
        upload?: { mode: "inline" | "put"; url: string } | null;
        error?: string;
      };
      if (!created.ok || !payload.sessionId || !payload.noteId) {
        setError(payload.error ?? "Could not start that capture.");
        setBusy(false);
        return;
      }

      if (payload.upload) {
        const put = await fetch(payload.upload.url, {
          method: "PUT",
          headers: {
            "content-type": blob.type || "audio/webm",
            ...(durationSeconds
              ? { "x-duration-seconds": String(durationSeconds) }
              : {}),
          },
          body: blob,
        });
        if (!put.ok) {
          setError(
            "The audio did not finish uploading. The session is saved — retry it from Today, or write shorthand instead.",
          );
          setBusy(false);
          return;
        }
        await fetch(`/api/sessions/${payload.sessionId}/audio`, { method: "POST" });
      }

      router.push(`/notes/${payload.noteId}`);
    } catch {
      setError("Something interrupted the upload. Try again.");
      setBusy(false);
    }
  }

  if (clients.length === 0) {
    return (
      <div className="panel p-4">
        <p className="t-title mb-1">Add a client label first</p>
        <p className="t-secondary mb-3">
          A label is initials or a slot — &ldquo;J.R.&rdquo;, &ldquo;Weds 4pm
          couple&rdquo;. SessionScribe never asks for a name.
        </p>
        <Link className="btn btn-primary" href="/clients">
          Add a client
        </Link>
      </div>
    );
  }

  return (
    <div>
      <label className="field">
        <span className="field-label">Client</span>
        <select
          className="input"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setTemplateId("");
            setMode(null);
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayLabel} — {c.modality}
            </option>
          ))}
        </select>
      </label>

      {client && (
        <p
          className="t-secondary mb-4"
          style={{ color: consentMissing ? "var(--color-red)" : "var(--color-ink-2)" }}
        >
          {consentMissing ? (
            <>
              NO RECORDING CONSENT ON FILE — shorthand always works.{" "}
              <button
                type="button"
                className="btn-quiet btn-quiet-sm"
                onClick={() => setShowScript((s) => !s)}
              >
                {showScript ? "Hide script" : "Consent script"}
              </button>
            </>
          ) : (
            <>
              {client.consent === "written" ? "Written" : "Verbal"} recording consent on
              file · audio purges after {retentionDays} days
            </>
          )}
        </p>
      )}

      {showScript && (
        <div className="panel mb-4 p-4">
          <p className="t-label mb-2">Say this, then note the consent on the client</p>
          <p className="t-body">{consentScript}</p>
          <p className="mt-3">
            <Link className="btn-quiet btn-quiet-sm" href={`/clients/${clientId}`}>
              Note consent for {client?.displayLabel}
            </Link>
          </p>
        </div>
      )}

      <label className="field">
        <span className="field-label">Template for this session</span>
        <select
          className="input"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">
            {client?.defaultTemplateId
              ? "Client default"
              : "Match the client's modality and your format"}
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.allowed}>
              {t.name}
              {t.allowed ? "" : " — Caseload plan"}
            </option>
          ))}
        </select>
        <span className="field-help">
          A per-session override. It does not change the client&rsquo;s default.
        </span>
      </label>

      {captureBlocked && (
        <p className="field-error mb-4" role="alert">
          {captureBlocked}
        </p>
      )}
      {error && (
        <p className="field-error mb-4" role="alert">
          {error}
        </p>
      )}
      {shorthandState.error && (
        <p className="field-error mb-4" role="alert">
          {shorthandState.error}
        </p>
      )}

      {/* ---- recording screen takes over when live ---- */}
      {recording ? (
        <div className="panel p-4">
          <p className="t-label mb-2">Recording</p>
          <p className="t-clock mb-3">{mmss(elapsed)}</p>
          <div className="level-bar mb-4" aria-hidden="true">
            <span style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <p className="t-secondary">
            Keep this tab open. Audio is uploaded when you end the session and purges
            after {retentionDays} days.
          </p>
          <div className="sticky-action">
            <button
              className="btn btn-primary btn-full"
              type="button"
              onClick={endRecording}
              disabled={busy}
            >
              {busy ? "Uploading…" : "End session"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <ModeRow
            icon={<IconMicQuiet size={18} />}
            title="Record in the browser"
            body={
              consentMissing
                ? "Blocked: no recording consent on file for this client."
                : "For the room or a telehealth tab. Ends with an upload."
            }
            disabled={Boolean(consentMissing || captureBlocked || busy)}
            onClick={() => {
              setMode("record");
              void startRecording();
            }}
          />
          <UploadRow
            disabled={Boolean(consentMissing || captureBlocked || busy)}
            consentMissing={Boolean(consentMissing)}
            onFile={(file) => submitAudio(file, "upload", null)}
          />
          <ModeRow
            icon={<IconPencilLine size={18} />}
            title="Type shorthand"
            body="No recording, no consent needed. A first-class path, not a fallback."
            disabled={Boolean(captureBlocked || busy)}
            onClick={() => setMode(mode === "shorthand" ? null : "shorthand")}
          />
        </div>
      )}

      {mode === "shorthand" && !recording && (
        <form action={shorthandAction} className="mt-5">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="templateId" value={templateId} />
          <label className="field">
            <span className="field-label">Shorthand</span>
            <textarea
              className="input"
              name="shorthandText"
              rows={6}
              required
              placeholder="worked on exposure hierarchy step 3, client reported 4/10 anxiety at rest and 7/10 in the car park, HW: step 4 twice with thought record"
            />
            <span className="field-help">
              Your words. The draft expands them into your template and invents nothing.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Length in minutes (optional)</span>
            <input
              className="input input-mono"
              name="durationMinutes"
              inputMode="numeric"
              placeholder="50"
            />
          </label>
          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={shorthandPending}
          >
            {shorthandPending ? "Drafting…" : "Draft this note"}
          </button>
        </form>
      )}
    </div>
  );
}

function ModeRow({
  icon,
  title,
  body,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="row" type="button" onClick={onClick} disabled={disabled}>
      <span style={{ color: disabled ? "var(--color-ink-3)" : "var(--color-sage-text)" }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-title block">{title}</span>
        <span className="t-secondary block">{body}</span>
      </span>
      <span style={{ color: "var(--color-ink-3)" }}>
        <IconChevronRight size={18} />
      </span>
    </button>
  );
}

function UploadRow({
  disabled,
  consentMissing,
  onFile,
}: {
  disabled: boolean;
  consentMissing: boolean;
  onFile: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <ModeRow
        icon={<IconUpload size={18} />}
        title="Upload an audio file"
        body={
          consentMissing
            ? "Blocked: no recording consent on file for this client."
            : "m4a, mp3, wav or webm from your recorder or telehealth platform."
        }
        disabled={disabled}
        onClick={() => ref.current?.click()}
      />
      <input
        ref={ref}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
