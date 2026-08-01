"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordConsent } from "@/lib/screening";

export interface ConsentState {
  error?: string;
  ok?: boolean;
}

/** The client IP, as far as it can be trusted behind a proxy. Evidence, not auth. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

export async function consentAction(_prev: ConsentState, form: FormData): Promise<ConsentState> {
  const token = String(form.get("token") ?? "");
  const typedName = String(form.get("typedName") ?? "");
  if (!form.get("agree")) return { error: "Tick the box to authorise the check" };

  const result = await recordConsent(token, typedName, await clientIp());
  if (!result.ok) return { error: result.error };
  revalidatePath(`/screen/${token}`);
  return { ok: true };
}
