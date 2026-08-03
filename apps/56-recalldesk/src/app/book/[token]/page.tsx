import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations, patients, practices } from "@/db/schema";
import { Icon } from "@/components/icons";
import { addDays, todayInTimezone, fromDayString } from "@/lib/dates";
import { phoneDisplay } from "@/lib/format";
import { verifyBookingToken } from "@/lib/tokens";
import { BookingForm } from "./BookingForm";
import { requestTimeAction } from "./actions";

/**
 * The patient-facing booking-request page — the destination of every touch's link.
 *
 * An expired or forged token gets a friendly "call us" screen with the practice's
 * number, never an error page: the person holding the link is a patient, and the
 * worst outcome is that they give up. `noindex` because the URL is a bearer
 * credential to one patient's record.
 */
export const metadata: Metadata = {
  title: "Book your visit",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await verifyBookingToken(token);

  if (!payload) {
    return <Fallback />;
  }

  const db = getDb();
  const [row] = await db
    .select({ patient: patients, location: locations, practice: practices })
    .from(patients)
    .innerJoin(locations, eq(locations.id, patients.locationId))
    .innerJoin(practices, eq(practices.id, locations.practiceId))
    .where(and(eq(patients.id, payload.patientId), eq(patients.locationId, payload.locationId)));

  if (!row) return <Fallback />;
  const { patient, location, practice } = row;

  // The next ten weekdays in the location's own timezone, morning and afternoon.
  const todayStr = todayInTimezone(location.timezone);
  const today = fromDayString(todayStr) ?? new Date();
  const windows: { value: string; label: string }[] = [];
  for (let offset = 1; windows.length < 12 && offset <= 21; offset++) {
    const date = addDays(today, offset);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const day = date.toISOString().slice(0, 10);
    // "Tue 4 AM" reads as four in the morning. The words matter more than the
    // brevity here: this is a patient on a phone, not a member of staff.
    const label = `${WEEKDAYS[weekday]} ${date.getUTCDate()}`;
    windows.push({ value: `${day}|am`, label: `${label} · morning` });
    windows.push({ value: `${day}|pm`, label: `${label} · afternoon` });
  }

  return (
    <main className="screen" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 520 }}>
      <p className="t-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="chair-side" size={16} />
        {practice.name}
      </p>
      <h1 className="t-h2" style={{ margin: "8px 0 0" }}>
        {location.name}
      </h1>
      <p className="t-body" style={{ marginTop: 12, marginBottom: 24 }}>
        Hi {patient.firstName} — {location.bookingNotice}
      </p>

      <BookingForm
        token={token}
        firstName={patient.firstName}
        phone={patient.phone ? phoneDisplay(patient.phone) : ""}
        windows={windows}
        locationPhone={location.phone ? phoneDisplay(location.phone) : null}
        action={requestTimeAction}
      />

      <p className="t-secondary" style={{ marginTop: 24 }}>
        This link is just for you. We only use your details to arrange your appointment.
        {location.phone ? ` Prefer to talk? Call ${phoneDisplay(location.phone)}.` : ""}
      </p>
    </main>
  );
}

function Fallback() {
  return (
    <main className="screen" style={{ paddingTop: 32, paddingBottom: 40, maxWidth: 520 }}>
      <p className="t-label" style={{ margin: 0 }}>
        RecallDesk
      </p>
      <h1 className="t-h2" style={{ margin: "8px 0 12px" }}>
        This booking link has expired
      </h1>
      <p className="t-body" style={{ marginTop: 0 }}>
        Links stay live for about two months. Please call your dental practice directly and they will
        find you a time — they still have your chart and your history.
      </p>
      <p className="t-secondary">
        If you received this in a message you did not expect, you can ignore it. Nothing has been
        booked.
      </p>
    </main>
  );
}
