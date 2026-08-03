/**
 * The one shape every server action returns.
 *
 * It lives in its own module with no imports so a client component can hold the
 * type without dragging the database client into the browser bundle.
 */

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Where to send the browser after a success, when the action wants a nav. */
  redirectTo?: string;
}

export function formError(error: string): FormState {
  return { ok: false, error };
}

export function formOk(message: string, redirectTo?: string): FormState {
  return { ok: true, message, ...(redirectTo ? { redirectTo } : {}) };
}

/** Trim a form field to a string, tolerating File and null. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function checkbox(form: FormData, name: string): boolean {
  const value = form.get(name);
  return value === "on" || value === "true" || value === "1";
}
