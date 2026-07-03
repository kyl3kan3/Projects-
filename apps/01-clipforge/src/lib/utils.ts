/** Small shared helpers (browser- and server-safe — no Node built-ins). */

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function msToClock(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function extForContentType(ct: string): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return map[ct] ?? "bin";
}

export const STATUS_LABELS: Record<string, string> = {
  uploaded: "Queued",
  importing: "Importing",
  transcribing: "Transcribing",
  selecting: "Finding clips",
  rendering: "Rendering",
  ready: "Ready",
  failed: "Failed",
};
