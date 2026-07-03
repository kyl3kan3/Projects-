"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconUpload } from "./icons";

export const OPEN_UPLOAD_EVENT = "clipforge:upload-open";

/** Dispatch from anywhere (tab bar, dashboard) to open the upload sheet. */
export function openUploadSheet() {
  window.dispatchEvent(new Event(OPEN_UPLOAD_EVENT));
}

type Mode = "upload" | "url";

/**
 * Mobile bottom-sheet upload. Two-step direct-to-R2 for files; URL import for
 * YouTube / RSS. Presented as a sheet so it's reachable from the thumb zone.
 */
export function UploadSheet({ overLimit }: { overLimit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("upload");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_UPLOAD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_UPLOAD_EVENT, onOpen);
  }, []);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file first.");
    setError(null);
    setBusy(true);
    try {
      setProgress("Preparing…");
      const init = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title || file.name, contentType: file.type || "video/mp4" }),
      });
      if (init.status === 402) {
        setError("You're out of uploads this period. Upgrade to add more.");
        return;
      }
      if (!init.ok) throw new Error("Could not start upload");
      const { projectId, uploadUrl } = await init.json();

      setProgress("Uploading…");
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "video/mp4" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed");

      setProgress("Queuing…");
      await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      setOpen(false);
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleImport() {
    if (!url) return setError("Paste a link first.");
    setError(null);
    setBusy(true);
    try {
      const sourceType = url.includes("youtu") ? "youtube" : "rss";
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title || url, url, sourceType }),
      });
      if (res.status === 402) {
        setError("You're out of uploads this period. Upgrade to add more.");
        return;
      }
      if (!res.ok) throw new Error("Import failed");
      const { projectId } = await res.json();
      setOpen(false);
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <motion.div
            role="dialog"
            aria-label="New content kit"
            className="card safe-b relative z-10 p-5" style={{ borderRadius: "20px 20px 0 0" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-line)]" />
            <h2 className="t-h2 font-display">New content kit</h2>

            <div className="chip-row mt-4">
              <button className="chip" data-active={mode === "upload"} onClick={() => setMode("upload")}>
                Upload file
              </button>
              <button className="chip" data-active={mode === "url"} onClick={() => setMode("url")}>
                From link
              </button>
            </div>

            <input
              className="input mt-4"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />

            {mode === "upload" ? (
              <>
                <label
                  className="mt-3 flex min-h-[112px] flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--color-line)] p-5 text-center"
                  style={{ background: "color-mix(in srgb, var(--color-ink) 70%, transparent)" }}
                >
                  <span className="text-[var(--color-muted)]"><IconUpload size={24} /></span>
                  <span className="mt-2 text-sm font-medium">{name ?? "Tap to choose a video or podcast"}</span>
                  <span className="mt-1 text-xs text-[var(--color-muted)]">MP4 · MOV · MP3 · WAV — up to 3 hours</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*,audio/*"
                    className="hidden"
                    disabled={busy || overLimit}
                    onChange={(e) => {
                      setError(null);
                      setName(e.target.files?.[0]?.name ?? null);
                    }}
                  />
                </label>
                <button onClick={handleUpload} disabled={busy || overLimit} className="btn btn-primary btn-block mt-4">
                  {busy ? (progress ?? "Working…") : "Create content kit"}
                </button>
              </>
            ) : (
              <>
                <input
                  className="input mt-3"
                  placeholder="YouTube link or podcast RSS enclosure URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={busy || overLimit}
                  inputMode="url"
                />
                <button onClick={handleImport} disabled={busy || overLimit} className="btn btn-primary btn-block mt-4">
                  {busy ? "Working…" : "Import & create"}
                </button>
              </>
            )}

            {overLimit && (
              <p className="mt-3 text-center text-sm text-[var(--color-brand)]">
                You've used all uploads this period. Upgrade to add more.
              </p>
            )}
            {error && <p className="mt-3 text-center text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>}
            <button onClick={close} disabled={busy} className="btn btn-ghost btn-block mt-2">
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
