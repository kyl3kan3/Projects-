"use server";

/**
 * The tenant's server actions.
 *
 * Every one of these takes the portal token and resolves the tenancy from it. The
 * token is the credential; nothing else in the form is trusted. A request id or a
 * charge id from the client is checked against the tenancy the token opened before
 * it is used — see `requestBelongsToTenancy`.
 */

import { revalidatePath } from "next/cache";
import { openRequest, postMessage } from "@/lib/maintenance";
import { landlordIdForTenancy, portalByToken, requestBelongsToTenancy } from "@/lib/portal";
import { storeUpload } from "@/lib/storage";

export interface PortalState {
  error?: string;
  ok?: boolean;
  message?: string;
}

/** Tenants may upload at most this many photos in one message. */
const MAX_PHOTOS = 6;

async function storePhotos(tenancyId: string, form: FormData): Promise<string[]> {
  const landlordId = await landlordIdForTenancy(tenancyId);
  if (!landlordId) throw new Error("Could not work out where to store those photos");
  const keys: string[] = [];
  for (const entry of form.getAll("photos")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (keys.length >= MAX_PHOTOS) break;
    const bytes = Buffer.from(await entry.arrayBuffer());
    const put = await storeUpload(landlordId, "request", { bytes, contentType: entry.type });
    keys.push(put.key);
  }
  return keys;
}

export async function tenantOpenRequestAction(_prev: PortalState, form: FormData): Promise<PortalState> {
  const token = String(form.get("token") ?? "");
  const view = await portalByToken(token);
  if (!view) return { error: "That link is not valid any more. Ask your landlord for a new one." };

  try {
    const photoKeys = await storePhotos(view.tenancy.id, form);
    await openRequest({
      tenancyId: view.tenancy.id,
      title: String(form.get("title") ?? "").trim(),
      body: String(form.get("body") ?? "").trim(),
      photoKeys,
      openedBy: "tenant",
      priority: String(form.get("priority") ?? "routine") === "emergency" ? "emergency" : String(form.get("priority")) === "urgent" ? "urgent" : "routine",
    });
    revalidatePath(`/t/${token}`);
    return { ok: true, message: "Sent to your landlord. You will see their reply on this page." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that" };
  }
}

export async function tenantPostMessageAction(_prev: PortalState, form: FormData): Promise<PortalState> {
  const token = String(form.get("token") ?? "");
  const requestId = String(form.get("requestId") ?? "");
  const view = await portalByToken(token);
  if (!view) return { error: "That link is not valid any more" };
  if (!(await requestBelongsToTenancy(view.tenancy.id, requestId))) return { error: "That request is not yours" };

  try {
    const photoKeys = await storePhotos(view.tenancy.id, form);
    await postMessage(requestId, "tenant", String(form.get("body") ?? "").trim(), photoKeys);
    revalidatePath(`/t/${token}/requests/${requestId}`);
    return { ok: true, message: "Sent." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that message" };
  }
}
