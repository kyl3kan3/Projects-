"use server";

import { redirect } from "next/navigation";
import { clearSession } from "@/lib/auth";

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
