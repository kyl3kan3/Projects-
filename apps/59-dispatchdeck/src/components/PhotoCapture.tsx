"use client";

/**
 * Camera → storage → document row, in one control.
 *
 * `capture="environment"` opens the rear camera straight from the cab. The three
 * steps are presign, PUT, complete, and each failure is reported in a sentence
 * rather than a status code — a driver on one bar of signal needs to know
 * whether to try again or whether it landed.
 *
 * The file never passes through a server action: a 9MB photo would blow the body
 * limit. It goes to storage directly against a presigned URL.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon } from "@/components/icons";

type Phase = "idle" | "signing" | "uploading" | "filing" | "done";

export function PhotoCapture({
  loadId,
  kind,
  label,
  accept = "image/jpeg,image/png",
  capture = true,
  className = "btn btn-primary btn-cab",
  onUploaded,
}: {
  loadId: string | null;
  kind: "pod_photo" | "bol" | "rate_con" | "fuel_receipt" | "other";
  label: string;
  accept?: string;
  capture?: boolean;
  className?: string;
  onUploaded?: (documentId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setNote(null);
    try {
      setPhase("signing");
      const signResponse = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          loadId,
          filename: file.name || "capture.jpg",
          contentType: file.type || "image/jpeg",
          sizeBytes: file.size,
        }),
      });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.error ?? "Could not start the upload.");

      setPhase("uploading");
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: signed.headers,
        body: file,
      });
      if (!put.ok) {
        throw new Error(
          `The upload itself failed (${put.status}). Nothing was filed — try again when you have signal.`,
        );
      }

      setPhase("filing");
      const completeResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: signed.key,
          kind,
          loadId,
          filename: signed.filename ?? file.name,
          contentType: file.type || "image/jpeg",
        }),
      });
      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.error ?? "Could not file the document.");

      setPhase("done");
      if (completed.parseError) {
        setNote(
          `Filed, but the parse could not be queued (${completed.parseError}). Open it in Rate cons and retry.`,
        );
      }
      onUploaded?.(completed.documentId);
      router.refresh();
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  const busy = phase === "signing" || phase === "uploading" || phase === "filing";
  const busyLabel =
    phase === "signing" ? "Preparing…" : phase === "uploading" ? "Uploading…" : "Filing…";

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={accept}
        {...(capture ? { capture: "environment" as const } : {})}
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <CameraIcon size={20} />
        {busy ? busyLabel : phase === "done" ? "Filed — take another" : label}
      </button>
      {error ? (
        <p className="t-secondary mt-2" style={{ color: "var(--bad)" }} role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="t-secondary mt-2" style={{ color: "var(--accent)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
