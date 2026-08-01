"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { signLease } from "@/lib/leases";

export interface SignState {
  error?: string;
  ok?: boolean;
  fullySigned?: boolean;
}

export async function signAction(_prev: SignState, form: FormData): Promise<SignState> {
  const token = String(form.get("token") ?? "");
  if (!form.get("agree")) return { error: "Tick the box to confirm you mean to sign" };

  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  const userAgent = h.get("user-agent") ?? "unknown";

  const result = await signLease({
    token,
    typedName: String(form.get("typedName") ?? ""),
    ip,
    userAgent,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/sign/${token}`);
  return { ok: true, fullySigned: result.fullySigned };
}
