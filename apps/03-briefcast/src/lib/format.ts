export function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export function fmtMeta(startsAt: Date | string | null, durationSeconds: number | null, platform: string | null): string {
  const parts: string[] = [];
  if (startsAt) parts.push(fmtDate(startsAt));
  if (durationSeconds) parts.push(fmtDuration(durationSeconds));
  if (platform) parts.push(platform.charAt(0).toUpperCase() + platform.slice(1));
  return parts.join(" · ");
}

export function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function timeMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
