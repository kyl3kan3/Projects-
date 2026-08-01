/**
 * Display formatting. DESIGN.md fixes the exact strings — `SKU-1042 · 6.2d COVER
 * · ORDER 240 BY JUL 11` — so every number in the product is formatted here, in
 * the mono/tabular voice, and nothing formats inline.
 *
 * These are pure and client-safe: no import here reaches the database, so a
 * client component can use them without pulling `postgres` into the browser
 * bundle.
 */

/** 641_200 -> "$6,412". Money is shown whole; cents are noise at this scale. */
export function money(cents: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  const value = Math.round(cents / 100);
  const formatted = Math.abs(value).toLocaleString("en-US");
  const sign = value < 0 ? "-" : "";
  return symbol ? `${sign}${symbol}${formatted}` : `${sign}${formatted} ${currency}`;
}

/** 418_035 -> "$4,180.35". Used on PO totals, where the cents are the contract. */
export function moneyExact(cents: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return symbol ? `${sign}${symbol}${whole}.${frac}` : `${sign}${whole}.${frac} ${currency}`;
}

/** 1204 -> "1,204". */
export function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** 6.18 -> "6.2". One decimal for rates and cover, so 0.4/day is not "0". */
export function rate(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

/**
 * Days of cover as DESIGN.md writes it: "6.2d", "212d", and "—" for a SKU with no
 * velocity. Never "Infinity", never "∞" — a merchant reads that as a bug.
 */
export function cover(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return "—";
  if (days >= 100) return `${Math.round(days)}d`;
  return `${days.toFixed(1)}d`;
}

/** "6.1/day" — a velocity in the maths panel. */
export function perDay(value: number): string {
  return `${rate(value)}/day`;
}

const STATUS_LABELS = {
  order_now: "Order now",
  order_soon: "Order this week",
  healthy: "Healthy",
  overstocked: "Overstocked",
  dead: "Dead stock",
} as const;

export function statusLabel(status: keyof typeof STATUS_LABELS): string {
  return STATUS_LABELS[status];
}

/**
 * Which semantic colour a status dot takes. DESIGN.md rations these: rust means
 * at-risk, moss means healthy, kraft is the accent that marks a decision, and
 * everything else is plain faint text.
 */
export function statusTone(status: keyof typeof STATUS_LABELS): "rust" | "kraft" | "moss" | "faint" {
  switch (status) {
    case "order_now":
      return "rust";
    case "order_soon":
      return "kraft";
    case "healthy":
      return "moss";
    default:
      return "faint";
  }
}

/** "3d ago", "22m ago", "just now" — the sync timestamp in the top bar. */
export function ago(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return "never";
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * "oaklane-goods" — the shop switcher truncates the domain suffix.
 *
 * Also strips the demo store's per-merchant discriminator, so the header reads
 * `oaklane-goods` rather than `oaklane-goods-3f9c21aa.demo.shelfsense.invalid`. The
 * screens label a demo separately; the handle is just the name.
 */
export function shopHandle(domain: string): string {
  const demo = /^(.*)-[0-9a-f]{8}\.demo\.shelfsense\.invalid$/.exec(domain);
  if (demo) return demo[1];
  return domain.replace(/\.myshopify\.com$/, "");
}
