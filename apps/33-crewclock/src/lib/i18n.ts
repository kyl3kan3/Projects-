/**
 * The dictionary layer. Two locales, one product.
 *
 * Chosen over next-intl (ARCHITECTURE.md) because the locale here is a property
 * of the *user*, not the URL: a foreman running a mixed crew has one worker
 * reading Spanish and the next reading English on the same job, and neither
 * should have to notice a `/es/` prefix.
 *
 * The type contract: `en.ts` defines the key set, `es.ts` is
 * `Record<DictionaryKey, string>`. A key added to one and not the other is a
 * compile error, so a half-translated screen cannot ship.
 */

import type { Locale } from "@/db/schema";
import { en, type DictionaryKey } from "@/i18n/en";
import { es } from "@/i18n/es";
import { formatDuration } from "@/lib/time";

export type { DictionaryKey };

export const LOCALES: readonly Locale[] = ["en", "es"];

const DICTIONARIES: Record<Locale, Record<DictionaryKey, string>> = { en, es };

export interface TranslateValues {
  [placeholder: string]: string | number;
}

/** Locale-aware lookup with `{name}` interpolation. */
export function t(locale: Locale, key: DictionaryKey, values?: TranslateValues): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
  // Falling back to English beats rendering a raw key at a worker.
  const template = dict[key] ?? DICTIONARIES.en[key];
  if (template === undefined) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Missing i18n key: ${String(key)}`);
    }
    return String(key);
  }
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** A bound translator, so screens read `tt("clock.in")`. */
export function translator(locale: Locale) {
  return (key: DictionaryKey, values?: TranslateValues) => t(locale, key, values);
}

/** Pick a locale from anything: a user row, a query param, a header. */
export function normalizeLocale(value: string | null | undefined, fallback: Locale = "en"): Locale {
  if (!value) return fallback;
  const head = value.toLowerCase().slice(0, 2);
  return head === "es" ? "es" : head === "en" ? "en" : fallback;
}

/* --------------------------------------------------------------- formats --- */

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", es: "es-MX" };

/** "Tue 24" / "mar 24" — the crew hours row label. */
export function formatDayLabel(instant: Date, timeZone: string, locale: Locale): string {
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    weekday: "short",
    day: "numeric",
  }).formatToParts(instant);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  // Spanish short weekdays arrive as "mar." — the trailing dot is noise in a row.
  return `${weekday.replace(/\.$/, "")} ${day}`;
}

/** "7:03 AM" / "7:03" — punch times. */
export function formatClockTime(instant: Date, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: locale === "en",
  }).format(instant);
}

/** "Feb 24" / "24 feb" — pay-period chips and export rows. */
export function formatShortDate(dateKey: string, locale: Locale): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(/\.$/, "");
}

/**
 * "6h 12m" — identical in both locales on purpose. It is a mono readout, and a
 * crew member reading it at arm's length in the sun needs the same two glyphs
 * either way.
 */
export function formatHoursMinutes(seconds: number): string {
  return formatDuration(seconds);
}

/** Decimal hours with locale separators: 7.99 → "7.99" / "7,99". */
export function formatDecimalHours(centihours: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centihours / 100);
}

/** Integer cents → "$8,410" / "$8,410" (USD either way; the crews are US). */
export function formatMoney(cents: number, locale: Locale, withCents = false): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(cents / 100);
}

/** Choose between a one/many pair without pulling in a plural-rules dependency. */
export function plural(
  locale: Locale,
  count: number,
  keys: { one: DictionaryKey; many: DictionaryKey },
  values: TranslateValues = {},
): string {
  return t(locale, count === 1 ? keys.one : keys.many, { count, ...values });
}
