/**
 * Formatting and money parsing.
 *
 * Every amount in BidBoard is integer cents. This file is the only place a
 * string becomes cents and the only place cents become a string, because a bid
 * total that is off by a rounding error is worse than no leveling at all.
 *
 * Dashboard stamps are mono and uppercase ("DUE MAR 21 · 6 DAYS") because
 * DESIGN.md classes dates as data. The portal speaks plainly — subs read it in a
 * truck.
 */

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/* --------------------------------------------------------------- money in --- */

/**
 * Parse what a sub typed into an amount input.
 *
 * Accepts `184200`, `$184,200`, `184,200.50`, `184200.5`, ` 1 200 `, and
 * `(1,200)` for a negative (accountants write deducts that way). Returns null
 * for anything empty, and throws for anything that isn't a number — a silent
 * zero here is a wrong bid.
 */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (raw === "") return null;

  const parenNegative = /^\(.*\)$/.test(raw);
  let body = parenNegative ? raw.slice(1, -1) : raw;
  body = body.replace(/[$\s ]/g, "").replace(/,/g, "");

  let negative = parenNegative;
  if (body.startsWith("-")) {
    negative = !negative;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }

  if (body === "" || !/^\d*(\.\d*)?$/.test(body)) {
    throw new MoneyParseError(`"${raw}" is not an amount`);
  }

  const [whole, frac = ""] = body.split(".");
  if (frac.length > 2) {
    // Three decimal places in a bid amount is a typo, not a price. Round to the
    // cent once, here at the edge, and never again downstream.
    const cents = Math.round(Number(`${whole || "0"}.${frac}`) * 100);
    return negative ? -cents : cents;
  }
  const cents = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) throw new MoneyParseError(`"${raw}" is too large`);
  return negative ? -cents : cents;
}

export class MoneyParseError extends Error {}

/* -------------------------------------------------------------- money out --- */

/** `$184,200.00` from 18420000 cents. */
export function money(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${whole}.${frac}`;
}

/** `$184,200` — drops `.00`, for grid cells and headline figures. */
export function moneyShort(cents: number): string {
  const full = money(cents);
  return full.endsWith(".00") ? full.slice(0, -3) : full;
}

/** `184,200.00` — no symbol, for CSV and PDF columns. */
export function moneyPlain(cents: number): string {
  return money(cents).replace("$", "");
}

/* -------------------------------------------------------------- dates ------ */

/** `MAR 21` — the mono stamp on project rows and audit lines. */
export function stampDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** `MAR 21, 4:12 PM` — the audit / submitted-at stamp. */
export function stampDateTime(d: Date): string {
  let hour = d.getUTCHours();
  const meridiem = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 === 0 ? 12 : hour % 12;
  return `${stampDate(d)}, ${hour}:${String(d.getUTCMinutes()).padStart(2, "0")} ${meridiem}`;
}

/** `Mar 21` — plain sentence case, for the portal. */
export function plainDate(d: Date): string {
  const m = MONTHS[d.getUTCMonth()];
  return `${m[0]}${m.slice(1).toLowerCase()} ${d.getUTCDate()}`;
}

/** UTC midnight of a moment — the boundary every day-count in the app uses. */
export function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whole calendar days from `now` until `due`, in UTC. Positive = still ahead,
 * 0 = due today, negative = past due. Calendar days, not 24h blocks: "3 days
 * left" has to agree with what a wall calendar says.
 */
export function daysUntil(due: Date, now: Date = new Date()): number {
  return Math.round((utcDay(due) - utcDay(now)) / 86_400_000);
}

/** `DUE MAR 21 · 6 DAYS` / `DUE TODAY` / `4 DAYS OVERDUE`. */
export function dueStamp(due: Date, now: Date = new Date()): string {
  const days = daysUntil(due, now);
  const head = `DUE ${stampDate(due)}`;
  if (days > 1) return `${head} · ${days} DAYS`;
  if (days === 1) return `${head} · TOMORROW`;
  if (days === 0) return `DUE TODAY`;
  if (days === -1) return `1 DAY OVERDUE`;
  return `${-days} DAYS OVERDUE`;
}

/** `2D AGO` / `4H AGO` / `NEVER` — rounded down, never optimistic. */
export function agoStamp(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "NEVER";
  const seconds = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (seconds < 60) return "JUST NOW";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}D AGO`;
  return `${Math.floor(days / 30)}MO AGO`;
}

/* --------------------------------------------------------------- misc ----- */

/** `142 KB` / `2.4 MB` — plan-set sizes on the portal. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** `14 of 22 bids in` — the coverage line under a project name. */
export function coverageLine(submitted: number, invited: number): string {
  if (invited === 0) return "no invites sent yet";
  return `${submitted} of ${invited} bid${invited === 1 ? "" : "s"} in`;
}

/** Percentage 0–100, integer, for the coverage track. */
export function coveragePct(submitted: number, invited: number): number {
  if (invited <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((submitted / invited) * 100)));
}

/** Initials for a sub column header: "Meridian Electric" → "ME". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
