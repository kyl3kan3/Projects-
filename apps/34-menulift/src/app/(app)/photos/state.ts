/**
 * Form state for the photo review screen. Separate from `actions.ts` because a
 * `"use server"` module may only export async functions.
 */

export interface PhotoState {
  error: string | null;
  ok: string | null;
}

export const EMPTY_PHOTO_STATE: PhotoState = { error: null, ok: null };
