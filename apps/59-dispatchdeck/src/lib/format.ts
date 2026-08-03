/**
 * src/lib/format.ts
 *
 * Display helpers shared by the cab, the board and the marketing device.
 * Pure and dependency-light so client components can import it freely.
 *
 * Every timestamp a driver reads is rendered in the carrier's timezone, not the
 * browser's: a load booked at 23:40 Central must not read as "Aug 4" because
 * the office laptop is on Eastern.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 3, 14:05" in the given IANA zone. */
export function formatStamp(value: Date | string | null, timeZone: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("hour")}:${get("minute")}`;
}

/** "14:05" in the given zone. */
export function formatClock(value: Date | string | null, timeZone: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "Aug 3" in the given zone. */
export function formatDay(value: Date | string | null, timeZone: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}`;
}

/** A yyyy-mm-dd date column, rendered without a timezone round trip. */
export function formatDateColumn(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2h 14m" from a millisecond span. Negative spans clamp to "0m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/** "2:14:09" — the running detention clock, which reads like an instrument. */
export function formatClockSpan(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "3d ago" / "just now" — load age on the board. */
export function formatAge(from: Date | string, now: Date = new Date()): string {
  const d = typeof from === "string" ? new Date(from) : from;
  const ms = now.getTime() - d.getTime();
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** "DALLAS TX → MEMPHIS TN" — the lane, always in the mono face. */
export function formatLane(
  stops: Array<{ city: string; state: string; kind: "pickup" | "delivery" }>,
): string {
  if (stops.length === 0) return "—";
  const first = stops[0];
  const last = stops[stops.length - 1];
  const label = (s: { city: string; state: string }) => `${s.city.toUpperCase()} ${s.state.toUpperCase()}`;
  return stops.length === 1 ? label(first) : `${label(first)} → ${label(last)}`;
}

export function formatMiles(miles: number | null): string {
  return miles === null || miles === undefined ? "—" : `${miles.toLocaleString("en-US")} mi`;
}

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  dispatched: "Dispatched",
  at_shipper: "At shipper",
  in_transit: "In transit",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export const EQUIPMENT_LABELS: Record<string, string> = {
  van: "Dry van",
  reefer: "Reefer",
  flatbed: "Flatbed",
  other: "Other",
};

/** Turn a carrier name into the local part of its parse address. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "carrier"
  );
}

/** loads+bishop-hauling@mail.dispatchdeck.app */
export function parseAddress(slug: string): string {
  return `loads+${slug}@mail.dispatchdeck.app`;
}

/** A filename a broker or factor will accept without renaming it. */
export function documentFilename(
  kind: "rate_con" | "bol" | "pod_photo" | "fuel_receipt" | "packet" | "other",
  opts: { reference?: string | null; invoiceNumber?: number | null; contentType: string; day: string },
): string {
  const ext = extensionFor(opts.contentType);
  const ref = (opts.reference ?? "NOREF").replace(/[^A-Za-z0-9_-]+/g, "-").toUpperCase();
  switch (kind) {
    case "pod_photo":
      return `POD_${ref}_${opts.day}${ext}`;
    case "bol":
      return `BOL_${ref}_${opts.day}${ext}`;
    case "rate_con":
      return `RATECON_${ref}_${opts.day}${ext}`;
    case "fuel_receipt":
      return `FUEL_${opts.day}${ext}`;
    case "packet":
      return `PACKET_INV-${opts.invoiceNumber ?? 0}_${ref}.pdf`;
    default:
      return `DOC_${ref}_${opts.day}${ext}`;
  }
}

export function extensionFor(contentType: string): string {
  switch (contentType) {
    case "application/pdf":
      return ".pdf";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "text/csv":
      return ".csv";
    default:
      return "";
  }
}

/** yyyy-mm-dd for a Date in a given zone — used for filenames and date columns. */
export function isoDayIn(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
