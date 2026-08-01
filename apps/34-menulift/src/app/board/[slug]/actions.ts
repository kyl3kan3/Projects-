"use server";

import { revalidatePath } from "next/cache";
import { boardLogin, clearBoardSession } from "@/lib/auth";

export interface PinState {
  error: string | null;
}

export async function pinLoginAction(_prev: PinState, formData: FormData): Promise<PinState> {
  const slug = String(formData.get("slug") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const name = String(formData.get("name") ?? "");
  try {
    await boardLogin(slug, pin, name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That PIN did not work" };
  }
  revalidatePath(`/board/${slug}`);
  return { error: null };
}

export async function endBoardSessionAction(slug: string): Promise<void> {
  await clearBoardSession();
  revalidatePath(`/board/${slug}`);
}
