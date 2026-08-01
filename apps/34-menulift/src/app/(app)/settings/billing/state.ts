/**
 * Form state for billing. Separate from `actions.ts` because a `"use server"`
 * module may only export async functions.
 */

export interface BillingState {
  error: string | null;
}

export const EMPTY_BILLING: BillingState = { error: null };
