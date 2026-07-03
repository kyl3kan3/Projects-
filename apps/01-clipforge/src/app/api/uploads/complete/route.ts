import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { currentContext } from "@/lib/auth";
import { recordUpload } from "@/lib/billing";
import { enqueuePipeline } from "@/lib/queue";
import { planFor } from "@/lib/plans";
import { getDb } from "@/db";
import { projects } from "@/db/schema";

const bodySchema = z.object({ projectId: z.string().uuid() });

/** Step 2 of upload: the browser finished PUTting to R2 — record usage + enqueue. */
export async function POST(req: Request) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, parsed.data.projectId),
        eq(projects.workspaceId, ctx.workspace.id),
      ),
    );
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recordUpload(ctx.workspace.id, project.id);

  const plan = planFor(ctx.workspace.plan);
  await enqueuePipeline({
    type: "process_project",
    projectId: project.id,
    priority: plan.priorityRender,
  });

  return NextResponse.json({ ok: true });
}
