"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { households, issues, type EventVisibility, type IssueKind, type IssueStatus } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import type { Actor } from "@/lib/audit";
import { appendEvent, createIssue, sendNotice, setIssueStatus } from "@/lib/issues";
import { isAcceptedPhoto, MAX_UPLOAD_BYTES, objectKey, storage, stripJpegMetadata } from "@/lib/storage";

export interface IssueState {
  error?: string;
  ok?: string;
  issueId?: string;
}

function actorFor(user: { id: string; name: string }): Actor {
  return { kind: "user", id: user.id, name: user.name };
}

async function ownedIssue(associationId: string, issueId: string) {
  const [row] = await getDb()
    .select()
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.associationId, associationId)));
  if (!row) throw new Error("That issue is not on this association's log");
  return row;
}

/**
 * Store the photos attached to a form. EXIF is stripped from JPEGs before
 * anything is written — a violation photo should not carry the photographer's
 * GPS coordinates into permanent storage.
 */
export async function storePhotos(
  associationId: string,
  scopeId: string,
  files: File[],
): Promise<{ keys: string[]; rejected: string[] }> {
  const keys: string[] = [];
  const rejected: string[] = [];
  const adapter = storage();

  for (const file of files) {
    if (!file || file.size === 0) continue;
    if (file.size > MAX_UPLOAD_BYTES) {
      rejected.push(`${file.name} is over ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
      continue;
    }
    if (!isAcceptedPhoto(file.type)) {
      rejected.push(`${file.name} is a ${file.type || "unknown type"} — photos only`);
      continue;
    }
    const raw = Buffer.from(await file.arrayBuffer());
    const bytes = file.type === "image/jpeg" ? stripJpegMetadata(raw) : raw;
    const key = objectKey(associationId, "issues", scopeId, file.name);
    await adapter.put(key, bytes, file.type);
    keys.push(key);
  }
  return { keys, rejected };
}

export async function createIssueAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  try {
    const { association, user } = await requireCapability("issues");
    const kind = String(formData.get("kind") ?? "violation") as IssueKind;
    if (!["violation", "maintenance", "architectural"].includes(kind)) {
      return { error: "Pick what kind of issue this is" };
    }
    const householdIdRaw = String(formData.get("householdId") ?? "");
    let householdId: string | null = null;
    if (householdIdRaw && householdIdRaw !== "common") {
      const [row] = await getDb()
        .select()
        .from(households)
        .where(
          and(eq(households.id, householdIdRaw), eq(households.associationId, association.id)),
        );
      if (!row) return { error: "That household is not on this association's roster" };
      householdId = row.id;
    }

    const visibility = (String(formData.get("visibility") ?? "member_visible") ===
      "board_only"
      ? "board_only"
      : "member_visible") as EventVisibility;

    const issue = await createIssue(
      {
        associationId: association.id,
        householdId,
        kind,
        title: String(formData.get("title") ?? ""),
        body: String(formData.get("body") ?? ""),
        visibility,
      },
      actorFor(user),
    );

    const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const { keys, rejected } = await storePhotos(association.id, issue.id, files);
    if (keys.length > 0) {
      await appendEvent(
        issue.id,
        {
          body: `${keys.length} photo${keys.length === 1 ? "" : "s"} attached.`,
          visibility,
          photoKeys: keys,
        },
        actorFor(user),
      );
    }

    revalidatePath("/issues");
    return {
      issueId: issue.id,
      ok: `Opened as ${issue.number}.${rejected.length ? ` Not attached: ${rejected.join("; ")}.` : ""}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open that issue" };
  }
}

export async function appendEventAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  try {
    const { association, user } = await requireCapability("issues");
    const issueId = String(formData.get("issueId") ?? "");
    const issue = await ownedIssue(association.id, issueId);
    const body = String(formData.get("body") ?? "").trim();
    const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
    if (!body && files.every((f) => f.size === 0)) {
      return { error: "Write something, or attach a photo" };
    }
    const visibility = (String(formData.get("visibility") ?? "member_visible") === "board_only"
      ? "board_only"
      : "member_visible") as EventVisibility;

    const { keys, rejected } = await storePhotos(association.id, issue.id, files);
    await appendEvent(
      issueId,
      { body: body || `${keys.length} photo${keys.length === 1 ? "" : "s"} attached.`, visibility, photoKeys: keys },
      actorFor(user),
    );

    revalidatePath(`/issues/${issueId}`);
    return {
      ok:
        visibility === "board_only"
          ? `Added as a board-only note.${rejected.length ? ` Not attached: ${rejected.join("; ")}.` : ""}`
          : `Added to the household's timeline.${rejected.length ? ` Not attached: ${rejected.join("; ")}.` : ""}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add to the thread" };
  }
}

export async function setStatusAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  try {
    const { association, user } = await requireCapability("issues");
    const issueId = String(formData.get("issueId") ?? "");
    await ownedIssue(association.id, issueId);
    const status = String(formData.get("status") ?? "") as IssueStatus;
    if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
      return { error: "Pick a status" };
    }
    await setIssueStatus(issueId, status, String(formData.get("note") ?? ""), actorFor(user));
    revalidatePath(`/issues/${issueId}`);
    revalidatePath("/issues");
    return { ok: "Status changed, and the household can see the change." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not change the status" };
  }
}

export async function sendNoticeAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  try {
    const { association, user } = await requireCapability("issues");
    const issueId = String(formData.get("issueId") ?? "");
    await ownedIssue(association.id, issueId);
    const detail = String(formData.get("detail") ?? "").trim();
    if (!detail) return { error: "Say what the notice is about — this becomes the record" };
    const result = await sendNotice(issueId, detail, actorFor(user));
    revalidatePath(`/issues/${issueId}`);
    return {
      ok:
        result.sent > 0
          ? `Sent to ${result.sent} contact${result.sent === 1 ? "" : "s"}. The delivery outcome is now on the timeline.`
          : "Nothing could be delivered — this household has no email address on file. The attempt is on the timeline either way.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that notice" };
  }
}
