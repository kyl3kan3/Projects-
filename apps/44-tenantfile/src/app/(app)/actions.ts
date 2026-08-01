"use server";

/**
 * Every server action the landlord's screens use.
 *
 * They are together in one file because they share exactly one shape: resolve the
 * signed-in landlord, hand the work to a module in src/lib, revalidate, and return
 * a plain `{ error }` for the form to display. No business logic lives here.
 *
 * Ownership is checked inside the lib functions (every one of them takes a
 * landlordId and joins through properties), not here — so a missed check in a new
 * action cannot leak another landlord's tenancy.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLandlord } from "@/lib/auth";
import { createProperty, createUnit, endTenancy, importTenancy, propertyInput, tenancyInput, unitInput, updateTenancyContacts } from "@/lib/units";
import { closeListing, createListing, listingInput } from "@/lib/listings";
import { approveApplication, declineApplication, draftAdverseAction, landlordApplication } from "@/lib/applications";
import { inviteToScreen, recordReportReceived } from "@/lib/screening";
import { draftLease, sendLease, signLease, voidLease } from "@/lib/leases";
import { adjustCharge, recordPayment, upsertLateFeeRule, waiveCharge, landlordTenancy } from "@/lib/ledger";
import { sendReminderNow } from "@/lib/reminders";
import { openRequest, postMessage, updateRequest } from "@/lib/maintenance";
import { createCheckoutSession, createPortalSession } from "@/lib/stripe";
import { storeUpload, type StorageScope } from "@/lib/storage";
import { checkLateFeeRule } from "@/lib/state-rules";
import { isIsoDate, isoDateOf, parseMoneyToCents } from "@/lib/money";
import type { PaymentMethod, RequestPriority, RequestStatus } from "@/db/schema";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

function fail(err: unknown, fallback: string): FormState {
  return { error: err instanceof Error ? err.message : fallback };
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Files arrive as ordinary multipart parts; storage.ts does the checking. */
async function storeFiles(landlordId: string, scope: StorageScope, form: FormData, field: string): Promise<string[]> {
  const keys: string[] = [];
  for (const entry of form.getAll(field)) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const bytes = Buffer.from(await entry.arrayBuffer());
    const put = await storeUpload(landlordId, scope, { bytes, contentType: entry.type });
    keys.push(put.key);
  }
  return keys;
}

/* ------------------------------------------------------ properties & units --- */

export async function addUnitAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const actor = user.name || user.email;

  try {
    let propertyId = str(form, "propertyId");
    if (!propertyId || propertyId === "new") {
      const parsed = propertyInput.safeParse({
        address: str(form, "address"),
        city: str(form, "city"),
        state: str(form, "state"),
        postalCode: str(form, "postalCode"),
        type: str(form, "type") === "multi" ? "multi" : "single",
      });
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      const property = await createProperty(landlord.id, parsed.data, actor);
      propertyId = property.id;
    }

    const parsedUnit = unitInput.safeParse({
      label: str(form, "label"),
      beds: str(form, "beds") || "1",
      baths: str(form, "baths") || "1",
      sqft: str(form, "sqft") || undefined,
      rent: str(form, "rent"),
      deposit: str(form, "deposit") || "0",
    });
    if (!parsedUnit.success) return { error: parsedUnit.error.issues[0].message };

    const unit = await createUnit(landlord.id, landlord.plan, propertyId, parsedUnit.data, actor);
    revalidatePath("/units");
    redirect(`/units/${unit.id}`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (typeof err === "object" && err && "digest" in err) throw err;
    return fail(err, "Could not add that unit");
  }
}

/* ---------------------------------------------------------------- listings --- */

export async function createListingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const unitId = str(form, "unitId");
  try {
    const parsed = listingInput.safeParse({
      headline: str(form, "headline"),
      description: str(form, "description"),
      minIncomeMultiple: str(form, "minIncomeMultiple") || "3",
      depositCents: String(parseMoneyToCents(str(form, "deposit") || "0")),
      petsAllowed: bool(form, "petsAllowed"),
      smokingAllowed: bool(form, "smokingAllowed"),
      availableOn: str(form, "availableOn"),
      leaseMonths: str(form, "leaseMonths") || "12",
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const photoKeys = await storeFiles(landlord.id, "listing", form, "photos");
    await createListing(landlord.id, unitId, parsed.data, photoKeys, user.name || user.email);
    revalidatePath(`/units/${unitId}`);
    return { ok: true, message: "Your listing is live. The link is on this page." };
  } catch (err) {
    return fail(err, "Could not publish that listing");
  }
}

export async function closeListingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  try {
    await closeListing(landlord.id, str(form, "listingId"), user.name || user.email);
    revalidatePath(`/units/${str(form, "unitId")}`);
    return { ok: true, message: "Listing closed. It stops taking applications now." };
  } catch (err) {
    return fail(err, "Could not close that listing");
  }
}

