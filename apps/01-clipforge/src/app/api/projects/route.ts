import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { currentContext } from "@/lib/auth";
import { checkQuota, recordUpload } from "@/lib/billing";
import { enqueuePipeline } from "@/lib/queue";
import { planFor } from "@/lib/plans";
import { getDb } from "@/db";
import { projects } from "@/db/schema";

export async function GET() {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, ctx.workspace.id))
    .orderBy(desc(projects.createdAt))
    .limit(100);
  return NextResponse.json({ projects: rows });
}

const importSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url(),
  sourceType: z.enum(["youtube", "rss"]),
});

/** URL import path (YouTube/RSS). Worker downloads media then runs the pipeline. */
export async function POST(req: Request) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = importSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const quota = await checkQuota(ctx.workspace.id);
  if (!quota.allowed) {
    return NextResponse.json({ error: "over_limit", quota }, { status: 402 });
  }

  const db = getDb();
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: ctx.workspace.id,
      title: parsed.data.title,
      sourceType: parsed.data.sourceType,
      sourceUrl: parsed.data.url,
      status: "importing",
      createdBy: ctx.user.id,
    })
    .returning();

  await recordUpload(ctx.workspace.id, project.id);
  const plan = planFor(ctx.workspace.plan);
  await enqueuePipeline({
    type: "import_and_process",
    projectId: project.id,
    priority: plan.priorityRender,
  });

  return NextResponse.json({ projectId: project.id });
}
