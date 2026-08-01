"use server";

import { revalidatePath } from "next/cache";
import { locationForKiosk, startKioskSession } from "@/lib/auth";

export interface KioskState {
  error?: string;
}

/**
 * Unlock a tablet into kiosk mode.
 *
 * The PIN is checked against the location, and what the tablet gets back is a
 * location-scoped cookie — not a staff session. A tablet left unattended on a
 * counter can take waivers and nothing else.
 */
export async function unlockKioskAction(
  _prev: KioskState,
  form: FormData,
): Promise<KioskState> {
  const locationId = String(form.get("locationId") ?? "");
  const pin = String(form.get("pin") ?? "");
  const location = await locationForKiosk(locationId);
  if (!location) return { error: "That kiosk address is not in use." };

  try {
    await startKioskSession(location, pin);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That PIN did not work." };
  }
  revalidatePath(`/kiosk/${locationId}`);
  return {};
}