/* ------------------------------------------------------------ applications --- */

export async function inviteToScreenAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const applicationId = str(form, "applicationId");
  try {
    await inviteToScreen(landlord.id, applicationId, user.name || user.email);
    revalidatePath(`/applications/${applicationId}`);
    return { ok: true, message: "Sent. The applicant authorises the check on their own page." };
  } catch (err) {
    return fail(err, "Could not send that invitation");
  }
}

export async function recordScreeningAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const applicationId = str(form, "applicationId");
  try {
    const receivedOn = str(form, "receivedOn") || isoDateOf(new Date());
    if (!isIsoDate(receivedOn)) return { error: "Pick the date the report arrived" };
    if (!str(form, "provider")) return { error: "Which screening company sent it?" };

    await recordReportReceived(landlord.id, applicationId, user.name || user.email, {
      provider: str(form, "provider"),
      providerRef: str(form, "providerRef"),
      receivedOn,
      landlordNote: str(form, "landlordNote"),
      paidByApplicant: bool(form, "paidByApplicant"),
    });
    revalidatePath(`/applications/${applicationId}`);
    return { ok: true, message: "Recorded. TenantFile stores that the report exists, not what it says." };
  } catch (err) {
    return fail(err, "Could not record that report");
  }
}

export async function approveApplicationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const applicationId = str(form, "applicationId");
  let tenancyId: string;
  try {
    const tenancy = await approveApplication(landlord.id, applicationId, user.name || user.email);
    tenancyId = tenancy.id;
  } catch (err) {
    return fail(err, "Could not approve that application");
  }
  revalidatePath("/units");
  redirect(`/tenancies/${tenancyId}/lease`);
}

export async function previewAdverseActionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const owned = await landlordApplication(landlord.id, str(form, "applicationId"));
  if (!owned) return { error: "No such application" };
  const letter = draftAdverseAction(owned, user.name || user.email, {
    reason: str(form, "reason"),
    reportUsed: bool(form, "reportUsed"),
    agencyName: str(form, "agencyName"),
    agencyAddress: str(form, "agencyAddress"),
    agencyPhone: str(form, "agencyPhone"),
    landlordContact: str(form, "landlordContact"),
  });
  return { ok: true, message: letter };
}

export async function declineApplicationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const applicationId = str(form, "applicationId");
  try {
    await declineApplication(landlord.id, applicationId, user.name || user.email, {
      reason: str(form, "reason"),
      reportUsed: bool(form, "reportUsed"),
      agencyName: str(form, "agencyName"),
      agencyAddress: str(form, "agencyAddress"),
      agencyPhone: str(form, "agencyPhone"),
      landlordContact: str(form, "landlordContact"),
      letterOverride: str(form, "letter") || undefined,
    });
    revalidatePath(`/applications/${applicationId}`);
    return { ok: true, message: "Declined, and the notice has been sent and filed." };
  } catch (err) {
    return fail(err, "Could not decline that application");
  }
}

/* ------------------------------------------------------------------ leases --- */

export async function draftLeaseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  try {
    const source = str(form, "source") === "upload" ? "upload" : "state_template";
    let upload: { key: string; filename: string; sha256: string } | undefined;

    if (source === "upload") {
      const file = form.get("lease");
      if (!(file instanceof File) || file.size === 0) return { error: "Choose the lease PDF to attach" };
      const bytes = Buffer.from(await file.arrayBuffer());
      const put = await storeUpload(landlord.id, "lease", { bytes, contentType: file.type });
      upload = { key: put.key, filename: file.name, sha256: put.sha256 };
    }

    await draftLease(landlord.id, tenancyId, { source, landlordName: user.name || user.email, upload }, user.name || user.email);
    revalidatePath(`/tenancies/${tenancyId}/lease`);
    return { ok: true, message: "Draft ready. Read it, then send it out." };
  } catch (err) {
    return fail(err, "Could not draft that lease");
  }
}

export async function sendLeaseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  try {
    await sendLease(landlord.id, str(form, "leaseId"), user.name || user.email);
    revalidatePath(`/tenancies/${str(form, "tenancyId")}/lease`);
    return { ok: true, message: "Sent. Your own signing link is on this page." };
  } catch (err) {
    return fail(err, "Could not send that lease");
  }
}

export async function voidLeaseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  try {
    await voidLease(landlord.id, str(form, "leaseId"), str(form, "reason") || "Voided by the landlord", user.name || user.email);
    revalidatePath(`/tenancies/${str(form, "tenancyId")}/lease`);
    return { ok: true, message: "Voided. Nothing was deleted — the File shows it." };
  } catch (err) {
    return fail(err, "Could not void that lease");
  }
}

