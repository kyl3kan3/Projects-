/**
 * Form state for the import and matrix screens. Separate from `actions.ts`
 * because a `"use server"` module may only export async functions.
 */

export interface ImportState {
  error: string | null;
  ok: string | null;
  /** Set when the export's columns weren't recognised, so the UI can ask. */
  needsMapping: { headers: string[]; sample: string[][]; csv: string } | null;
}

export const EMPTY_IMPORT_STATE: ImportState = { error: null, ok: null, needsMapping: null };

export interface SimpleState {
  error: string | null;
  ok: string | null;
}

export const EMPTY_SIMPLE_STATE: SimpleState = { error: null, ok: null };
