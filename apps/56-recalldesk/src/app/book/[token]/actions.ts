"use server";

/**
 * The one action a patient can take. Its authority comes entirely from the signed
 * token, which is re-verified here rather than trusted from the page's props — a
 * server action is a public endpoint, and a patient id in a hidden field is not a
 * credential.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations, patients } from "@/db/schema";
import { normalizePhone } from "@/lib/pms";
import { fromDayString } from "@/lib/dates";
import { verifyBookingToken } from "@/lib/tokens";
import { createBookingRequest } from "@/server/queue";

export interface BookingState {
  error: string | null;
  done: boolean;
}

const MAX_WINDOWS = 6;

export async function requestTimeAction(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const token = String(formData.get("token") ?? "");
  const payload = await verifyBookingToken(token);
  if (!payload) {
    return { error: "This link has expired. Please call the practice and we will book you in.", done: false };
  }

  const db = getDb();
  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, payload.patientId), eq(patients.locationId, payload.locationId)));
  if (!patient) {
    return { error: "We could not find your record. Please call the practice.", done: false };
  }
  const [location] = await db.select().from(locations).where(eq(locations.id, payload.locationId));
  if (!location) {
    return { error: "We could not find that practice location.", done: false };
  }

  const windows = formData
    .getAll("window")
    .map(String)
    .slice(0, MAX_WINDOWS)
    .map((raw) => {
      const [day, period] = raw.split("|");
      return fromDayString(day ?? "") && (period === "am" || period === "pm")
        ? { day, period: period as "am" | "pm" }
        : null;
    })
    .filter((w): w is { day: string; period: "am" | "pm" } => w !== null);

  if (windows.length === 0) {
    return { error: "Choose at least one time that works for you.", done: false };
  }

  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) {
    return { error: "That number does not look like a 10-digit mobile. Check it and try again.", done: false };
  }

  const note = String(formData.get("note") ?? "").trim().slice(0, 400) || null;

  try {
    await createBookingRequest({
      patientId: patient.id,
      touchId: payload.touchId,
      preferredWindows: windows,
      note,
      phone,
    });
    return { error: null, done: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "We could not save that. Please call the practice.",
      done: false,
    };
  }
}