/** The landlord signs from inside the app; the tenant uses their own link. */
export async function landlordSignAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireLandlord();
  const result = await signLease({
    token: str(form, "token"),
    typedName: str(form, "typedName"),
    ip: str(form, "ip") || "in-app",
    userAgent: "TenantFile web (landlord, signed in)",
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/tenancies/${str(form, "tenancyId")}/lease`);
  return { ok: true, message: result.fullySigned ? "Fully signed. The tenancy is active and the first charges are on the ledger." : "Signed. Waiting on the tenant." };
}

/* ------------------------------------------------------------------ ledger --- */

export async function recordPaymentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  try {
    const owned = await landlordTenancy(landlord.id, tenancyId);
    if (!owned) return { error: "No such tenancy" };

    const amountCents = parseMoneyToCents(str(form, "amount"));
    if (amountCents <= 0) return { error: "Enter an amount greater than zero" };
    const paidOn = str(form, "paidOn");
    if (paidOn && !isIsoDate(paidOn)) return { error: "Pick the date it was paid" };

    await recordPayment({
      tenancyId,
      chargeId: str(form, "chargeId") || null,
      amountCents,
      method: (str(form, "method") || "manual_zelle") as PaymentMethod,
      reference: str(form, "reference"),
      paidAt: paidOn ? new Date(`${paidOn}T12:00:00.000Z`) : new Date(),
      recordedBy: "landlord",
    });
    revalidatePath(`/tenancies/${tenancyId}`);
    revalidatePath("/units");
    revalidatePath("/rent");
    return { ok: true, message: "Recorded." };
  } catch (err) {
    return fail(err, "Could not record that payment");
  }
}

export async function waiveChargeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  try {
    const owned = await landlordTenancy(landlord.id, tenancyId);
    if (!owned) return { error: "No such tenancy" };
    await waiveCharge(str(form, "chargeId"), str(form, "reason") || "Waived", user.name || user.email, landlord.id);
    revalidatePath(`/tenancies/${tenancyId}`);
    return { ok: true, message: "Waived, with the reason on the file." };
  } catch (err) {
    return fail(err, "Could not waive that charge");
  }
}

export async function adjustChargeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  try {
    const owned = await landlordTenancy(landlord.id, tenancyId);
    if (!owned) return { error: "No such tenancy" };
    await adjustCharge(
      str(form, "chargeId"),
      parseMoneyToCents(str(form, "amount")),
      str(form, "reason") || "Adjusted by the landlord",
      user.name || user.email,
      landlord.id,
    );
    revalidatePath(`/tenancies/${tenancyId}`);
    return { ok: true, message: "Adjusted. The change is on the file." };
  } catch (err) {
    return fail(err, "Could not adjust that charge");
  }
}

export async function saveLateFeeRuleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  try {
    const owned = await landlordTenancy(landlord.id, tenancyId);
    if (!owned) return { error: "No such tenancy" };

    const kind = str(form, "kind") === "percent" ? "percent" : "flat";
    const amount =
      kind === "flat"
        ? parseMoneyToCents(str(form, "flatAmount") || "0")
        : Math.round(Number(str(form, "percentAmount") || "0") * 100);
    const graceDays = Math.max(0, Math.trunc(Number(str(form, "graceDays") || "5")));
    const capRaw = str(form, "maxPerMonth");
    const maxPerMonthCents = capRaw ? parseMoneyToCents(capRaw) : null;
    const enabled = bool(form, "enabled");

    const { warnings } = checkLateFeeRule(owned.property.state, { kind, amount, graceDays, maxPerMonthCents }, owned.tenancy.rentCents);
    const blocking = warnings.filter((w) => w.level === "warn");
    if (enabled && blocking.length > 0 && !bool(form, "stateCapAck")) {
      return { error: `${blocking[0].text} Tick the box to say you have read that and want this rule anyway.` };
    }

    await upsertLateFeeRule(tenancyId, {
      graceDays,
      kind,
      amount,
      maxPerMonthCents,
      enabled,
      stateCapAck: bool(form, "stateCapAck"),
      stateCapNote: blocking.map((w) => w.text).join(" "),
    });
    revalidatePath(`/tenancies/${tenancyId}`);
    return { ok: true, message: enabled ? "Late-fee rule saved." : "Late fees are off for this tenancy." };
  } catch (err) {
    return fail(err, "Could not save that rule");
  }
}

export async function sendReminderNowAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  const owned = await landlordTenancy(landlord.id, tenancyId);
  if (!owned) return { error: "No such tenancy" };
  const result = await sendReminderNow(tenancyId, str(form, "chargeId"));
  revalidatePath(`/tenancies/${tenancyId}`);
  return result.ok ? { ok: true, message: "Reminder sent." } : { error: result.reason ?? "Could not send that reminder" };
}

/* --------------------------------------------------------------- tenancies --- */

export async function importTenancyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const unitId = str(form, "unitId");
  let tenancyId: string;
  try {
    const parsed = tenancyInput.safeParse({
      tenantNames: str(form, "tenantNames"),
      tenantEmails: str(form, "tenantEmails"),
      tenantPhones: str(form, "tenantPhones"),
      startsOn: str(form, "startsOn"),
      endsOn: str(form, "endsOn"),
      rent: str(form, "rent"),
      deposit: str(form, "deposit") || "0",
      rentDueDay: str(form, "rentDueDay") || "1",
      prorateFirstMonth: bool(form, "prorateFirstMonth"),
      prorateLastMonth: bool(form, "prorateLastMonth"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const tenancy = await importTenancy(landlord.id, unitId, parsed.data, user.name || user.email);
    tenancyId = tenancy.id;
  } catch (err) {
    return fail(err, "Could not bring that tenancy in");
  }
  revalidatePath("/units");
  redirect(`/tenancies/${tenancyId}`);
}

export async function endTenancyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  try {
    const endsOn = str(form, "endsOn");
    if (!isIsoDate(endsOn)) return { error: "Pick the last day of the tenancy" };
    await endTenancy(landlord.id, str(form, "tenancyId"), endsOn, user.name || user.email);
    revalidatePath("/units");
    return { ok: true, message: "Ended. The File stays exactly as it is." };
  } catch (err) {
    return fail(err, "Could not end that tenancy");
  }
}

export async function updateContactsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  try {
    await updateTenancyContacts(landlord.id, tenancyId, str(form, "tenantEmails"), str(form, "tenantPhones"));
    revalidatePath(`/tenancies/${tenancyId}`);
    return { ok: true, message: "Saved. Reminders will use these." };
  } catch (err) {
    return fail(err, "Could not save those contacts");
  }
}

/* ------------------------------------------------------------- maintenance --- */

export async function openRequestAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord } = await requireLandlord();
  const tenancyId = str(form, "tenancyId");
  try {
    const owned = await landlordTenancy(landlord.id, tenancyId);
    if (!owned) return { error: "No such tenancy" };
    const photoKeys = await storeFiles(landlord.id, "request", form, "photos");
    await openRequest({
      tenancyId,
      title: str(form, "title"),
      body: str(form, "body"),
      photoKeys,
      openedBy: "landlord",
      priority: (str(form, "priority") || "routine") as RequestPriority,
    });
    revalidatePath("/requests");
    return { ok: true, message: "Opened." };
  } catch (err) {
    return fail(err, "Could not open that request");
  }
}

export async function postMessageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord } = await requireLandlord();
  const requestId = str(form, "requestId");
  try {
    const { landlordRequest } = await import("@/lib/maintenance");
    const owned = await landlordRequest(landlord.id, requestId);
    if (!owned) return { error: "No such request" };
    const photoKeys = await storeFiles(landlord.id, "request", form, "photos");
    await postMessage(requestId, "landlord", str(form, "body"), photoKeys);
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, message: "Sent." };
  } catch (err) {
    return fail(err, "Could not send that message");
  }
}

export async function updateRequestAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const requestId = str(form, "requestId");
  try {
    const scheduledFor = str(form, "scheduledFor");
    const cost = str(form, "cost");
    await updateRequest(
      landlord.id,
      requestId,
      {
        status: (str(form, "status") || undefined) as RequestStatus | undefined,
        priority: (str(form, "priority") || undefined) as RequestPriority | undefined,
        scheduledFor: scheduledFor && isIsoDate(scheduledFor) ? scheduledFor : undefined,
        costCents: cost ? parseMoneyToCents(cost) : undefined,
      },
      user.name || user.email,
    );
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/requests");
    return { ok: true, message: "Updated." };
  } catch (err) {
    return fail(err, "Could not update that request");
  }
}

/* ----------------------------------------------------------------- billing --- */

export async function upgradeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  const target = str(form, "plan");
  if (target !== "keys" && target !== "building" && target !== "portfolio") return { error: "Pick a plan" };
  let url: string;
  try {
    url = await createCheckoutSession(landlord, user.email, target);
  } catch (err) {
    return fail(err, "Could not start checkout");
  }
  redirect(url);
}

export async function portalAction(): Promise<FormState> {
  const { landlord, user } = await requireLandlord();
  let url: string;
  try {
    url = await createPortalSession(landlord, user.email);
  } catch (err) {
    return fail(err, "Could not open the billing portal");
  }
  redirect(url);
}
