/**
 * src/lib/i18n.ts
 *
 * Typed EN/ES dictionary layer (chosen over next-intl — see
 * ARCHITECTURE.md "Stack & Rationale"). Locale is a per-user setting,
 * not a URL segment; every crew-facing string goes through here —
 * greppable, typed, and reviewed by a native speaker before shipping.
 *
 * TODO:
 * - [ ] Typed dictionaries src/i18n/en.ts and src/i18n/es.ts sharing one
 *       key type — a key missing from either locale is a compile error.
 * - [ ] t(locale, key, values?): lookup + {name}-style interpolation;
 *       throws in dev on missing keys, falls back to EN in prod with a
 *       Sentry breadcrumb.
 * - [ ] Date/number formatting via Intl: formatDate ("Tue 24" /
 *       "mar 24"), formatMoney with locale separators.
 * - [ ] formatHours(minutes): "6h 12m" (same both locales, mono face).
 * - [ ] getUserLocale / setUserLocale: persisted server-side; the EN/ES
 *       pill on the crew profile writes here.
 * - [ ] ES review workflow: native-speaker sign-off recorded per release
 *       (ROADMAP Phase 0); machine translation is a draft, never shipped.
 */

import type { Locale } from "../db/schema";

export type DictionaryKey = string; // TODO: narrow to keyof typeof en

export interface TranslateValues {
  [placeholder: string]: string | number;
}

export function t(
  _locale: Locale,
  _key: DictionaryKey,
  _values?: TranslateValues,
): string {
  throw new Error("Not implemented");
}

export function formatHours(_locale: Locale, _minutes: number): string {
  throw new Error("Not implemented");
}

export function setUserLocale(_userId: string, _locale: Locale): Promise<void> {
  throw new Error("Not implemented");
}
