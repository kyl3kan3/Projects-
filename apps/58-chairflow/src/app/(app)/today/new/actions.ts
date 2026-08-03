"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStylist } from "@/lib/auth";
import { checkbox, failed, field, type FormState } from "@/lib/forms";
import { bookAppointment } from "@/server/appointments";

export type ManualBookingValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  serviceId: string;
  startsAt: string;
};

/**
 * Add an appointment by hand — the walk-in, the phone call, the client who texted.
 *
 * It goes through exactly the same `bookAppointment` the public page uses, so a manual
 * booking is stamped with the current policy version and re-checks the slot under the same
 * lock. A second, looser path for "the stylist knows best" is how double bookings and
 * unstamped appointments get in.
 */
export async function addAppointmentAction(
  _prev: FormState<ManualBookingValues>,
  formData: FormData,
): Promise<FormState<ManualBookingValues>> {
  const { stylist } = await requireStylist();
  const values: ManualBookingValues = {
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    serviceId: field(formData, "serviceId"),
    startsAt: field(formData, "startsAt"),
  };

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
    source: "manual",
  });

  if (!result.ok) return failed(result.message, values);
  if ("hosted" in result) {
    return failed(
      "This client needs to put a card on file themselves — send them your booking link.",
      values,
    );
  }

  revalidatePath("/today");
  redirect("/today");
}
