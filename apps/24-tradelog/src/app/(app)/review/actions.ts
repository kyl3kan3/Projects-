"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { saveReview } from "@/lib/review";
import type { FindingKind } from "@/lib/leaks";

export interface ReviewFormState {
  error?: string;
  saved?: boolean;
  completed?: boolean;
}

export async function saveReviewAction(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const user = await requireUser();
  const weekStart = String(formData.get("weekStart") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { error: "That is not a week." };

  const wentWell = String(formData.get("wentWell") ?? "").trim().slice(0, 4_000);
  const wentWrong = String(formData.get("wentWrong") ?? "").trim().slice(0, 4_000);
  const oneChange = String(formData.get("oneChange") ?? "").trim().slice(0, 4_000);
  const findingKind = (String(formData.get("findingKind") ?? "") || null) as FindingKind | null;

  // A review counts as done when all three questions are answered. Anything less
  // is saved as a draft — the streak is for the ritual, not for opening the page.
  const complete = Boolean(wentWell && wentWrong && oneChange);

  await saveReview(user.id, weekStart, {
    wentWell,
    wentWrong,
    oneChange,
    findingKind,
    complete,
  });

  revalidatePath("/review");
  return { saved: true, completed: complete };
}
