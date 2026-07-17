/**
 * src/lib/loads.ts
 *
 * The load lifecycle: legal status transitions, stop stamping, and the
 * derived thread position the cab and board both render.
 *
 * TODO:
 * - [ ] advance(loadId, userId): the cab's ONE button — compute the next
 *       legal transition from status + stop stamps (dispatched ->
 *       at_shipper stamps arrival at the next unstamped pickup, etc.);
 *       reject illegal jumps with a plain sentence.
 * - [ ] stampStop(stopId, "arrived" | "departed"): timestamps in the
 *       carrier's timezone; arrival starts the detention window.
 * - [ ] markDelivered(loadId): requires a pod_photo document; sets
 *       delivered_at.
 * - [ ] threadPosition(load, stops): 0..1 for the hazard-thread render.
 */

export async function advance(loadId: string, userId: string): Promise<{ status: string }> {
  throw new Error("Not implemented");
}

export async function stampStop(stopId: string, kind: "arrived" | "departed"): Promise<void> {
  throw new Error("Not implemented");
}

export async function markDelivered(loadId: string): Promise<void> {
  throw new Error("Not implemented");
}
