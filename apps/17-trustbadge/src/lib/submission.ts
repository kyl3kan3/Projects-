/**
 * Resolving a review-request token into everything the hosted form needs.
 *
 * Its own module so both the page and the server action use one lookup, and so the
 * tier comes along with it — the form has to know whether the photo step exists
 * before it renders, not after the shopper has taken a photo.
 */

import { requestByToken, type RequestContext } from "@/lib/requests";
import { tierForStore } from "@/lib/tier";
import type { Tier } from "@/db/schema";

export interface SubmissionContext extends RequestContext {
  tier: Tier;
}

export async function requireRequest(token: string): Promise<SubmissionContext | null> {
  const context = await requestByToken(token);
  if (!context) return null;
  // A store that uninstalled the app stops accepting new reviews: its merchant has
  // left, and collecting on their behalf would be collecting for nobody.
  if (context.store.uninstalledAt) return null;
  return { ...context, tier: await tierForStore(context.store) };
}
