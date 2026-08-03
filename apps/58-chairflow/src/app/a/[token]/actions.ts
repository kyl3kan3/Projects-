"use server";

import { redirect } from "next/navigation";
import { failed, field, type FormState } from "@/lib/forms";
import { hashMatches, verifyToken } from "@/lib/tokens";
import { appointmentBundle, cancelAppointment, rescheduleAppointment } from "@/server/appointments";
import { offerFreedSlot } from "@/server/waitlist";

export type ManageValues = { token: string; startsAt: string };

/**
 * Resolve a manage token to its appointment, refusing a token that is no longer the current
 * one for that row.
 *
 * The signature proves we minted it; the stored hash proves it has not been superseded. That
 * second check is what makes rescheduling revoke the old link, so an old text cannot move an
 * appointment that has already been moved.
 */
async function resolve(token: string) {
  const verified = await verifyToken("manage", token);
  if (!verified) return null;
  const bundle = await appointmentBundle(verified.subjectId);
  if (!bundle) return null;
  if (!hashMatches(bundle.appointment.manageTokenHash, verified.hash)) return null;
  return bundle;
}

export async function rescheduleByTokenAction(
  _prev: FormState<ManageValues>,
  formData: FormData,
): Promise<FormState<ManageValues>> {
  const values: ManageValues = {
    token: field(formData, "token"),
    startsAt: field(formData, "startsAt"),
  };
  const bundle = await resolve(values.token);
  if (!bundle) return failed("This link is not valid any more.", values);

  const before = {
    serviceId: bundle.service.id,
    startsAt: bundle.appointment.startsAt,
    endsAt: bundle.appointment.endsAt,
  };

  const result = await rescheduleAppointment({
    appointmentId: bundle.appointment.id,
    startsAtIso: values.startsAt,
    actor: { kind: "client_token" },
  });
  if (!result.ok) return failed(result.message, values);

  // The hour they left behind is worth something to somebody on the waitlist.
  if (before.startsAt.getTime() > Date.now()) {
    await offerFreedSlot({
      stylistId: bundle.stylist.id,
      serviceId: before.serviceId,
      startsAt: before.startsAt,
      endsAt: before.endsAt,
    });
  }

  redirect(`/a/${result.manageToken}?moved=1`);
}

export async function cancelByTokenAction(
  _prev: FormState<ManageValues>,
  formData: FormData,
): Promise<FormState<ManageValues>> {
  const values: ManageValues = { token: field(formData, "token"), startsAt: "" };
  const bundle = await resolve(values.token);
  if (!bundle) return failed("This link is not valid any more.", values);

  const freed = {
    serviceId: bundle.service.id,
    startsAt: bundle.appointment.startsAt,
    endsAt: bundle.appointment.endsAt,
  };

  const result = await cancelAppointment({
    appointmentId: bundle.appointment.id,
    actor: { kind: "client_token" },
    byClient: true,
  });
  if (!result.ok) return failed(result.message, values);

  if (result.outcome.freedSlot) {
    await offerFreedSlot({
      stylistId: bundle.stylist.id,
      serviceId: freed.serviceId,
      startsAt: freed.startsAt,
      endsAt: freed.endsAt,
    });
  }

  redirect(`/a/${values.token}?cancelled=1`);
}
