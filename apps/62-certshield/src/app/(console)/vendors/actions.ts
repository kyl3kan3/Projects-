"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { accessLevel } from "@/lib/plans";
import { appendAudit } from "@/lib/audit";
import { issueUploadToken, uploadUrl } from "@/lib/tokens";
import {
  createEngagement,
  createVendor,
  endEngagement,
  importVendorsCsv,
  updateVendor,
  vendorById,
  type ImportSummary,
} from "@/lib/vendors";
import { listTemplates } from "@/lib/requirements";
import { persistForVendor } from "@/lib/verdicts";

/**
 * Every exported function in this file is a public endpoint, so each one starts by
 * resolving the session and scoping to that session's org. There are no helpers
 * exported from here that nothing calls.
 */

async function ctx() {
  const { user, org } = await requireUser();
  return { user, org, actor: `${user.name} <${user.email}>` };
}

function assertWritable(level: ReturnType<typeof accessLevel>): void {
  if (level === "read_only") {
    throw new Error(
      "Your trial has ended, so the file is read-only. Everything already on file is intact, and binder exports still work.",
    );
  }
}

export interface FormState {
  error: string | null;
  ok?: string | null;
}

function fields(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return {
    name: String(formData.get("name") ?? "").trim(),
    trade: get("trade"),
    contactName: get("contactName"),
    contactEmail: get("contactEmail"),
    agentName: get("agentName"),
    agentEmail: get("agentEmail"),
    phone: get("phone"),
    notes: get("notes"),
  };
}

export async function createVendorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { org, actor } = await ctx();
  let vendorId: string;
  try {
    assertWritable(accessLevel(org));
    const vendor = await createVendor(org, actor, fields(formData));
    vendorId = vendor.id;

    // Attach the engagements the form named, so a new vendor is never a contact
    // with nothing being checked.
    const propertyIds = formData.getAll("propertyIds").map(String).filter(Boolean);
    const templateId =
      String(formData.get("requirementTemplateId") ?? "") ||
      org.settings?.defaultTemplateId ||
      (await listTemplates(org.id))[0]?.id;
    if (templateId) {
      for (const propertyId of propertyIds) {
        await createEngagement(org, actor, {
          vendorId: vendor.id,
          propertyId,
          requirementTemplateId: templateId,
        });
      }
    }
    if (propertyIds.length) await persistForVendor(org, vendor.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the vendor." };
  }
  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  redirect(`/vendors/${vendorId}`);
}

export async function updateVendorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { org, actor } = await ctx();
  const vendorId = String(formData.get("vendorId") ?? "");
  try {
    assertWritable(accessLevel(org));
    await updateVendor(org, actor, vendorId, fields(formData));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the vendor." };
  }
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  return { error: null, ok: "Saved." };
}

export async function addEngagementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { org, actor } = await ctx();
  const vendorId = String(formData.get("vendorId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  const requirementTemplateId = String(formData.get("requirementTemplateId") ?? "");
  try {
    assertWritable(accessLevel(org));
    if (!(await vendorById(org.id, vendorId))) throw new Error("That vendor is not in your registry.");
    if (!propertyId) throw new Error("Choose the property or project this vendor works on.");
    if (!requirementTemplateId) throw new Error("Choose the requirement this engagement is held to.");
    await createEngagement(org, actor, { vendorId, propertyId, requirementTemplateId });
    await persistForVendor(org, vendorId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the engagement." };
  }
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/dashboard");
  return { error: null, ok: "Engagement added." };
}

export async function endEngagementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { org, actor } = await ctx();
  const vendorId = String(formData.get("vendorId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  try {
    assertWritable(accessLevel(org));
    if (!(await vendorById(org.id, vendorId))) throw new Error("That vendor is not in your registry.");
    await endEngagement(org, actor, engagementId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not end the engagement." };
  }
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/dashboard");
  return { error: null, ok: "Engagement ended. Its history stays on file." };
}

export interface LinkState {
  error: string | null;
  url: string | null;
}

/** Mint a fresh upload link. The old one stops working immediately. */
export async function rotateUploadLinkAction(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const { org, actor } = await ctx();
  const vendorId = String(formData.get("vendorId") ?? "");
  try {
    const vendor = await vendorById(org.id, vendorId);
    if (!vendor) throw new Error("That vendor is not in your registry.");
    const token = await issueUploadToken(vendor.id);
    await appendAudit({
      orgId: org.id,
      actor,
      action: "vendor.link_issued",
      target: vendor.name,
      metadata: { vendorId: vendor.id, reason: "rotated from the vendor page" },
    });
    revalidatePath(`/vendors/${vendorId}`);
    return { error: null, url: uploadUrl(token) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not issue a link.", url: null };
  }
}

export interface ImportState {
  error: string | null;
  summary: ImportSummary | null;
}

export async function importVendorsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { org, actor } = await ctx();
  try {
    assertWritable(accessLevel(org));
    const pasted = String(formData.get("csv") ?? "").trim();
    const file = formData.get("file");
    let text = pasted;
    if (!text && file instanceof File && file.size > 0) {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("That file is over 2 MB. Split it, or paste the rows instead.");
      }
      text = await file.text();
    }
    if (!text) throw new Error("Choose a CSV file or paste the rows.");

    const templates = await listTemplates(org.id);
    const templateId =
      String(formData.get("requirementTemplateId") ?? "") ||
      org.settings?.defaultTemplateId ||
      templates[0]?.id;
    if (!templateId) {
      throw new Error("Add a requirement template first — imported engagements need one.");
    }

    const summary = await importVendorsCsv(org, actor, text, templateId);
    revalidatePath("/vendors");
    revalidatePath("/dashboard");
    return { error: null, summary };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not import that file.",
      summary: null,
    };
  }
}
