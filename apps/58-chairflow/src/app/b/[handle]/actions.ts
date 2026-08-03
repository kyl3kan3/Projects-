"use server";

import { redirect } from "next/navigation";
import { checkbox, failed, field, type FormState } from "@/lib/forms";
import { stylistByHandle } from "@/lib/auth";
import { bookAppointment } from "@/server/appointments";
import { verifyToken } from "@/lib/tokens";

export type BookingValues = {
  handle: string;
  serviceId: string;
  startsAt: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  card: string;
  nudge: string;
};

/**
 * Take a booking from the public page.
 *
 * Booking *is* the agreement: there is no separate checkbox to tick, because the policy panel
 * is on the screen above this button and the button says so. What gets written is the policy
 * version and the timestamp, which is the pair that answers a dispute.
 *
 * Every typed field comes back on failure. React 19 clears an uncontrolled form once the
 * action returns, and this is the money surface — a client whose phone number was rejected
 * must not lose their name, their email and their slot as well.
 */
export async function bookAction(
  _prev: FormState<BookingValues>,
  formData: FormData,
): Promise<FormState<BookingValues>> {
  const values: BookingValues = {
    handle: field(formData, "handle"),
    serviceId: field(formData, "serviceId"),
    startsAt: field(formData, "startsAt"),
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    card: field(formData, "card"),
    nudge: field(formData, "nudge"),
  };

  const stylist = await stylistByHandle(values.handle);
  if (!stylist) return failed("This booking page is not available.", values);

  // A nudge link carries the id of the nudge that produced it, so the rebooking can be
  // stamped back onto it — receipts, not claims.
  let nudgeId: string | null = null;
  if (values.nudge) {
    const verified = await verifyToken("nudge_booking", values.nudge);
    nudgeId = verified?.subjectId ?? null;
  }

  const result = await bookAppointment({
    stylist,
    serviceId: values.serviceId,
    startsAtIso: values.startsAt,
    client: {
      firstName: values.firstName,
      lastName: values.lastName || null,
      phone: values.phone,
      email: values.email || null,
      smsConsent: checkbox(formData, "smsConsent"),
    },
    cardHint: values.card || null,
    source: nudgeId ? "nudge" : "booking_page",
    nudgeId,
  });

  if (!result.ok) return failed(result.message, values);
  if ("hosted" in result) redirect(result.url);
  redirect(
    `/b/${stylist.handle}/booked?a=${result.appointmentId}&t=${encodeURIComponent(result.manageToken)}`,
  );
}
