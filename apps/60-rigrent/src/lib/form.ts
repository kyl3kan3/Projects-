/**
 * src/lib/form.ts
 *
 * The one shape every server action returns.
 *
 * It lives in its own module with no imports so a client component can hold the
 * type without dragging the database client into the browser bundle.
 *
 * `values` is not decoration. React 19 resets an uncontrolled form once a server
 * action returns — including when it returned an error — so a rejected 12-field
 * quote loses every field the user typed unless the action echoes them back
 * through `defaultValue`. Nothing in a build or a type-check says a word about
 * this; you find it by submitting a bad value in a browser and looking at what
 * survived.
 */

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Submitted values, echoed back so `defaultValue` can restore them. */
  values?: Record<string, string>;
}

export function formError(error: string, values?: Record<string, string>): FormState {
  return { ok: false, error, values };
}

export function formOk(message: string, values?: Record<string, string>): FormState {
  return { ok: true, message, values };
}

/**
 * There is deliberately no "redirect from the returned state" helper here.
 *
 * An action that wants a navigation calls Next's `redirect()`. Returning a URL
 * for the client to push looked fine and was not: `revalidatePath` on the route
 * the form is standing on re-renders that route, which remounts the form and
 * resets `useActionState`, so the effect that would have pushed never sees the
 * state and the action appears to do nothing at all.
 */

/** Trim a form field to a string, tolerating File and null. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function checkbox(form: FormData, name: string): boolean {
  const value = form.get(name);
  return value === "on" || value === "true" || value === "1";
}

/** Every text field on the form, for the echo. Files and empty names are skipped. */
export function snapshot(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && key) out[key] = value;
  }
  return out;
}

export function intField(form: FormData, name: string, fallback = 0): number {
  const raw = field(form, name);
  if (!/^-?\d+$/.test(raw)) return fallback;
  return Number(raw);
}
