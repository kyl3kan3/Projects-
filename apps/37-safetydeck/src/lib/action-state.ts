/**
 * The shape every server action returns, and its idle value.
 *
 * This lives outside the action modules on purpose: a `"use server"` file may
 * only export async functions, so exporting a plain `IDLE` object from one throws
 * at *runtime* — after a green build — the first time the page is rendered.
 */

export interface ActionState {
  error: string | null;
  message: string | null;
}

export const IDLE: ActionState = { error: null, message: null };
