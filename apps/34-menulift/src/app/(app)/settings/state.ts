/**
 * Form state for settings. Separate from `actions.ts` because a `"use server"`
 * module may only export async functions.
 */

export interface SettingsState {
  error: string | null;
  ok: string | null;
}

export const EMPTY_SETTINGS: SettingsState = { error: null, ok: null };
