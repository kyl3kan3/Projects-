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
}

export function formError(error: string): FormState {
  return { ok: false, error };
}

export function formOk(message: string): FormState {
  return { ok: true, message };
}

/**
 * There is deliberately no "redirect from the returned state" here.
 *
 * An action that wants a navigation calls Next's `redirect()`. Returning a URL for
 * the client to push looked fine and was not: `revalidatePath` on the route the form
 * is standing on re-renders that route, which remounts the form and resets
 * `useActionState` — so the effect that would have pushed never sees the state, and
 * the action appears to do nothing at all. Found by driving the move-out form in
 * Chromium, where the tenancy ended and the page just sat there.
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
