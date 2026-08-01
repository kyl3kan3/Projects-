"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type Locale } from "@/db/schema";
import { clearSession, requireCrew, setCrewPin } from "@/lib/auth";

/**
 * The language switch. Per-user and persisted server-side, so a worker who
 * picks Spanish on the yard gets Spanish on every device, forever, without an
 * admin doing anything.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const { user } = await requireCrew();
  const requested = String(formData.get("locale") ?? "");
  const locale: Locale = requested === "es" ? "es" : "en";
  const db = getDb();
  await db.update(users).set({ locale }).where(eq(users.id, user.id));
  revalidatePath("/clock");
  revalidatePath("/hours");
  revalidatePath("/profile");
}

export async function changePinAction(formData: FormData): Promise<void> {
  const { user } = await requireCrew();
  const pin = String(formData.get("pin") ?? "");
  const confirm = String(formData.get("pinConfirm") ?? "");
  if (pin !== confirm) redirect("/profile?error=mismatch");
  try {
    await setCrewPin(user.id, pin);
  } catch {
    redirect("/profile?error=format");
  }
  redirect("/profile?saved=1");
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/join");
}
