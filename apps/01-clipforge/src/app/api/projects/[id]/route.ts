import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { currentContext } from "@/lib/auth";
import { getDb } from "@/db";
import { projects, clips, textOutputs, clipCandidates } from "@/db/schema";
import { signedAssetUrl } from "@/lib/r2";

/** Project detail + assets — polled by the project page while processing. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspace.id)));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [clipRows, textRows, candidateRows] = await Promise.all([
    db.select().from(clips).where(eq(clips.projectId, id)),
    db.select().from(textOutputs).where(eq(textOutputs.projectId, id)),
    db
      .select()
      .from(clipCandidates)
      .where(eq(clipCandidates.projectId, id))
      .orderBy(asc(clipCandidates.rank)),
  ]);

  const clipsWithUrls = await Promise.all(
    clipRows.map(async (c) => ({
      ...c,
      videoUrl: c.renderKey ? await signedAssetUrl(c.renderKey) : null,
      thumbnailUrl: c.thumbnailKey ? await signedAssetUrl(c.thumbnailKey) : null,
    })),
  );

  return NextResponse.json({
    project,
    clips: clipsWithUrls,
    textOutputs: textRows,
    candidates: candidateRows,
  });
}
