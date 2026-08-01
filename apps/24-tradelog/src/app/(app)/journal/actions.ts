"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { setups, tradeImages, trades, EMOTION_TAGS, type EmotionTag } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parsePrice } from "@/lib/money";
import { rMultipleFor } from "@/lib/pipeline";
import { plan } from "@/lib/plans";
import { recomputeFindings } from "@/lib/findings";
import { SETUP_COLORS, type SetupColor } from "@/db/schema";

export interface TradeFormState {
  error?: string;
  saved?: boolean;
}

/** 2 MB a chart, which is a generous PNG of a trading view. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function saveTradeAction(
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  const user = await requireUser();
  const db = getDb();
  const tradeId = String(formData.get("tradeId") ?? "");

  const [trade] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, user.id)));
  if (!trade) return { error: "That trade is not in your journal." };

  const limits = plan(user.plan);

  // --- stop price, and the R-multiple that follows from it ---
  const stopRaw = String(formData.get("stopPrice") ?? "").trim();
  let stopPrice = trade.stopPrice;
  if (stopRaw === "") {
    stopPrice = null;
  } else {
    try {
      stopPrice = parsePrice(stopRaw);
    } catch {
      return { error: `"${stopRaw}" is not a price. Leave it blank if you had no stop.` };
    }
    if (stopPrice <= 0n) return { error: "A stop has to be above zero." };
  }

  // --- setup ---
  const setupRaw = String(formData.get("setupId") ?? "");
  let setupId: string | null = trade.setupId;
  if (limits.setups) {
    if (setupRaw === "" || setupRaw === "none") {
      setupId = null;
    } else {
      const [owned] = await db
        .select()
        .from(setups)
        .where(and(eq(setups.id, setupRaw), eq(setups.userId, user.id)));
      if (!owned) return { error: "That setup is not one of yours." };
      setupId = owned.id;
    }
  }

  // --- emotion tags, from the fixed vocabulary only ---
  const submitted = formData.getAll("emotionTags").map(String);
  const emotionTags = EMOTION_TAGS.filter((tag) => submitted.includes(tag)) as EmotionTag[];

  const notes = String(formData.get("notes") ?? "").slice(0, 8_000);

  await db
    .update(trades)
    .set({
      stopPrice,
      rMultiple: rMultipleFor(
        {
          avgEntry: trade.avgEntry,
          qtyMax: trade.qtyMax,
          multiplierMilli: trade.multiplierMilli,
          netPnlCents: trade.netPnlCents,
        },
        stopPrice,
      ),
      setupId,
      emotionTags,
      notes: notes || null,
      reviewed: true,
      updatedAt: new Date(),
    })
    .where(eq(trades.id, trade.id));

  // A setup tag changes per-setup expectancy, which changes the findings.
  await recomputeFindings(user);

  revalidatePath(`/journal/${trade.id}`);
  revalidatePath("/journal");
  revalidatePath("/insights");
  return { saved: true };
}

export async function addTradeImageAction(
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  const user = await requireUser();
  if (!plan(user.plan).chartImages) {
    return { error: "Chart snapshots are a Trader feature." };
  }
  const db = getDb();
  const tradeId = String(formData.get("tradeId") ?? "");
  const [trade] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, user.id)));
  if (!trade) return { error: "That trade is not in your journal." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Chart snapshots must be PNG, JPEG, WebP or GIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the cap is 2 MB.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await db.insert(tradeImages).values({
    tradeId: trade.id,
    userId: user.id,
    mimeType: file.type,
    byteSize: bytes.byteLength,
    caption: String(formData.get("caption") ?? "").slice(0, 200) || null,
    bytes,
  });

  revalidatePath(`/journal/${trade.id}`);
  return { saved: true };
}

export async function deleteTradeImageAction(imageId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const [image] = await db
    .select()
    .from(tradeImages)
    .where(and(eq(tradeImages.id, imageId), eq(tradeImages.userId, user.id)));
  if (!image) return;
  await db.delete(tradeImages).where(eq(tradeImages.id, image.id));
  revalidatePath(`/journal/${image.tradeId}`);
}

/* ------------------------------------------------------------------ setups --- */

export interface SetupFormState {
  error?: string;
  saved?: boolean;
}

export async function createSetupAction(
  _prev: SetupFormState,
  formData: FormData,
): Promise<SetupFormState> {
  const user = await requireUser();
  if (!plan(user.plan).setups) {
    return { error: "Playbooks are a Trader feature." };
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (name.length < 2) return { error: "Give the setup a name you will recognise in six months." };
  const colorRaw = String(formData.get("color") ?? "blue");
  const color = (SETUP_COLORS as readonly string[]).includes(colorRaw)
    ? (colorRaw as SetupColor)
    : "blue";

  const db = getDb();
  const [clash] = await db
    .select()
    .from(setups)
    .where(and(eq(setups.userId, user.id), eq(setups.name, name)));
  if (clash) return { error: `You already have a setup called "${name}".` };

  await db.insert(setups).values({
    userId: user.id,
    name,
    color,
    rulesNotes: String(formData.get("rulesNotes") ?? "").slice(0, 2_000) || null,
  });

  revalidatePath("/journal/setups");
  return { saved: true };
}

export async function deleteSetupAction(setupId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const [owned] = await db
    .select()
    .from(setups)
    .where(and(eq(setups.id, setupId), eq(setups.userId, user.id)));
  if (!owned) return;
  // Untag first: the column is intentionally not a cascading FK, so a deleted
  // playbook cannot take trades with it.
  await db.update(trades).set({ setupId: null }).where(eq(trades.setupId, owned.id));
  await db.delete(setups).where(eq(setups.id, owned.id));
  await recomputeFindings(user);
  revalidatePath("/journal/setups");
}
