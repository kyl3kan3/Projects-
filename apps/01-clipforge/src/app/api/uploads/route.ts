import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { currentContext } from "@/lib/auth";
import { checkQuota } from "@/lib/billing";
import { presignUpload } from "@/lib/r2";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { extForContentType } from "@/lib/utils";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  contentType: z.string(),
});

/** Step 1 of upload: create the project row and hand back a presigned PUT URL. */
export async function POST(req: Request) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const quota = await checkQuota(ctx.workspace.id);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "over_limit", quota, overageAvailable: quota.overageAvailable },
      { status: 402 },
    );
  }

  const ext = extForContentType(parsed.data.contentType);
  const key = `sources/${ctx.workspace.id}/${nanoid()}.${ext}`;

  const db = getDb();
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: ctx.workspace.id,
      title: parsed.data.title,
      sourceType: "upload",
      mediaKey: key,
      status: "uploaded",
      createdBy: ctx.user.id,
    })
    .returning();

  const uploadUrl = await presignUpload(key, parsed.data.contentType);
  return NextResponse.json({ projectId: project.id, key, uploadUrl });
}
