"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { practices, users, type NoteFormat } from "@/db/schema";
import { requirePractice } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { requestMeta } from "@/lib/request";

export interface SettingsState {
  error?: string;
  ok?: boolean;
}

// A "use server" module may only export async functions, so the list lives here
// and the form component keeps its own copy for the <select>.
const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export async function saveSettingsAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { practice, user } = await requirePractice();
  const db = getDb();
  const meta = await requestMeta();

  const name = String(form.get("name") ?? "").trim();
  const credentials = String(form.get("credentials") ?? "").trim();
  const signatureBlock = String(form.get("signatureBlock") ?? "").trim();
  const defaultFormat = (String(form.get("defaultFormat") ?? "soap") ||
    "soap") as NoteFormat;
  const practiceName = String(form.get("practiceName") ?? "").trim();
  const timezone = String(form.get("timezone") ?? practice.timezone);
  const notify = form.get("notifyOnDraftReady") === "on";

  if (!name) return { error: "Enter your name" };
  if (!credentials) {
    return { error: "Enter your credentials — they appear on every signature" };
  }
  if (!practiceName) return { error: "Enter your practice name" };
  if (!ZONES.includes(timezone)) return { error: "Choose a supported timezone" };

  await db
    .update(users)
    .set({
      name,
      credentials,
      signatureBlock: signatureBlock || `${name}, ${credentials}`,
      defaultFormat,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await db
    .update(practices)
    .set({
      name: practiceName,
      timezone,
      settings: {
        ...(practice.settings ?? {}),
        defaultFormat,
        notifyOnDraftReady: notify,
      },
      updatedAt: new Date(),
    })
    .where(eq(practices.id, practice.id));

  await recordAudit({
    practiceId: practice.id,
    actorId: user.id,
    action: "settings_changed",
    targetKind: "user",
    targetId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { format: defaultFormat, reason: "profile" },
  });

  revalidatePath("/settings");
  return { ok: true };
}
