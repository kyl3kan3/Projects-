"use server";

/**
 * The applicant's server actions. No session exists here — these are reachable by
 * anyone with the listing link, which is the point.
 *
 * The listing slug is the only thing trusted from the client, and
 * `submitApplication` resolves everything else from it. Documents are stored under
 * the landlord that owns the listing, so an applicant cannot write into another
 * landlord's prefix by tampering with a form field.
 */

import { revalidatePath } from "next/cache";
import { applicationInput, submitApplication } from "@/lib/applications";
import { listingBySlug } from "@/lib/listings";
import { storeUpload } from "@/lib/storage";

export interface ApplyState {
  error?: string;
  ok?: boolean;
}

export async function submitApplicationAction(_prev: ApplyState, form: FormData): Promise<ApplyState> {
  const slug = String(form.get("slug") ?? "");
  const listing = await listingBySlug(slug);
  if (!listing) return { error: "That listing is no longer available" };
  if (listing.listing.status !== "live") return { error: "That listing has closed and is not taking applications" };

  const parsed = applicationInput.safeParse({
    applicantName: String(form.get("applicantName") ?? "").trim(),
    applicantEmail: String(form.get("applicantEmail") ?? "").trim(),
    applicantPhone: String(form.get("applicantPhone") ?? "").trim(),
    currentAddress: String(form.get("currentAddress") ?? "").trim(),
    moveInOn: String(form.get("moveInOn") ?? "").trim(),
    occupants: String(form.get("occupants") ?? "1"),
    employer: String(form.get("employer") ?? "").trim(),
    jobTitle: String(form.get("jobTitle") ?? "").trim(),
    monthlyIncome: String(form.get("monthlyIncome") ?? "0").trim(),
    employmentYears: String(form.get("employmentYears") ?? "0"),
    previousLandlordName: String(form.get("previousLandlordName") ?? "").trim(),
    previousLandlordPhone: String(form.get("previousLandlordPhone") ?? "").trim(),
    pets: String(form.get("pets") ?? "").trim(),
    vehicles: String(form.get("vehicles") ?? "").trim(),
    smoker: form.get("smoker") === "on",
    notes: String(form.get("notes") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const documentKeys: string[] = [];
    for (const entry of form.getAll("documents")) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      const bytes = Buffer.from(await entry.arrayBuffer());
      const put = await storeUpload(listing.property.landlordId, "application", {
        bytes,
        contentType: entry.type,
      });
      documentKeys.push(put.key);
    }

    await submitApplication(slug, parsed.data, documentKeys);
    revalidatePath(`/units/${listing.unit.id}`);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that application" };
  }
}
