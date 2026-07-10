export function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(cents / 100);
}
export function moneyWhole(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}
export function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}
export function fmtDay(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export function fmtTime(d: Date | string | null, tz?: string): string {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}
export function fmtDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m >= 60) { const h = Math.floor(m / 60); const r = m % 60; return r ? `${h} hr ${r} min` : `${h} hr`; }
  return `${m} min`;
}
export function bytesToGb(bytes: number): string {
  return (bytes / 1_000_000_000).toFixed(bytes < 1_000_000_000 ? 2 : 1);
}
export function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}
