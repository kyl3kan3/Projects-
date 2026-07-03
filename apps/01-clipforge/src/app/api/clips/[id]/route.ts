import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { currentContext } from "@/lib/auth";
import { getDb } from "@/db";
import { clips, projects } from "@/db/schema";
import { enqueuePipeline } from "@/lib/queue";
import { planFor } from "@/lib/plans";

const patchSchema = z.object({
  editedStartMs: z.number().int().nonnegative().optional(),
  editedEndMs: z.number().int().positive().optional(),
  captionStyle: z.enum(["bold-center", "clean-bottom", "pop-yellow"]).optional(),
});

/** Edit clip bounds/style and re-render on the fast lane. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = getDb();
  // Ensure the clip belongs to the caller's workspace.
  const [row] = await db
    .select({ clip: clips, workspaceId: projects.workspaceId })
    .from(clips)
    .innerJoin(projects, eq(clips.projectId, projects.id))
    .where(and(eq(clips.id, id), eq(projects.workspaceId, ctx.workspace.id)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(clips)
    .set({
      ...(parsed.data.editedStartMs != null ? { editedStartMs: parsed.data.editedStartMs } : {}),
      ...(parsed.data.editedEndMs != null ? { editedEndMs: parsed.data.editedEndMs } : {}),
      ...(parsed.data.captionStyle ? { captionStyle: parsed.data.captionStyle } : {}),
      status: "pending",
    })
    .where(eq(clips.id, id));

  const plan = planFor(ctx.workspace.plan);
  await enqueuePipeline({ type: "render_clip", clipId: id });
  void plan;

  return NextResponse.json({ ok: true });
}
