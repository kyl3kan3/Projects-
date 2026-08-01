/**
 * Form state shapes for the menu editor.
 *
 * These live outside `actions.ts` because a `"use server"` module may only export
 * async functions — exporting a plain object from one compiles and builds fine and
 * then throws "A 'use server' file can only export async functions" the first time
 * a client component imports it at runtime.
 */

export interface FormState {
  error: string | null;
  ok: string | null;
}

export const EMPTY_FORM: FormState = { error: null, ok: null };
