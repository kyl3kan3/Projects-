/**
 * Shared shapes for `useActionState` forms.
 *
 * These live outside every `"use server"` module on purpose: a server-action file
 * may only export async functions, so exporting an initial-state *object* from
 * one fails the production build (while type-checking perfectly happily — the
 * error only appears when Next collects page data).
 */

export interface FormState {
  error: string | null;
  ok: string | null;
}

export const EMPTY_STATE: FormState = { error: null, ok: null };

export interface TokenState extends FormState {
  /** The plaintext token, shown once and never stored. */
  token: string | null;
}

export const EMPTY_TOKEN_STATE: TokenState = { error: null, ok: null, token: null };

export interface SubscribeState extends FormState {
  /** The reader's feed URL, shown on success. */
  feedUrl: string | null;
}

export const EMPTY_SUBSCRIBE_STATE: SubscribeState = { error: null, ok: null, feedUrl: null };

export interface AuthState {
  error: string | null;
}

export const EMPTY_AUTH_STATE: AuthState = { error: null };
