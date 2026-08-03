/**
 * src/lib/forms.ts
 *
 * Form state shapes shared by client components and server actions.
 *
 * These live in an ordinary module on purpose. A non-function export from a
 * `"use server"` file compiles, then arrives `undefined` on the client and crashes the
 * screen on first interaction — so the constants and types every form needs are declared
 * here and the action files export nothing but actions.
 *
 * `values` is the other half of the same discipline: React 19 resets an uncontrolled form
 * after a server action returns, so every rejectable form echoes what was submitted back
 * through `defaultValue`. Without it, one bad price empties fourteen fields.
 */

export interface FormState<V extends Record<string, string> = Record<string, string>> {
  error: string | null;
  notice: string | null;
  values: V;
}

export function emptyState<V extends Record<string, string>>(values: V): FormState<V> {
  return { error: null, notice: null, values };
}

export function failed<V extends Record<string, string>>(error: string, values: V): FormState<V> {
  return { error, notice: null, values };
}

export function succeeded<V extends Record<string, string>>(
  notice: string,
  values: V,
): FormState<V> {
  return { error: null, notice, values };
}

/** Read a form field as a trimmed string. */
export function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** Read a checkbox. An unchecked box sends nothing at all. */
export function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

/**
 * A dollars-and-cents field -> integer cents, or null.
 *
 * "45", "45.00", "$45", "1,250.50" all work. Anything else is null and the caller says
 * so rather than storing NaN, because a price that silently became zero is a service
 * given away.
 */
export function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isFinite(cents) ? cents : null;
}

/** An integer field with bounds, or null. */
export function intInRange(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}
