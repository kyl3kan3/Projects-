"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Mode = "upload" | "url";

export function UploadCard({ overLimit }: { overLimit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("upload");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file first.");
    setError(null);
    setBusy(true);
    try {
      setProgress("Preparing upload…");
      const initRes = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title || file.name,
          contentType: file.type || "video/mp4",
        }),
      });
      if (initRes.status === 402) {
        setError("You're out of uploads this period. Upgrade to continue.");
        return;
      }
      if (!initRes.ok) throw new Error("Could not start upload");
      const { projectId, uploadUrl } = await initRes.json();

      setProgress("Uploading to storage…");
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "video/mp4" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed");

      setProgress("Queuing processing…");
      await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleImport() {
    if (!url) return setError("Paste a URL first.");
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
        setError("You're out of uploads this period. Upgrade to continue.");
        return;
      }
      if (!res.ok) throw new Error("Import failed");
      const { projectId } = await res.json();
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setMode("upload")}
          className={`badge ${mode === "upload" ? "text-white" : ""}`}
          style={mode === "upload" ? { borderColor: "var(--color-brand)" } : {}}
        >
          Upload file
        </button>
        <button
          onClick={() => setMode("url")}
          className={`badge ${mode === "url" ? "text-white" : ""}`}
          style={mode === "url" ? { borderColor: "var(--color-brand)" } : {}}
        >
          From URL
        </button>
      </div>

      <label className="mb-1 block text-sm">Title (optional)</label>
      <input
        className="input mb-4"
        placeholder="Episode 42 — The comeback"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
      />

      {mode === "upload" ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,audio/*"
            disabled={busy || overLimit}
            className="input mb-4"
          />
          <button
            onClick={handleUpload}
            disabled={busy || overLimit}
            className="btn btn-primary w-full"
          >
            {busy ? progress ?? "Working…" : "Create content kit"}
          </button>
        </>
      ) : (
        <>
          <input
            className="input mb-4"
            placeholder="https://youtube.com/watch?v=…  or  RSS enclosure URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy || overLimit}
          />
          <button
            onClick={handleImport}
            disabled={busy || overLimit}
            className="btn btn-primary w-full"
          >
            {busy ? "Working…" : "Import & create kit"}
          </button>
        </>
      )}

      {overLimit && (
        <p className="mt-3 text-sm text-amber-300">
          You've used all uploads this period. Upgrade below to add more.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
  );
}
