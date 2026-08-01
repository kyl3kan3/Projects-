"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dismissFinding, recomputeFindings, restoreFinding, setWatching } from "@/lib/findings";

export async function dismissFindingAction(findingId: string): Promise<void> {
  const user = await requireUser();
  await dismissFinding(user.id, findingId);
  revalidatePath("/insights");
  revalidatePath("/dashboard");
}

export async function restoreFindingAction(findingId: string): Promise<void> {
  const user = await requireUser();
  await restoreFinding(user.id, findingId);
  revalidatePath("/insights");
}

export async function toggleWatchAction(findingId: string, watching: boolean): Promise<void> {
  const user = await requireUser();
  await setWatching(user.id, findingId, watching);
  revalidatePath("/insights");
  revalidatePath("/dashboard");
}

export async function recomputeAction(): Promise<void> {
  const user = await requireUser();
  await recomputeFindings(user);
  revalidatePath("/insights");
  revalidatePath("/dashboard");
}
